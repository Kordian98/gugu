import { Injectable } from "@nestjs/common";
import { BOOKING_ERRORS, type BookingStatusValue } from "@gugu/contracts";
import {
  canReschedule,
  evaluateTransition,
  findSlot,
  requiredOverrides,
  type RuleOverride,
  type ServiceTerms,
  toLocal,
  type TransitionActor,
} from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { appendOutbox } from "../../../infrastructure/outbox/outbox.writer";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import {
  loadAvailabilityInput,
  resolveSelection,
  type SalonBookingContext,
} from "../infra/booking-inputs";
import { OutboxRelay } from "../../../infrastructure/outbox/outbox.relay";
import { AvailabilityCache } from "../infra/availability-cache";
import { BookingSecrets, MANAGE_TOKEN_TTL_AFTER_END_MS } from "../infra/booking-secrets";
import { claimIdempotency, completeIdempotency, type IdempotencyClaim } from "../infra/idempotency";
import {
  deactivateBookingOccupancy,
  deleteBookingOccupancy,
  insertOccupancy,
  isSlotConflict,
  lockClaims,
  releaseExpiredHolds,
} from "../infra/occupancy";
import type { BookingActor } from "./booking-actor";
import { BookingClock } from "./booking-clock";
import {
  bookingNotFound,
  rescheduleError,
  slotTaken,
  transitionError,
  unbookable,
} from "./booking-errors";

type Tx = Prisma.TransactionClient;
type Result = { bookingId: string; manageToken?: string };

const transitionActor = (actor: BookingActor): TransitionActor =>
  actor.kind === "salon_member" ? "salon" : actor.kind;

/** Staff limited to their own calendar never see other bookings (404, not 403). */
const ownScope = (actor: BookingActor): { staffId?: string } =>
  actor.kind === "salon_member" && actor.ownStaffId ? { staffId: actor.ownStaffId } : {};

const actorId = (actor: BookingActor): string | null =>
  actor.kind === "system" ? null : actor.userId;

/**
 * Status changes and reschedules (spec 06 §3.7–3.8). Every status change writes
 * booking_status_history and an outbox event; cancellations and no-shows release the time.
 */
