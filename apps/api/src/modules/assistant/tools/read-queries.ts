import { Injectable } from "@nestjs/common";
import type { BookingStatusValue } from "@gugu/contracts";
import { dayBounds, type Interval, type LocalDate, toLocal, utilization } from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/** Statuses that occupy staff time and count as expected revenue. */
export const ACTIVE_STATUSES: BookingStatusValue[] = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
];

/**
 * Tenant-scoped read models for the assistant's tools (topic 08 A1). Every query takes `salonId`
 * from the tool context. Returns entity ids; the tools turn them into tokens.
 */
@Injectable()
export class AssistantReadQueries {
  constructor(private readonly prisma: PrismaService) {}

  range(from: LocalDate, to: LocalDate, timeZone: string): { gte: Date; lt: Date } {
    return {
      gte: new Date(dayBounds(from, timeZone).start),
      lt: new Date(dayBounds(to, timeZone).end),
    };
  }

  bookings(
    salonId: string,
    from: LocalDate,
    to: LocalDate,
    timeZone: string,
    statuses: BookingStatusValue[],
    take?: number,
  ) {
    return this.prisma.booking.findMany({
      where: {
        salonId,
        startsAt: this.range(from, to, timeZone),
        ...(statuses.length ? { status: { in: statuses } } : {}),
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      ...(take ? { take } : {}),
      select: {
        id: true,
        status: true,
        source: true,
        staffId: true,
        startsAt: true,
        endsAt: true,
        totalPriceMinor: true,
        services: { select: { serviceId: true }, orderBy: { sequence: "asc" } },
      },
    });
  }

  countBookings(
    salonId: string,
    from: LocalDate,
    to: LocalDate,
    timeZone: string,
    statuses: BookingStatusValue[],
  ) {
    return this.prisma.booking.count({
      where: {
        salonId,
        startsAt: this.range(from, to, timeZone),
        ...(statuses.length ? { status: { in: statuses } } : {}),
      },
    });
  }

  async revenue(salonId: string, from: LocalDate, to: LocalDate, timeZone: string) {
    const startsAt = this.range(from, to, timeZone);
    const [estimated, offline] = await Promise.all([
      this.prisma.booking.aggregate({
        where: { salonId, startsAt, status: { in: ["confirmed", "checked_in", "completed"] } },
        _sum: { totalPriceMinor: true },
        _count: { _all: true },
      }),
      this.prisma.offlineSale.aggregate({
        where: { salonId, booking: { startsAt } },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
    ]);
    return {
      estimatedVnd: Number(estimated._sum.totalPriceMinor ?? 0n),
      estimatedBookings: estimated._count._all,
      offlineVnd: Number(offline._sum.amountMinor ?? 0n),
      offlineBookings: offline._count._all,
    };
  }

  /** Utilisation per bookable staff member over the period. */
  async utilization(salonId: string, from: LocalDate, to: LocalDate, timeZone: string) {
    const range = this.range(from, to, timeZone);
    const staff = await this.prisma.staffProfile.findMany({
      where: { salonId, deletedAt: null, isBookable: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        schedules: true,
        breaks: true,
        timeOff: { where: { startsAt: { lt: range.lt }, endsAt: { gt: range.gte } } },
        bookings: {
          where: {
            startsAt: { lt: range.lt },
            endsAt: { gt: range.gte },
            status: { in: ACTIVE_STATUSES },
          },
          select: { startsAt: true, endsAt: true },
        },
      },
    });
    return staff.map((s) => ({
      staffId: s.id,
      ...utilization(
        {
          schedules: s.schedules.map((r) => ({
            weekday: r.weekday,
            startMinute: minuteOf(r.startsAt),
            endMinute: minuteOf(r.endsAt) || 1440,
            effectiveFrom: dateOf(r.effectiveFrom),
            effectiveTo: r.effectiveTo ? dateOf(r.effectiveTo) : null,
          })),
          breaks: s.breaks.map((b) => ({
            weekday: b.weekday,
            date: b.date ? dateOf(b.date) : null,
            startMinute: minuteOf(b.startsAt),
            endMinute: minuteOf(b.endsAt),
          })),
          timeOff: s.timeOff.map((t) => interval(t.startsAt, t.endsAt)),
          booked: s.bookings.map((b) => interval(b.startsAt, b.endsAt)),
        },
        from,
        to,
        timeZone,
      ),
    }));
  }

  localDate(at: Date, timeZone: string): LocalDate {
    return toLocal(at.getTime(), timeZone).date;
  }
}

/** Prisma maps `TIME` to a Date at 1970-01-01 UTC. */
const minuteOf = (t: Date) => t.getUTCHours() * 60 + t.getUTCMinutes();
/** Prisma maps `DATE` to a Date at UTC midnight. */
const dateOf = (d: Date) => d.toISOString().slice(0, 10);
const interval = (a: Date, b: Date): Interval => ({ start: a.getTime(), end: b.getTime() });
