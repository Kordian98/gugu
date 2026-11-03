import { Injectable } from "@nestjs/common";
import {
  addDays,
  type CommissionLineInput,
  type CommissionPolicyVersion,
  dayBounds,
  type Interval,
  type LocalDate,
  type Month,
  monthDates,
  monthRange,
  type PayVersion,
  toLocal,
  workIntervals,
} from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

/** Injectable time source so tests can freeze "now" (skill `testing`). */
@Injectable()
export class PayrollClock {
  now(): Date {
    return new Date();
  }
}

export interface StaffMonthInput {
  id: string;
  displayName: string;
  removed: boolean;
  sortOrder: number;
  /** Last employed local date (removal day), null while employed. */
  employedUntil: LocalDate | null;
  workMinutesByDate: Map<LocalDate, number>;
}

export interface MonthLine extends CommissionLineInput {
  startsAt: Date;
  name: { vi: string; en: string };
}

export interface MonthData {
  salonId: string;
  timeZone: string;
  month: Month;
  staff: StaffMonthInput[];
  pay: Map<string, PayVersion[]>;
  /** Version ids per staff (same order as `pay`), for the settings API. */
  policy: CommissionPolicyVersion[];
  lines: MonthLine[];
  adjustments: {
    id: string;
    staffId: string;
    kind: "bonus" | "deduction" | "advance";
    amount: number;
    reason: string;
    createdAt: Date;
  }[];
  closed: {
    id: string;
    closedAt: Date | null;
    reopenedAt: Date | null;
    snapshot: unknown;
    payouts: { staffId: string; paidOn: LocalDate }[];
  } | null;
}

/** `DATE` columns come back as UTC midnight. */
export const dateOf = (d: Date): LocalDate => d.toISOString().slice(0, 10);
export const monthDate = (month: Month) => new Date(`${month}-01T00:00:00Z`);
/** Prisma maps `TIME` to a Date at 1970-01-01 UTC. */
const minuteOf = (t: Date) => t.getUTCHours() * 60 + t.getUTCMinutes();

type LineRow = {
  id: string;
  booking_id: string;
  staff_id: string;
  service_id: string;
  variant_id: string | null;
  name: unknown;
  price_minor: bigint;
  starts_at: Date;
  date: string;
  status: string;
  recorded: bigint | null;
  cost: bigint | null;
};

/**
 * Loads everything the payroll engine needs for one month of one salon, scoped by `salonId`
 * (tenant guard) and computed in the salon timezone. Lines are attributed by
 * `booking_services.staff_id` (ADR-0016); with `onlyStaffId` every line of bookings that member
 * worked on is loaded (the recorded amount is split pro rata over all lines), the caller filters.
 */
@Injectable()
export class PayrollData {
  constructor(private readonly prisma: PrismaService) {}

  async timeZone(salonId: string): Promise<string> {
    const s = await this.prisma.salon.findUniqueOrThrow({
      where: { id: salonId },
      select: { timezone: true },
    });
    return s.timezone;
  }

  /** Salon-local today. */
  async today(salonId: string, now: Date): Promise<LocalDate> {
    return toLocal(now.getTime(), await this.timeZone(salonId)).date;
  }

  async payVersions(salonId: string, staffId?: string) {
    const rows = await this.prisma.staffPaySetting.findMany({
      where: { salonId, ...(staffId ? { staffId } : {}) },
      orderBy: [{ staffId: "asc" }, { effectiveFrom: "desc" }],
      include: { overrides: { orderBy: [{ serviceId: "asc" }, { variantId: "asc" }] } },
    });
    return rows;
  }

