import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { BOOKING_ERRORS } from "@gugu/contracts";
import { addDays, toLocal, UPCOMING_BOOKING_STATUSES } from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import {
  type BookingActor,
  BookingContexts,
  BookingFeatures,
  BookingLifecycleCommands,
  BookingQueries,
  CreateBookingCommand,
  type SalonBookingContext,
} from "../../bookings/bookings.facade";
import {
  BOOKING_DAYS,
  type BotBooking,
  type BotPorts,
  type BotService,
  type Selection,
} from "../domain/bot/types";
import { ZaloClock } from "./zalo-clock";

type Localized = { vi?: string; en?: string } | null;
const pick = (v: unknown, locale: "vi" | "en"): string => {
  const o = (v ?? {}) as Localized;
  return (locale === "en" ? o?.en || o?.vi : o?.vi || o?.en) ?? "";
};

const SLOT_TAKEN_CODES: readonly string[] = [
  BOOKING_ERRORS.slotTaken,
  BOOKING_ERRORS.serviceUnavailable,
];
const TOO_LATE_CODES: readonly string[] = [
  BOOKING_ERRORS.cancelWindowPassed,
  BOOKING_ERRORS.rescheduleWindowPassed,
  BOOKING_ERRORS.tooLate,
  BOOKING_ERRORS.invalidTransition,
];

export interface BotConversationRef {
  id: string;
  salonId: string;
  displayName: string | null;
  phoneE164: string | null;
}

/**
 * BotPorts over the booking engine facade (topic 06): availability for the next 7 days, booking as
 * the customer with source `zalo_oa`, customer cancel/reschedule (cutoffs enforced by the engine).
 * Bookings made here are linked to the conversation (zalo_booking_links) for reminders and actions.
 */
@Injectable()
export class BotPortsFactory {
  private readonly logger = new Logger(BotPortsFactory.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: BookingContexts,
    private readonly queries: BookingQueries,
    private readonly create: CreateBookingCommand,
    private readonly lifecycle: BookingLifecycleCommands,
    private readonly clock: ZaloClock,
    private readonly features: BookingFeatures,
  ) {}

