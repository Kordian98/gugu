import { Injectable } from "@nestjs/common";
import { BOOKING_ERRORS, type BookingSource } from "@gugu/contracts";
import {
  decideInitialStatus,
  findSlot,
  type LinePlan,
  requiredOverrides,
  type RuleOverride,
  type ServiceTerms,
  toLocal,
  UPCOMING_BOOKING_STATUSES,
} from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { appendOutbox } from "../../../infrastructure/outbox/outbox.writer";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import {
  loadChainInput,
  type ResolvedSelection,
  type SalonBookingContext,
  type ServiceSelection,
} from "../infra/booking-inputs";
import { OutboxRelay } from "../../../infrastructure/outbox/outbox.relay";
import { AvailabilityCache } from "../infra/availability-cache";
import { BookingSecrets, MANAGE_TOKEN_TTL_AFTER_END_MS } from "../infra/booking-secrets";
import { claimIdempotency, completeIdempotency, type IdempotencyClaim } from "../infra/idempotency";
import {
  convertHold,
  insertOccupancy,
  isSlotConflict,
  lockPhone,
  lockClaims,
  releaseExpiredHolds,
} from "../infra/occupancy";
import type { BookingActor } from "./booking-actor";
import { BookingFeatures, chainInput, type LineRequest, resolveChain } from "./booking-chain";
import { BookingClock } from "./booking-clock";
import { slotTaken, unbookable } from "./booking-errors";

export interface CreateBookingRequest {
  source: BookingSource;
  /** First service, its staff (null = any) and the appointment start. */
  selection: ServiceSelection & { staffId: string | null; startsAt: Date };
  /** Further services in sequence (M6.8, flag `booking.multiService`); omitted = single. */
  nextServices?: readonly LineRequest[];
  /** E.164 already normalised; null only for anonymous walk-ins. */
  customer: { name: string; phoneE164: string } | null;
  note: string | null;
  overrides: readonly RuleOverride[];
  overrideReason: string | null;
  holdId: string | null;
}

type Tx = Prisma.TransactionClient;

/** Σ line prices; a range as soon as one line is a range (M6.8). */
export function chainTotal(terms: readonly ServiceTerms[]): { min: number; max: number | null } {
  const min = terms.reduce((sum, t) => sum + t.priceMinor, 0);
  const ranged = terms.some((t) => t.priceMaxMinor !== null);
  return {
    min,
    max: ranged ? terms.reduce((sum, t) => sum + (t.priceMaxMinor ?? t.priceMinor), 0) : null,
  };
}

/**
 * The one booking write path for every source (spec 06 §3.6): idempotency → validate selection →
 * lock staff (and phone) → drop expired holds → revalidate with the pure engine → insert booking,
 * snapshots, occupancy, status history, outbox event — all in one transaction.
 */
