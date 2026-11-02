import { Injectable } from "@nestjs/common";
import type {
  Availability,
  AvailabilityQuery,
  EarliestSlots,
  EarliestSlotsQuery,
  PublicBooking,
  SalonBooking,
  SalonBookingListQuery,
} from "@gugu/contracts";
import {
  addDays,
  computeSlots,
  dayBounds,
  isTerminal,
  MAX_AVAILABILITY_DAYS,
  toLocal,
  unavailableReason,
} from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import {
  type LocalizedName,
  loadAvailabilityInput,
  resolveSelection,
  type SalonBookingContext,
} from "../infra/booking-inputs";
import { AvailabilityCache } from "../infra/availability-cache";
import { BookingSecrets } from "../infra/booking-secrets";
import { BookingClock } from "./booking-clock";
import { bookingNotFound } from "./booking-errors";

const BOOKING_INCLUDE = {
  services: { include: { addOns: true } },
  // Resource units held by the booking (M6.6).
  occupancy: {
    where: { resourceUnitId: { not: null } },
    select: {
      unit: {
        select: { id: true, position: true, resource: { select: { id: true, name: true } } },
      },
    },
  },
} as const;
type BookingRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

const num = (v: bigint | null): number | null => (v === null ? null : Number(v));
const name = (v: Prisma.JsonValue | null): LocalizedName => {
  const o = (v ?? {}) as Partial<LocalizedName>;
  return { vi: o.vi ?? "", en: o.en ?? "" };
};

function core(b: BookingRow) {
  const line = b.services[0];
  if (!line) throw new Error(`booking ${b.id} has no service line`);
  return {
    id: b.id,
    referenceCode: b.referenceCode,
    status: b.status,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    staffId: b.staffId,
    service: {
      serviceId: line.serviceId,
      variantId: line.variantId,
      name: name(line.name),
      variantName: line.variantName === null ? null : name(line.variantName),
      durationMinutes: line.durationMinutes,
      bufferBeforeMinutes: line.bufferBeforeMinutes,
      bufferAfterMinutes: line.bufferAfterMinutes,
      priceMinor: Number(line.priceMinor),
      priceMaxMinor: num(line.priceMaxMinor),
      addOns: line.addOns.map((a) => ({
        addOnId: a.addOnId,
        name: name(a.name),
        extraDurationMinutes: a.extraDurationMinutes,
        extraPriceMinor: Number(a.extraPriceMinor),
        extraPriceMaxMinor: num(a.extraPriceMaxMinor),
      })),
    },
    totalPriceMinor: Number(b.totalPriceMinor),
    totalPriceMaxMinor: num(b.totalPriceMaxMinor),
    currency: b.currency,
    paymentMethod: "pay_at_salon" as const,
  };
}