  static toPayVersion(r: Awaited<ReturnType<PayrollData["payVersions"]>>[number]): PayVersion {
    return {
      effectiveFrom: dateOf(r.effectiveFrom),
      baseType: r.baseType,
      baseAmount: Number(r.baseAmountMinor),
      commissionBps: r.commissionBps,
      overrides: r.overrides.map((o) => ({
        serviceId: o.serviceId,
        variantId: o.variantId,
        rate:
          o.kind === "percent"
            ? { kind: "percent" as const, bps: o.bps ?? 0 }
            : { kind: "fixed" as const, amount: Number(o.amountMinor ?? 0n) },
      })),
    };
  }

  async policy(salonId: string): Promise<CommissionPolicyVersion[]> {
    const rows = await this.prisma.salonCommissionPolicy.findMany({
      where: { salonId },
      orderBy: { effectiveFrom: "desc" },
    });
    return rows.map((r) => ({ effectiveFrom: dateOf(r.effectiveFrom), base: r.base }));
  }

  async load(salonId: string, month: Month, onlyStaffId?: string): Promise<MonthData> {
    const timeZone = await this.timeZone(salonId);
    const { from, to } = monthRange(month);
    const start = new Date(dayBounds(from, timeZone).start);
    const end = new Date(dayBounds(to, timeZone).end);
    const [staffRows, versions, policy, lines, adjustments, closed] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where: {
          salonId,
          ...(onlyStaffId ? { id: onlyStaffId } : {}),
          OR: [{ deletedAt: null }, { deletedAt: { gte: start } }],
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          displayName: true,
          deletedAt: true,
          sortOrder: true,
          schedules: true,
          breaks: true,
          timeOff: { where: { startsAt: { lt: end }, endsAt: { gt: start } } },
        },
      }),
      this.payVersions(salonId, onlyStaffId),
      this.policy(salonId),
      this.lines(salonId, timeZone, start, end, onlyStaffId ?? null),
      this.prisma.payrollAdjustment.findMany({
        where: {
          salonId,
          month: monthDate(month),
          deletedAt: null,
          ...(onlyStaffId ? { staffId: onlyStaffId } : {}),
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.payrollMonth.findUnique({
        where: { salonId_month: { salonId, month: monthDate(month) } },
        include: { payouts: true },
      }),
    ]);
    const pay = new Map<string, PayVersion[]>();
    for (const v of versions) {
      const list = pay.get(v.staffId) ?? [];
      list.push(PayrollData.toPayVersion(v));
      pay.set(v.staffId, list);
    }
    const dates = monthDates(month);
    const staff = staffRows.map((s) => {
      const rules = {
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
        timeOff: s.timeOff.map((t): Interval => ({
          start: t.startsAt.getTime(),
          end: t.endsAt.getTime(),
        })),
      };
      const workMinutesByDate = new Map<LocalDate, number>();
      for (const d of dates) {
        const minutes = workIntervals(rules, d, d, timeZone).reduce(
          (n, w) => n + (w.end - w.start) / 60_000,
          0,
        );
        if (minutes > 0) workMinutesByDate.set(d, Math.round(minutes));
      }
      return {
        id: s.id,
        displayName: s.displayName,
        removed: s.deletedAt !== null,
        sortOrder: s.sortOrder,
        employedUntil: s.deletedAt ? toLocal(s.deletedAt.getTime(), timeZone).date : null,
        workMinutesByDate,
      };
    });
    return {
      salonId,
      timeZone,
      month,
      staff,
      pay,
      policy,
      lines,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        staffId: a.staffId,
        kind: a.kind,
        amount: Number(a.amountMinor),
        reason: a.reason,
        createdAt: a.createdAt,
      })),
      closed: closed
        ? {
            id: closed.id,
            closedAt: closed.closedAt,
            reopenedAt: closed.reopenedAt,
            snapshot: closed.snapshot,
            payouts: closed.payouts.map((p) => ({ staffId: p.staffId, paidOn: dateOf(p.paidOn) })),
          }
        : null,
    };
  }

  /**
   * Booking lines starting in [start, end): line price snapshot (incl. add-ons), the booking's
   * recorded amount, and today's execution cost (service/variant + add-ons; null when none set,
   * same rule as `margin.estimated`). One statement, index `booking_services(salon_id, staff_id,
   * starts_at)` / `bookings(salon_id, starts_at)`.
   */
  private async lines(
    salonId: string,
    timeZone: string,
    start: Date,
    end: Date,
    onlyStaffId: string | null,
  ): Promise<MonthLine[]> {
    const rows = await this.prisma.$queryRaw<LineRow[]>`
      WITH mine AS (
        SELECT DISTINCT x.booking_id FROM booking_services x
        WHERE x.salon_id = ${salonId}::uuid AND x.starts_at >= ${start} AND x.starts_at < ${end}
          AND (${onlyStaffId}::uuid IS NULL OR x.staff_id = ${onlyStaffId}::uuid)
      )
      SELECT bs.id, bs.booking_id, bs.staff_id, bs.service_id, bs.variant_id, bs.name,
        bs.price_minor, bs.starts_at,
        to_char((bs.starts_at AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS date,
        b.status::text AS status, o.amount_minor AS recorded,
        CASE WHEN coalesce(v.cost_amount_minor, s.cost_amount_minor) IS NULL THEN NULL
          ELSE coalesce(v.cost_amount_minor, s.cost_amount_minor) + coalesce(ad.cost, 0) END AS cost
      FROM mine m
      JOIN booking_services bs ON bs.booking_id = m.booking_id AND bs.salon_id = ${salonId}::uuid
      JOIN bookings b ON b.id = bs.booking_id AND b.salon_id = bs.salon_id
      JOIN services s ON s.id = bs.service_id AND s.salon_id = bs.salon_id
      LEFT JOIN service_variants v ON v.id = bs.variant_id AND v.salon_id = bs.salon_id
      LEFT JOIN offline_sales o ON o.booking_id = b.id AND o.salon_id = b.salon_id
      LEFT JOIN LATERAL (
        SELECT sum(coalesce(a.extra_cost_amount_minor, 0))::bigint AS cost
        FROM booking_service_addons x
        JOIN service_addons a ON a.id = x.add_on_id AND a.salon_id = x.salon_id
        WHERE x.booking_service_id = bs.id AND x.salon_id = bs.salon_id
      ) ad ON true
      ORDER BY bs.starts_at, bs.booking_id, bs.sequence`;
    return rows.map((r) => {
      const n = (r.name ?? {}) as Partial<Record<"vi" | "en", string>>;
      return {
        lineId: r.id,
        bookingId: r.booking_id,
        staffId: r.staff_id,
        serviceId: r.service_id,
        variantId: r.variant_id,
        date: r.date,
        status: r.status,
        price: Number(r.price_minor),
        cost: r.cost === null ? null : Number(r.cost),
        recordedForBooking: r.recorded === null ? null : Number(r.recorded),
        startsAt: r.starts_at,
        name: { vi: n.vi ?? "", en: n.en ?? n.vi ?? "" },
      };
    });
  }

  /** No-show share over the 90 days before today (finished = completed + no-show). */
  async noShowHistory(salonId: string, now: Date): Promise<{ noShows: number; finished: number }> {
    const timeZone = await this.timeZone(salonId);
    const today = toLocal(now.getTime(), timeZone).date;
    const start = new Date(dayBounds(addDays(today, -90), timeZone).start);
    const [r] = await this.prisma.$queryRaw<{ no_shows: bigint; finished: bigint }[]>`
      SELECT count(*) FILTER (WHERE status = 'no_show') AS no_shows,
        count(*) FILTER (WHERE status IN ('completed', 'no_show')) AS finished
      FROM bookings
      WHERE salon_id = ${salonId}::uuid AND starts_at >= ${start} AND starts_at < ${now}`;
    return { noShows: Number(r?.no_shows ?? 0), finished: Number(r?.finished ?? 0) };
  }
}