  /**
   * `actionKey` identifies the inbound event being handled: engine writes made while handling it are
   * idempotent on it, so a retried job replays instead of booking twice.
   */
  async forConversation(
    conv: BotConversationRef,
    locale: "vi" | "en",
    actionKey: string,
  ): Promise<BotPorts> {
    // Backstop for q89: a salon suspended by GuGu never gets bot ports (no booking, no cancel).
    // InboundService already answers suspended salons with the neutral notice instead; this
    // throws 403 `salon.suspended` if a suspension lands between that check and here.
    await this.contexts.assertWritable(conv.salonId);
    const ctx = await this.contexts.forSalon(conv.salonId);
    // The customer acts as themself; the device hash keys holds/idempotency to this conversation.
    const actor: BookingActor = {
      kind: "customer",
      userId: null,
      deviceHash: createHash("sha256").update(`zalo:${conv.id}`).digest("base64url"),
    };
    const salonId = conv.salonId;
    const services = memo(() => this.services(salonId, locale));

    return {
      salon: {
        name: ctx.name,
        timeZone: ctx.timeZone,
        hideStaffChoice: ctx.settings.hideStaffChoice,
        multiService: this.features.multiService,
      },
      customer: { name: conv.displayName, phone: conv.phoneE164 },
      services,
      staffFor: (serviceId, variantId) => this.staffFor(salonId, serviceId, variantId),
      days: async (sel) => {
        const today = toLocal(this.clock.now().getTime(), ctx.timeZone).date;
        const availability = await this.availability(
          ctx,
          sel,
          today,
          addDays(today, BOOKING_DAYS - 1),
        );
        return availability.days.filter((d) => d.slots.length > 0).map((d) => d.date);
      },
      slots: async (sel, date) => {
        const availability = await this.availability(ctx, sel, date, date);
        return availability.days.flatMap((d) => d.slots.map((s) => s.startsAt));
      },
      explainNoDays: async (sel) => {
        const today = toLocal(this.clock.now().getTime(), ctx.timeZone).date;
        const range = await this.availability(ctx, sel, today, addDays(today, BOOKING_DAYS - 1));
        const reason = range.unavailableReason;
        const earliest =
          reason === "fully_booked" || reason === null
            ? await this.queries.earliest(
                ctx,
                {
                  serviceId: sel.serviceId,
                  ...(sel.variantId ? { variantId: sel.variantId } : {}),
                  addOnIds: [],
                  ...(sel.staffId ? { staffId: sel.staffId } : {}),
                  nextServices: nextServices(sel),
                  from: addDays(today, BOOKING_DAYS),
                  limit: 3,
                  perDay: 1,
                },
                {},
              )
            : null;
        return {
          reason: reason ?? earliest?.unavailableReason ?? null,
          windowDays: ctx.settings.bookingWindowDays,
          earliest: earliest?.slots.map((s) => s.startsAt) ?? [],
        };
      },
      upcoming: () => this.upcoming(conv.id, salonId, locale),
      book: async (sel, startsAt, phone, name) => {
        try {
          const { bookingId } = await this.create.execute(
            ctx,
            actor,
            {
              source: "zalo_oa",
              selection: {
                serviceId: sel.serviceId,
                variantId: sel.variantId,
                addOnIds: [],
                staffId: sel.staffId,
                startsAt: new Date(startsAt),
              },
              nextServices: nextServices(sel).map((n) => ({
                serviceId: n.serviceId,
                variantId: n.variantId ?? null,
                addOnIds: [],
                staffId: null,
              })),
              customer: { name, phoneE164: phone },
              note: null,
              overrides: [],
              overrideReason: null,
              holdId: null,
            },
            this.claim(
              actor,
              "zalo.bot.book",
              `${actionKey}:${sel.serviceId}:${sel.second?.serviceId ?? ""}:${startsAt}`,
            ),
          );
          await this.prisma.zaloBookingLink.upsert({
            where: { bookingId },
            create: { bookingId, salonId, conversationId: conv.id },
            update: {},
          });
          const booking = (await this.upcoming(conv.id, salonId, locale)).find(
            (b) => b.id === bookingId,
          );
          if (!booking) return { ok: false, reason: "failed" };
          return { ok: true, booking, pending: booking.status === "pending" };
        } catch (error) {
          if (error instanceof AppError && SLOT_TAKEN_CODES.includes(error.code)) {
            return { ok: false, reason: "slot_taken" };
          }
          if (error instanceof AppError && error.code === BOOKING_ERRORS.activeLimitReached) {
            return { ok: false, reason: "limit_reached" };
          }
          this.logger.warn({ salonId, err: describe(error) }, "zalo bot booking failed");
          return { ok: false, reason: "failed" };
        }
      },
      cancel: async (bookingId) => {
        if (!(await this.isLinked(conv.id, bookingId))) return "not_found";
        try {
          await this.lifecycle.transition(
            ctx,
            actor,
            bookingId,
            { to: "cancelled_by_customer", reason: null, reasonCode: "zalo_chat" },
            null,
          );
          return "ok";
        } catch (error) {
          if (error instanceof AppError && TOO_LATE_CODES.includes(error.code)) return "too_late";
          if (error instanceof AppError && error.code === BOOKING_ERRORS.notFound)
            return "not_found";
          this.logger.warn({ salonId, err: describe(error) }, "zalo bot cancel failed");
          return "failed";
        }
      },
      reschedule: async (bookingId, startsAt) => {
        if (!(await this.isLinked(conv.id, bookingId))) return { ok: false, reason: "not_found" };
        try {
          await this.lifecycle.reschedule(
            ctx,
            actor,
            bookingId,
            { startsAt: new Date(startsAt), overrides: [], overrideReason: null },
            this.claim(actor, "zalo.bot.reschedule", `${actionKey}:${bookingId}:${startsAt}`),
          );
          const booking = (await this.upcoming(conv.id, salonId, locale)).find(
            (b) => b.id === bookingId,
          );
          return booking ? { ok: true, booking } : { ok: false, reason: "failed" };
        } catch (error) {
          if (error instanceof AppError && SLOT_TAKEN_CODES.includes(error.code)) {
            return { ok: false, reason: "slot_taken" };
          }
          if (error instanceof AppError && TOO_LATE_CODES.includes(error.code)) {
            return { ok: false, reason: "too_late" };
          }
          if (error instanceof AppError && error.code === BOOKING_ERRORS.notFound) {
            return { ok: false, reason: "not_found" };
          }
          this.logger.warn({ salonId, err: describe(error) }, "zalo bot reschedule failed");
          return { ok: false, reason: "failed" };
        }
      },
      confirmAttendance: async (bookingId) => {
        const updated = await this.prisma.zaloBookingLink.updateMany({
          where: { bookingId, salonId, conversationId: conv.id },
          data: { customerConfirmedAt: this.clock.now() },
        });
        return updated.count === 1 ? "ok" : "not_found";
      },
    };
  }