/** Read side: availability (CRM and public page) and booking read models. */
@Injectable()
export class BookingQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: BookingClock,
    private readonly secrets: BookingSecrets,
    private readonly cache: AvailabilityCache,
  ) {}

  private scope(ctx: SalonBookingContext, kind: string) {
    return {
      salonId: ctx.salonId,
      availabilityVersion: ctx.availabilityVersion,
      now: this.clock.now(),
      kind,
    };
  }

  /** Cached (M6.7): see AvailabilityCache for the key and why staleness is safe. */
  async availability(
    ctx: SalonBookingContext,
    query: AvailabilityQuery,
    opts: { hideStaff: boolean; onlyStaffId?: string | null },
  ): Promise<Availability> {
    return this.cache.getOrCompute(this.scope(ctx, "availability"), { query, opts }, () =>
      this.computeAvailability(ctx, query, opts),
    );
  }

  private async computeAvailability(
    ctx: SalonBookingContext,
    query: AvailabilityQuery,
    opts: { hideStaff: boolean; onlyStaffId?: string | null },
  ): Promise<Availability> {
    const selection = await resolveSelection(this.prisma, ctx.salonId, {
      serviceId: query.serviceId,
      variantId: query.variantId ?? null,
      addOnIds: query.addOnIds,
    });
    const requested = opts.onlyStaffId ?? query.staffId ?? null;
    const staffIds = requested
      ? selection.staffTerms.has(requested)
        ? [requested]
        : []
      : [...selection.staffTerms.keys()];
    const input = await loadAvailabilityInput(this.prisma, ctx, selection, {
      from: query.from,
      to: query.to,
      staffIds,
      now: this.clock.now(),
    });
    const days = new Map<string, Availability["days"][number]["slots"]>();
    const slots = computeSlots(input);
    for (const slot of slots) {
      const date = toLocal(slot.start, ctx.timeZone).date;
      const first = slot.options[0];
      if (!first) continue;
      const list = days.get(date) ?? [];
      list.push({
        startsAt: new Date(slot.start).toISOString(),
        endsAt: new Date(first.end).toISOString(),
        staffIds: opts.hideStaff ? [] : slot.options.map((o) => o.staffId),
      });
      days.set(date, list);
    }
    return {
      timeZone: ctx.timeZone,
      durationMinutes: selection.terms.durationMinutes,
      days: [...days].map(([date, slots]) => ({ date, slots })),
      unavailableReason: days.size === 0 ? unavailableReason(input) : null,
    };
  }

  /**
   * Earliest free starts from `from` (default today) to the end of the booking window, scanned in
   * chunks of at most MAX_AVAILABILITY_DAYS; stops as soon as `limit` options are found.
   */
  async earliest(
    ctx: SalonBookingContext,
    query: EarliestSlotsQuery,
    opts: { onlyStaffId?: string | null },
  ): Promise<EarliestSlots> {
    return this.cache.getOrCompute(this.scope(ctx, "earliest"), { query, opts }, () =>
      this.computeEarliest(ctx, query, opts),
    );
  }

  private async computeEarliest(
    ctx: SalonBookingContext,
    query: EarliestSlotsQuery,
    opts: { onlyStaffId?: string | null },
  ): Promise<EarliestSlots> {
    const selection = await resolveSelection(this.prisma, ctx.salonId, {
      serviceId: query.serviceId,
      variantId: query.variantId ?? null,
      addOnIds: query.addOnIds,
    });
    const requested = opts.onlyStaffId ?? query.staffId ?? null;
    const staffIds = requested
      ? selection.staffTerms.has(requested)
        ? [requested]
        : []
      : [...selection.staffTerms.keys()];
    const now = this.clock.now();
    const today = toLocal(now.getTime(), ctx.timeZone).date;
    const last = addDays(today, ctx.settings.bookingWindowDays);
    let from = query.from && query.from > today ? query.from : today;
    const found: EarliestSlots["slots"] = [];
    const perDay = new Map<string, number>();
    let firstInput: Parameters<typeof unavailableReason>[0] | null = null;
    while (from <= last && found.length < query.limit) {
      const to = [addDays(from, MAX_AVAILABILITY_DAYS - 1), last].sort()[0] ?? last;
      const input = await loadAvailabilityInput(this.prisma, ctx, selection, {
        from,
        to,
        staffIds,
        now,
      });
      firstInput ??= input;
      for (const slot of computeSlots(input)) {
        const option = slot.options[0];
        if (!option) continue;
        const date = toLocal(slot.start, ctx.timeZone).date;
        const n = perDay.get(date) ?? 0;
        if (n >= query.perDay) continue;
        perDay.set(date, n + 1);
        found.push({
          date,
          startsAt: new Date(slot.start).toISOString(),
          endsAt: new Date(option.end).toISOString(),
          staffIds: slot.options.map((o) => o.staffId),
        });
        if (found.length >= query.limit) break;
      }
      if (staffIds.length === 0) break;
      from = addDays(to, 1);
    }
    return {
      timeZone: ctx.timeZone,
      durationMinutes: selection.terms.durationMinutes,
      slots: found,
      unavailableReason: found.length === 0 && firstInput ? unavailableReason(firstInput) : null,
    };
  }

  async list(
    ctx: SalonBookingContext,
    query: SalonBookingListQuery,
    onlyStaffId: string | null,
  ): Promise<SalonBooking[]> {
    const rows = await this.prisma.booking.findMany({
      where: {
        salonId: ctx.salonId,
        startsAt: {
          gte: new Date(dayBounds(query.from, ctx.timeZone).start),
          lt: new Date(dayBounds(query.to, ctx.timeZone).end),
        },
        ...(onlyStaffId
          ? { staffId: onlyStaffId }
          : query.staffId
            ? { staffId: query.staffId }
            : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: BOOKING_INCLUDE,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 2_000,
    });
    return rows.map((r) => this.toSalonBooking(r));
  }

  async get(
    ctx: SalonBookingContext,
    bookingId: string,
    onlyStaffId: string | null,
  ): Promise<SalonBooking> {
    const row = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        salonId: ctx.salonId,
        ...(onlyStaffId ? { staffId: onlyStaffId } : {}),
      },
      include: BOOKING_INCLUDE,
    });
    if (!row) throw bookingNotFound();
    return this.toSalonBooking(row);
  }

  private toSalonBooking(b: BookingRow): SalonBooking {
    return {
      ...core(b),
      source: b.source,
      customer:
        b.customerName === null ? null : { name: b.customerName, phone: b.customerPhoneE164 },
      identityVerified: b.identityVerified,
      note: b.customerNote,
      lateCancellation: b.lateCancellation,
      ruleOverrides: b.ruleOverrides.filter(
        (o): o is "hours" | "lead_time" | "horizon" =>
          o === "hours" || o === "lead_time" || o === "horizon",
      ),
      resources: b.occupancy.flatMap((o) =>
        o.unit
          ? [
              {
                resourceId: o.unit.resource.id,
                unitId: o.unit.id,
                name: o.unit.resource.name,
                position: o.unit.position,
              },
            ]
          : [],
      ),
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      version: b.version,
    };
  }

  /** Salon of a valid, unexpired manage token, with the booking id. */
  async resolveManageToken(token: string): Promise<{ bookingId: string; salonId: string } | null> {
    const row = await this.prisma.booking.findFirst({
      where: {
        manageTokenHash: this.secrets.manageTokenHash(token),
        manageTokenExpiresAt: { gt: this.clock.now() },
      },
      select: { id: true, salonId: true },
    });
    return row ? { bookingId: row.id, salonId: row.salonId } : null;
  }

  async publicView(ctx: SalonBookingContext, bookingId: string): Promise<PublicBooking> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, salonId: ctx.salonId },
      include: BOOKING_INCLUDE,
    });
    if (!row) throw bookingNotFound();
    const now = this.clock.now().getTime();
    const open =
      (row.status === "pending" || row.status === "confirmed") && !isTerminal(row.status);
    return {
      ...core(row),
      salon: { name: ctx.name, slug: ctx.slug, timeZone: ctx.timeZone },
      customerName: row.customerName ?? "",
      cancellable:
        open && now <= row.startsAt.getTime() - ctx.settings.cancellationCutoffMinutes * 60_000,
      reschedulable:
        open && now <= row.startsAt.getTime() - ctx.settings.rescheduleCutoffMinutes * 60_000,
    };
  }
}