@Injectable()
export class CreateBookingCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: BookingSecrets,
    private readonly clock: BookingClock,
    private readonly audit: AuditService,
    private readonly cache: AvailabilityCache,
    private readonly outbox: OutboxRelay,
    private readonly features: BookingFeatures,
  ) {}

  async execute(
    ctx: SalonBookingContext,
    actor: BookingActor,
    req: CreateBookingRequest,
    claim: IdempotencyClaim,
  ): Promise<{ bookingId: string; manageToken: string | null }> {
    const now = this.clock.now();
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const claimed = await claimIdempotency<{ bookingId: string }>(tx, claim, now);
          const bookingId =
            claimed.kind === "replay"
              ? claimed.body.bookingId
              : (await this.create(tx, ctx, actor, req, now)).bookingId;
          if (claimed.kind === "new") await completeIdempotency(tx, claimed.id, 201, { bookingId });
          // Customers get a manage link. Only its hash is stored, so a replay rotates it.
          const manageToken =
            actor.kind === "customer" ? await this.rotateManageToken(tx, bookingId) : null;
          return { bookingId, manageToken };
        },
        { timeout: 20_000, maxWait: 15_000 },
      );
      await this.cache.bumpOccupancy(ctx.salonId);
      // Publish the outbox events of this commit now instead of on the relay's fallback tick.
      await this.outbox.kick();
      return result;
    } catch (error) {
      if (isSlotConflict(error)) throw slotTaken();
      throw error;
    }
  }

  private async create(
    tx: Tx,
    ctx: SalonBookingContext,
    actor: BookingActor,
    req: CreateBookingRequest,
    now: Date,
  ): Promise<{ bookingId: string }> {
    const { salonId, settings } = ctx;
    if (actor.kind === "system") throw new Error("system actor cannot create bookings");
    this.checkOverrides(actor, req.overrides);
    const requests: LineRequest[] = [req.selection, ...(req.nextServices ?? [])];
    this.features.assertChainAllowed(requests);
    const selections = await resolveChain(tx, salonId, requests);
    const candidates = selections.map((sel, i) =>
      this.candidates(ctx, actor, sel.staffTerms, requests[i]?.staffId ?? null),
    );
    const phoneHash = req.customer ? this.secrets.phoneHash(req.customer.phoneE164) : null;

    // One sorted lock list over every staff member and unit any line may claim (ADR-0008).
    const staffIds = [...new Set(candidates.flat())];
    const unitIds = [...new Set(selections.flatMap((sel) => sel.units.map((u) => u.unitId)))];
    await lockClaims(tx, [...staffIds, ...unitIds]);
    if (actor.kind === "customer" && phoneHash) {
      await lockPhone(tx, salonId, phoneHash);
      await this.checkActiveLimit(tx, ctx, phoneHash, now);
    }
    await releaseExpiredHolds(tx, salonId, staffIds, now, unitIds);

    let holdId: string | null = null;
    if (actor.kind === "customer") {
      // Holds cover a single service (public page, unrouted — X23); chains revalidate in full.
      holdId =
        requests.length === 1
          ? await this.usableHold(tx, salonId, actor.deviceHash, req, now)
          : null;
      if (holdId) {
        const hold = await tx.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
        candidates[0] = [hold.staffId];
      }
      await tx.bookingHold.deleteMany({
        where: {
          salonId,
          deviceHash: actor.deviceHash,
          ...(holdId ? { id: { not: holdId } } : {}),
        },
      });
    }

    const start = req.selection.startsAt.getTime();
    const date = toLocal(start, ctx.timeZone).date;
    const input = await loadChainInput(tx, ctx, chainInput(selections, candidates), {
      from: date,
      to: date,
      now,
      overrides: new Set(req.overrides),
      exclude: { holdId },
    });
    const firstCandidates = candidates[0] ?? [];
    const staffFilter = firstCandidates.length === 1 ? (firstCandidates[0] ?? null) : null;
    const option = findSlot(input, start, staffFilter)?.options[0];
    if (!option) {
      // Only salon members can act on "outside the rules"; customers (Zalo bot) just see taken.
      throw actor.kind === "salon_member"
        ? unbookable(requiredOverrides(input, start, staffFilter), req.overrides)
        : slotTaken();
    }
    const lineTerms = option.lines.map((l, i) => selections[i]?.staffTerms.get(l.staffId));
    if (lineTerms.some((t) => !t) || lineTerms.length !== selections.length) throw slotTaken();
    const terms = lineTerms as ServiceTerms[];
    // Record and audit only the overrides this booking really needed (audit review).
    const applied =
      req.overrides.length === 0
        ? []
        : (requiredOverrides(input, start, option.staffId, req.overrides) ?? [...req.overrides]);

    const isFirstVisit =
      phoneHash && settings.confirmNewClients
        ? (await tx.booking.count({
            where: { salonId, customerPhoneHash: phoneHash, status: "completed" },
          })) === 0
        : true;
    const decision = decideInitialStatus({
      actorType: actor.kind,
      source: req.source,
      identityVerified: false,
      isFirstVisit,
      confirmationMode: settings.confirmationMode,
      confirmNewClients: settings.confirmNewClients,
    });
    if (decision.kind !== "booking") {
      throw new AppError(422, BOOKING_ERRORS.invalidActorSource, "Source not allowed for caller");
    }

    const total = chainTotal(terms);
    const booking = await tx.booking.create({
      data: {
        salonId,
        referenceCode: await this.uniqueReference(tx, salonId),
        status: decision.status,
        source: req.source,
        createdByActorType: actor.kind,
        createdByUserId: actor.kind === "salon_member" ? actor.userId : null,
        customerUserId: actor.kind === "customer" ? actor.userId : null,
        customerName: req.customer?.name ?? null,
        customerPhoneE164: req.customer?.phoneE164 ?? null,
        customerPhoneHash: phoneHash,
        customerNote: req.note,
        staffId: option.staffId,
        startsAt: new Date(option.start),
        endsAt: new Date(option.end),
        totalPriceMinor: BigInt(total.min),
        totalPriceMaxMinor: total.max === null ? null : BigInt(total.max),
        currency: selections[0]?.currency ?? ctx.currency,
        ruleOverrides: applied,
        overrideReason: applied.length > 0 ? req.overrideReason : null,
        pendingExpiresAt:
          decision.status === "pending"
            ? new Date(now.getTime() + settings.manualConfirmWindowHours * 3_600_000)
            : null,
      },
      select: { id: true },
    });

    for (const [i, plan] of option.lines.entries()) {
      await this.insertLine(tx, salonId, booking.id, i + 1, selections[i], terms[i], plan);
    }
    await tx.bookingStatusHistory.create({
      data: {
        salonId,
        bookingId: booking.id,
        fromStatus: null,
        toStatus: decision.status,
        actorType: actor.kind,
        actorId: actor.userId,
      },
    });

    if (holdId) {
      await convertHold(tx, holdId, booking.id);
    } else {
      // One staff row + one row per unit for every line (the EXCLUDE constraints guard each).
      for (const plan of option.lines) {
        await insertOccupancy(tx, {
          salonId,
          staffId: plan.staffId,
          unitIds: plan.unitIds,
          period: plan.occupancy,
          booking: booking.id,
        });
      }
    }

    await appendOutbox(tx, {
      salonId,
      aggregateType: "booking",
      aggregateId: booking.id,
      type: "booking.created",
      payload: {
        bookingId: booking.id,
        status: decision.status,
        source: req.source,
        staffId: option.staffId,
        // Every staff member of the chain (M6.8): notifications reach each of them.
        staffIds: [...new Set(option.lines.map((l) => l.staffId))],
        serviceCount: option.lines.length,
        startsAt: new Date(option.start).toISOString(),
        // Booking version and actor: notification idempotency keys and "changed by someone else".
        version: 1,
        actorType: actor.kind,
        actorId: actor.kind === "salon_member" ? actor.userId : null,
      },
    });
    if (applied.length > 0 && actor.kind === "salon_member") {
      await this.audit.record(
        {
          action: "booking.rules_overridden",
          actor: { type: "user", id: actor.userId },
          salonId,
          targetType: "booking",
          targetId: booking.id,
          metadata: { overrides: applied.join(","), phase: "create" },
        },
        tx,
      );
    }
    return { bookingId: booking.id };
  }

  /** One booking_services row (+ add-ons) with its snapshots (never updated afterwards). */
  private async insertLine(
    tx: Tx,
    salonId: string,
    bookingId: string,
    sequence: number,
    selection: ResolvedSelection | undefined,
    terms: ServiceTerms | undefined,
    plan: LinePlan,
  ): Promise<void> {
    if (!selection || !terms) throw slotTaken();
    const line = await tx.bookingService.create({
      data: {
        salonId,
        bookingId,
        sequence,
        serviceId: selection.serviceId,
        variantId: selection.variantId,
        staffId: plan.staffId,
        startsAt: new Date(plan.start),
        endsAt: new Date(plan.end),
        name: { ...selection.name },
        ...(selection.variantName ? { variantName: { ...selection.variantName } } : {}),
        durationMinutes: terms.durationMinutes,
        bufferBeforeMinutes: terms.bufferBeforeMinutes,
        bufferAfterMinutes: terms.bufferAfterMinutes,
        priceMinor: BigInt(terms.priceMinor),
        priceMaxMinor: terms.priceMaxMinor === null ? null : BigInt(terms.priceMaxMinor),
        currency: selection.currency,
      },
      select: { id: true },
    });
    if (selection.addOns.length > 0) {
      await tx.bookingServiceAddOn.createMany({
        data: selection.addOns.map((a) => ({
          salonId,
          bookingServiceId: line.id,
          addOnId: a.id,
          name: { ...a.name },
          extraDurationMinutes: a.extraDurationMinutes,
          extraPriceMinor: BigInt(a.extraPriceMinor),
          extraPriceMaxMinor: a.extraPriceMaxMinor === null ? null : BigInt(a.extraPriceMaxMinor),
        })),
      });
    }
  }

  private async rotateManageToken(tx: Tx, bookingId: string): Promise<string> {
    const { token, hash } = this.secrets.issueManageToken();
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        manageTokenHash: hash,
        manageTokenExpiresAt: new Date(booking.endsAt.getTime() + MANAGE_TOKEN_TTL_AFTER_END_MS),
      },
    });
    return token;
  }

  private checkOverrides(actor: BookingActor, overrides: readonly RuleOverride[]): void {
    if (overrides.length === 0) return;
    if (actor.kind !== "salon_member" || !actor.canOverride) {
      throw new AppError(403, BOOKING_ERRORS.overrideNotAllowed, "Rule overrides not allowed");
    }
  }

  private candidates(
    ctx: SalonBookingContext,
    actor: BookingActor,
    staffTerms: ReadonlyMap<string, unknown>,
    requestedStaffId: string | null,
  ): string[] {
    let staffId = requestedStaffId;
    if (actor.kind === "salon_member" && actor.ownStaffId) {
      // Staff with `bookings.write.own` book only into their own calendar.
      if (staffId !== null && staffId !== actor.ownStaffId) {
        throw new AppError(403, COMMON_ERRORS.forbidden, "Only your own calendar", {
          errors: [{ path: "staffId", code: COMMON_ERRORS.forbidden }],
        });
      }
      staffId = actor.ownStaffId;
    }
    if (staffId === null) {
      const all = [...staffTerms.keys()];
      if (all.length === 0) throw slotTaken();
      return all;
    }
    if (actor.kind === "customer" && ctx.settings.hideStaffChoice) {
      throw new AppError(422, BOOKING_ERRORS.staffSelectionDisabled, "Staff choice is disabled", {
        errors: [{ path: "staffId", code: BOOKING_ERRORS.staffSelectionDisabled }],
      });
    }
    if (!staffTerms.has(staffId)) {
      throw new AppError(
        422,
        BOOKING_ERRORS.serviceUnavailable,
        "Staff member can't do this service",
        {
          errors: [{ path: "staffId", code: BOOKING_ERRORS.serviceUnavailable }],
        },
      );
    }
    return [staffId];
  }

  /** Per-phone active-booking limit for customer self-service (q15, spec 06 §3.11). */
  private async checkActiveLimit(
    tx: Tx,
    ctx: SalonBookingContext,
    phoneHash: string,
    now: Date,
  ): Promise<void> {
    const active = await tx.booking.count({
      where: {
        salonId: ctx.salonId,
        customerPhoneHash: phoneHash,
        status: { in: [...UPCOMING_BOOKING_STATUSES] },
        endsAt: { gt: now },
      },
    });
    if (active >= ctx.settings.maxActiveBookingsPerPhone) {
      throw new AppError(429, BOOKING_ERRORS.activeLimitReached, "Too many upcoming bookings", {
        detail: "This phone number already has the maximum number of upcoming bookings here.",
      });
    }
  }

  /** The caller's own unexpired hold for exactly this selection, if any. */
  private async usableHold(
    tx: Tx,
    salonId: string,
    deviceHash: string,
    req: CreateBookingRequest,
    now: Date,
  ): Promise<string | null> {
    if (!req.holdId) return null;
    const hold = await tx.bookingHold.findFirst({
      where: { id: req.holdId, salonId, deviceHash, expiresAt: { gt: now } },
    });
    if (!hold) return null;
    const sameAddOns =
      [...hold.addOnIds].sort().join() === [...new Set(req.selection.addOnIds)].sort().join();
    const matches =
      hold.serviceId === req.selection.serviceId &&
      hold.variantId === req.selection.variantId &&
      sameAddOns &&
      hold.startsAt.getTime() === req.selection.startsAt.getTime() &&
      (req.selection.staffId === null || req.selection.staffId === hold.staffId);
    return matches ? hold.id : null;
  }

  private async uniqueReference(tx: Tx, salonId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.secrets.referenceCode();
      const taken = await tx.booking.count({ where: { salonId, referenceCode: code } });
      if (taken === 0) return code;
    }
    throw new Error("could not allocate a booking reference code");
  }
}