@Injectable()
export class BookingLifecycleCommands {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: BookingClock,
    private readonly audit: AuditService,
    private readonly secrets: BookingSecrets,
    private readonly cache: AvailabilityCache,
    private readonly outbox: OutboxRelay,
  ) {}

  private async run(
    salonId: string,
    claim: IdempotencyClaim | null,
    work: (tx: Tx, now: Date) => Promise<Result>,
  ): Promise<Result> {
    const now = this.clock.now();
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          if (!claim) return work(tx, now);
          const claimed = await claimIdempotency<Result>(tx, claim, now);
          if (claimed.kind === "replay") return claimed.body;
          const result = await work(tx, now);
          // Never persist a raw manage token in the idempotency row.
          await completeIdempotency(tx, claimed.id, 200, { bookingId: result.bookingId });
          return result;
        },
        { timeout: 20_000, maxWait: 15_000 },
      );
      // Status changes and reschedules change occupancy: new availability cache generation.
      await this.cache.bumpOccupancy(salonId);
      // Publish the outbox events of this commit now instead of on the relay's fallback tick.
      await this.outbox.kick();
      return result;
    } catch (error) {
      if (isSlotConflict(error)) throw slotTaken();
      throw error;
    }
  }

  async transition(
    ctx: SalonBookingContext,
    actor: BookingActor,
    bookingId: string,
    input: { to: BookingStatusValue; reason: string | null; reasonCode?: string },
    claim: IdempotencyClaim | null,
  ): Promise<Result> {
    return this.run(ctx.salonId, claim, async (tx, now) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, salonId: ctx.salonId, ...ownScope(actor) },
      });
      if (!booking) throw bookingNotFound();
      const result = evaluateTransition({
        from: booking.status,
        to: input.to,
        actor: transitionActor(actor),
        canCorrect: actor.kind === "salon_member" && actor.canCorrect,
        now: now.getTime(),
        startsAt: booking.startsAt.getTime(),
        endsAt: booking.endsAt.getTime(),
        cancelCutoffMinutes: ctx.settings.cancellationCutoffMinutes,
        reason: input.reason,
      });
      if (!result.ok) throw transitionError(result.code);

      const isCancel = input.to === "cancelled_by_customer" || input.to === "cancelled_by_salon";
      const updated = await tx.booking.updateMany({
        where: { id: booking.id, version: booking.version },
        data: {
          status: input.to,
          version: { increment: 1 },
          pendingExpiresAt: null,
          ...(result.lateCancellation ? { lateCancellation: true } : {}),
          // Cancelling revokes the customer's manage link (security review).
          ...(isCancel
            ? {
                cancellationReason: input.reason ?? input.reasonCode ?? null,
                manageTokenHash: null,
                manageTokenExpiresAt: null,
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, COMMON_ERRORS.conflict, "Booking changed meanwhile; reload it");
      }
      if (!result.keepsOccupancy) await deactivateBookingOccupancy(tx, booking.id);
      await tx.bookingStatusHistory.create({
        data: {
          salonId: ctx.salonId,
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: input.to,
          actorType: actor.kind,
          actorId: actorId(actor),
          reasonCode: input.reasonCode ?? null,
          reasonText: input.reason ?? null,
        },
      });
      await appendOutbox(tx, {
        salonId: ctx.salonId,
        aggregateType: "booking",
        aggregateId: booking.id,
        type: "booking.status_changed",
        payload: {
          bookingId: booking.id,
          from: booking.status,
          to: input.to,
          lateCancellation: result.lateCancellation,
          actorType: actor.kind,
          actorId: actorId(actor),
          version: booking.version + 1,
        },
      });
      const isCorrection =
        (booking.status === "no_show" && input.to === "completed") ||
        (booking.status === "completed" && input.to === "no_show");
      if (isCorrection && actor.kind === "salon_member") {
        await this.audit.record(
          {
            action: "booking.status_corrected",
            actor: { type: "user", id: actor.userId },
            salonId: ctx.salonId,
            targetType: "booking",
            targetId: booking.id,
            metadata: { from: booking.status, to: input.to },
          },
          tx,
        );
      }
      return { bookingId: booking.id };
    });
  }

  async reschedule(
    ctx: SalonBookingContext,
    actor: BookingActor,
    bookingId: string,
    input: {
      startsAt: Date;
      /** undefined = keep, null = any staff. Customers always keep. */
      staffId?: string | null;
      overrides: readonly RuleOverride[];
      overrideReason: string | null;
    },
    claim: IdempotencyClaim,
  ): Promise<Result> {
    return this.run(ctx.salonId, claim, async (tx, now) => {
      if (actor.kind === "system") throw new Error("system actor cannot reschedule");
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, salonId: ctx.salonId, ...ownScope(actor) },
        include: { services: { include: { addOns: true } } },
      });
      const line = booking?.services[0];
      if (!booking || !line) throw bookingNotFound();
      const check = canReschedule({
        status: booking.status,
        actor: actor.kind === "customer" ? "customer" : "salon",
        now: now.getTime(),
        startsAt: booking.startsAt.getTime(),
        rescheduleCutoffMinutes: ctx.settings.rescheduleCutoffMinutes,
      });
      if (!check.ok) throw rescheduleError(check.code);
      if (input.overrides.length > 0 && !(actor.kind === "salon_member" && actor.canOverride)) {
        throw new AppError(403, BOOKING_ERRORS.overrideNotAllowed, "Rule overrides not allowed");
      }

      // Eligibility from today's team setup; length and buffers from the booking's snapshot.
      const selection = await resolveSelection(tx, ctx.salonId, {
        serviceId: line.serviceId,
        variantId: line.variantId,
        addOnIds: [],
      });
      const snapshot: ServiceTerms = {
        baseDurationMinutes: line.durationMinutes,
        durationMinutes: line.durationMinutes,
        bufferBeforeMinutes: line.bufferBeforeMinutes,
        bufferAfterMinutes: line.bufferAfterMinutes,
        basePriceMinor: Number(line.priceMinor),
        basePriceMaxMinor: line.priceMaxMinor === null ? null : Number(line.priceMaxMinor),
        priceMinor: Number(line.priceMinor),
        priceMaxMinor: line.priceMaxMinor === null ? null : Number(line.priceMaxMinor),
      };
      for (const id of selection.staffTerms.keys()) selection.staffTerms.set(id, snapshot);
      // The booked staff member stays eligible even if since unassigned; nobody else does.
      selection.staffTerms.set(booking.staffId, snapshot);
      const ownOnly = actor.kind === "salon_member" && actor.ownStaffId !== null;
      const wanted =
        actor.kind === "customer" || ownOnly || input.staffId === undefined
          ? booking.staffId
          : input.staffId;
      if (wanted !== null && !selection.staffTerms.has(wanted)) {
        throw new AppError(
          422,
          BOOKING_ERRORS.serviceUnavailable,
          "Staff member can't do this service",
          {
            errors: [{ path: "staffId", code: BOOKING_ERRORS.serviceUnavailable }],
          },
        );
      }
      const candidates = wanted === null ? [...selection.staffTerms.keys()] : [wanted];

      const unitIds = selection.units.map((u) => u.unitId);
      await lockClaims(tx, [...candidates, booking.staffId, ...unitIds]);
      await releaseExpiredHolds(tx, ctx.salonId, candidates, now, unitIds);
      const start = input.startsAt.getTime();
      const date = toLocal(start, ctx.timeZone).date;
      const availability = await loadAvailabilityInput(tx, ctx, selection, {
        from: date,
        to: date,
        staffIds: candidates,
        now,
        overrides: new Set(input.overrides),
        exclude: { bookingId: booking.id },
      });
      const option = findSlot(availability, start, wanted)?.options[0];
      if (!option) {
        throw actor.kind === "salon_member"
          ? unbookable(requiredOverrides(availability, start, wanted), input.overrides)
          : slotTaken();
      }

      const applied =
        input.overrides.length === 0
          ? []
          : (requiredOverrides(availability, start, option.staffId, input.overrides) ?? [
              ...input.overrides,
            ]);
      const rotated = actor.kind === "customer" ? this.secrets.issueManageToken() : null;
      await deleteBookingOccupancy(tx, booking.id);
      await insertOccupancy(tx, {
        salonId: ctx.salonId,
        staffId: option.staffId,
        unitIds: option.unitIds,
        period: option.occupancy,
        booking: booking.id,
      });
      const updated = await tx.booking.updateMany({
        where: { id: booking.id, version: booking.version },
        data: {
          startsAt: new Date(option.start),
          endsAt: new Date(option.end),
          staffId: option.staffId,
          version: { increment: 1 },
          ...(booking.manageTokenHash
            ? {
                manageTokenExpiresAt: new Date(option.end + MANAGE_TOKEN_TTL_AFTER_END_MS),
                // The customer moved it themselves: rotate the link they act through.
                ...(rotated ? { manageTokenHash: rotated.hash } : {}),
              }
            : {}),
          ...(applied.length > 0
            ? {
                ruleOverrides: [...new Set([...booking.ruleOverrides, ...applied])],
                overrideReason: input.overrideReason,
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new AppError(409, COMMON_ERRORS.conflict, "Booking changed meanwhile; reload it");
      }
      await tx.bookingService.update({
        where: { id: line.id },
        data: {
          startsAt: new Date(option.start),
          endsAt: new Date(option.end),
          staffId: option.staffId,
        },
      });
      await appendOutbox(tx, {
        salonId: ctx.salonId,
        aggregateType: "booking",
        aggregateId: booking.id,
        type: "booking.rescheduled",
        payload: {
          bookingId: booking.id,
          fromStartsAt: booking.startsAt.toISOString(),
          toStartsAt: new Date(option.start).toISOString(),
          fromStaffId: booking.staffId,
          toStaffId: option.staffId,
          actorType: actor.kind,
          actorId: actor.kind === "salon_member" ? actor.userId : null,
          version: booking.version + 1,
        },
      });
      await this.audit.record(
        {
          action: applied.length > 0 ? "booking.rules_overridden" : "booking.rescheduled",
          actor:
            actor.kind === "salon_member"
              ? { type: "user", id: actor.userId }
              : { type: "anonymous" },
          salonId: ctx.salonId,
          targetType: "booking",
          targetId: booking.id,
          metadata: {
            from: booking.startsAt.toISOString(),
            to: new Date(option.start).toISOString(),
            overrides: applied.join(",") || null,
          },
        },
        tx,
      );
      return { bookingId: booking.id, ...(rotated ? { manageToken: rotated.token } : {}) };
    });
  }
}