  private claim(actor: BookingActor, route: string, key: string) {
    const digest = createHash("sha256").update(key).digest("base64url").slice(0, 40);
    return {
      scope: actor.kind === "customer" ? `device:${actor.deviceHash}` : "system",
      route,
      key: `zalo-${digest}`,
      requestHash: digest,
    };
  }

  private availability(ctx: SalonBookingContext, sel: Selection, from: string, to: string) {
    return this.queries.availability(
      ctx,
      {
        serviceId: sel.serviceId,
        ...(sel.variantId ? { variantId: sel.variantId } : {}),
        addOnIds: [],
        ...(sel.staffId ? { staffId: sel.staffId } : {}),
        nextServices: nextServices(sel),
        from,
        to,
      },
      { hideStaff: false },
    );
  }

  private async isLinked(conversationId: string, bookingId: string): Promise<boolean> {
    return (
      (await this.prisma.zaloBookingLink.count({ where: { conversationId, bookingId } })) === 1
    );
  }

  private async services(salonId: string, locale: "vi" | "en"): Promise<BotService[]> {
    const rows = await this.prisma.service.findMany({
      where: {
        salonId,
        isActive: true,
        deletedAt: null,
        staff: { some: { staff: { isBookable: true, deletedAt: null } } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        variants: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    return rows.map((s) => {
      const base = {
        priceMinor: Number(s.priceAmountMinor),
        priceMaxMinor: s.priceMaxAmountMinor === null ? null : Number(s.priceMaxAmountMinor),
        durationMinutes: s.durationMinutes,
      };
      return {
        id: s.id,
        name: pick(s.name, locale),
        ...base,
        variants: s.variants.map((v) => ({
          id: v.id,
          name: pick(v.name, locale),
          priceMinor: v.priceAmountMinor === null ? base.priceMinor : Number(v.priceAmountMinor),
          priceMaxMinor: v.priceMaxAmountMinor === null ? null : Number(v.priceMaxAmountMinor),
          durationMinutes: v.durationMinutes ?? base.durationMinutes,
        })),
      };
    });
  }

  private async staffFor(salonId: string, serviceId: string, variantId: string | null) {
    const rows = await this.prisma.staffService.findMany({
      where: {
        salonId,
        serviceId,
        OR: [{ variantId: null }, ...(variantId ? [{ variantId }] : [])],
        staff: { isBookable: true, deletedAt: null },
      },
      select: { staff: { select: { id: true, displayName: true, sortOrder: true } } },
    });
    const unique = new Map(rows.map((r) => [r.staff.id, r.staff]));
    return [...unique.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.id, name: s.displayName }));
  }

  async upcoming(
    conversationId: string,
    salonId: string,
    locale: "vi" | "en",
  ): Promise<BotBooking[]> {
    const rows = await this.prisma.booking.findMany({
      where: {
        salonId,
        zaloLink: { conversationId },
        status: { in: [...UPCOMING_BOOKING_STATUSES] },
        startsAt: { gt: this.clock.now() },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: {
        services: { orderBy: { sequence: "asc" } },
        staff: { select: { displayName: true } },
      },
    });
    return rows.map((b) => {
      const line = b.services[0];
      const second = b.services[1];
      return {
        id: b.id,
        ref: b.referenceCode,
        startsAt: b.startsAt.toISOString(),
        serviceId: line?.serviceId ?? "",
        variantId: line?.variantId ?? null,
        second: second?.serviceId
          ? { serviceId: second.serviceId, variantId: second.variantId }
          : null,
        serviceCount: b.services.length,
        staffId: b.staffId,
        serviceName: b.services.map((l) => pick(l.name, locale)).join(" + "),
        staffName: b.staff.displayName,
        priceMinor: Number(b.totalPriceMinor),
        priceMaxMinor: b.totalPriceMaxMinor === null ? null : Number(b.totalPriceMaxMinor),
        status: b.status,
      };
    });
  }
}

/** The bot's optional second service as engine `nextServices` (M6.8). */
function nextServices(sel: Selection): { serviceId: string; variantId?: string; addOnIds: [] }[] {
  return sel.second
    ? [
        {
          serviceId: sel.second.serviceId,
          ...(sel.second.variantId ? { variantId: sel.second.variantId } : {}),
          addOnIds: [],
        },
      ]
    : [];
}

function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | null = null;
  return () => (value ??= fn());
}

function describe(error: unknown): string {
  return error instanceof AppError ? error.code : error instanceof Error ? error.name : "unknown";
}
