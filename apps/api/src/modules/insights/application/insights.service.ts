import { Injectable } from "@nestjs/common";
import type { Insights } from "@gugu/contracts";
import {
  dayBounds,
  METRICS,
  METRIC_KEYS,
  type MetricKey,
  previousPeriod,
  ratio,
} from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { CrmScope } from "../../salon-crm/salon-crm.facade";

type Counts = {
  total: bigint;
  active: bigint;
  completed: bigint;
  checked_in: bigint;
  no_show: bigint;
  cancelled: bigint;
  revenue: bigint;
  offline: bigint;
  new_customers: bigint;
  returning: bigint;
};

/**
 * Computes the metric catalogue (packages/domain/src/metrics) for a period and the previous one,
 * plus daily series and breakdowns (07 M7.8). One SQL statement per block, all over bookings
 * that start in the period in the salon timezone; own-scope readers only see their own.
 */
@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(ctx: SalonContext, scope: CrmScope, from: string, to: string): Promise<Insights> {
    const salon = await this.prisma.salon.findUniqueOrThrow({
      where: { id: ctx.salonId },
      select: { timezone: true },
    });
    const tz = salon.timezone;
    const prev = previousPeriod(from, to);
    const [now, before] = await Promise.all([
      this.counts(ctx.salonId, scope, from, to, tz),
      this.counts(ctx.salonId, scope, prev.from, prev.to, tz),
    ]);
    const values = (c: Counts): Record<MetricKey, number | null> => ({
      "appointments.count": Number(c.active),
      "appointments.completed": Number(c.completed),
      "customers.new": Number(c.new_customers),
      "customers.returning": Number(c.returning),
      "no_show.rate": ratio(
        Number(c.no_show),
        Number(c.completed) + Number(c.checked_in) + Number(c.no_show),
      ),
      "cancellation.rate": ratio(Number(c.cancelled), Number(c.total)),
      "revenue.estimated": Number(c.revenue),
      "revenue.offline_recorded": Number(c.offline),
    });
    const cur = values(now);
    const old = values(before);
    const metrics: Insights["metrics"] = {};
    for (const key of METRIC_KEYS) {
      const def = METRICS[key];
      metrics[key] = {
        value: cur[key],
        previous: old[key],
        unit: def.unit,
        revenueKind: "revenueKind" in def ? def.revenueKind : null,
      };
    }
    const start = new Date(dayBounds(from, tz).start);
    const end = new Date(dayBounds(to, tz).end);
    const own = scope.staffId;
    const [daily, services, sources, staff] = await Promise.all([
      this.prisma.$queryRaw<
        { date: string; appointments: bigint; completed: bigint; revenue: bigint }[]
      >`
        SELECT to_char((b.starts_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS date,
          count(*) FILTER (WHERE b.status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')) AS appointments,
          count(*) FILTER (WHERE b.status = 'completed') AS completed,
          coalesce(sum(b.total_price_minor) FILTER (WHERE b.status = 'completed'), 0) AS revenue
        FROM bookings b
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND (${own}::uuid IS NULL OR b.staff_id = ${own}::uuid)
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        { service_id: string; name: unknown; count: bigint; revenue: bigint }[]
      >`
        SELECT bs.service_id, (array_agg(bs.name ORDER BY b.starts_at DESC))[1] AS name,
          count(*) AS count, coalesce(sum(b.total_price_minor), 0) AS revenue
        FROM bookings b JOIN booking_services bs ON bs.booking_id = b.id AND bs.salon_id = b.salon_id
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND b.status = 'completed' AND (${own}::uuid IS NULL OR b.staff_id = ${own}::uuid)
        GROUP BY bs.service_id ORDER BY count DESC LIMIT 10`,
      this.prisma.$queryRaw<{ source: Insights["sources"][number]["source"]; count: bigint }[]>`
        SELECT b.source::text AS source, count(*) AS count FROM bookings b
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')
          AND (${own}::uuid IS NULL OR b.staff_id = ${own}::uuid)
        GROUP BY 1 ORDER BY 2 DESC`,
      this.prisma.$queryRaw<
        {
          staff_id: string;
          name: string;
          appointments: bigint;
          completed: bigint;
          no_shows: bigint;
          revenue: bigint;
        }[]
      >`
        SELECT b.staff_id, sp.display_name AS name,
          count(*) FILTER (WHERE b.status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')) AS appointments,
          count(*) FILTER (WHERE b.status = 'completed') AS completed,
          count(*) FILTER (WHERE b.status = 'no_show') AS no_shows,
          coalesce(sum(b.total_price_minor) FILTER (WHERE b.status = 'completed'), 0) AS revenue
        FROM bookings b JOIN staff_profiles sp ON sp.id = b.staff_id AND sp.salon_id = b.salon_id
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND (${own}::uuid IS NULL OR b.staff_id = ${own}::uuid)
        GROUP BY b.staff_id, sp.display_name ORDER BY appointments DESC`,
    ]);
    return {
      range: { from, to },
      previousRange: prev,
      scope: own ? "own" : "salon",
      metrics,
      daily: daily.map((d) => ({
        date: d.date,
        appointments: Number(d.appointments),
        completed: Number(d.completed),
        estimatedRevenue: Number(d.revenue),
      })),
      services: services.map((s) => {
        const n = (s.name ?? {}) as Partial<Record<"vi" | "en", string>>;
        return {
          serviceId: s.service_id,
          name: { vi: n.vi ?? "", en: n.en ?? n.vi ?? "" },
          count: Number(s.count),
          estimatedRevenue: Number(s.revenue),
        };
      }),
      sources: sources.map((s) => ({ source: s.source, count: Number(s.count) })),
      staff: staff.map((s) => ({
        staffId: s.staff_id,
        name: s.name,
        appointments: Number(s.appointments),
        completed: Number(s.completed),
        noShows: Number(s.no_shows),
        estimatedRevenue: Number(s.revenue),
      })),
    };
  }

  private async counts(
    salonId: string,
    scope: CrmScope,
    from: string,
    to: string,
    tz: string,
  ): Promise<Counts> {
    const start = new Date(dayBounds(from, tz).start);
    const end = new Date(dayBounds(to, tz).end);
    const own = scope.staffId;
    const rows = await this.prisma.$queryRaw<Counts[]>`
      WITH period AS (
        SELECT b.* FROM bookings b
        WHERE b.salon_id = ${salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND (${own}::uuid IS NULL OR b.staff_id = ${own}::uuid)
      ), done_phones AS (
        SELECT DISTINCT customer_phone_e164 AS phone FROM period
        WHERE status = 'completed' AND customer_phone_e164 IS NOT NULL
      ), earlier AS (
        SELECT DISTINCT b.customer_phone_e164 AS phone FROM bookings b
        WHERE b.salon_id = ${salonId}::uuid AND b.status = 'completed' AND b.starts_at < ${start}
          AND b.customer_phone_e164 IN (SELECT phone FROM done_phones)
      )
      SELECT
        (SELECT count(*) FROM period) AS total,
        (SELECT count(*) FROM period WHERE status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')) AS active,
        (SELECT count(*) FROM period WHERE status = 'completed') AS completed,
        (SELECT count(*) FROM period WHERE status = 'checked_in') AS checked_in,
        (SELECT count(*) FROM period WHERE status = 'no_show') AS no_show,
        (SELECT count(*) FROM period WHERE status IN ('cancelled_by_customer', 'cancelled_by_salon')) AS cancelled,
        (SELECT coalesce(sum(total_price_minor), 0) FROM period WHERE status = 'completed') AS revenue,
        (SELECT coalesce(sum(o.amount_minor), 0) FROM offline_sales o JOIN period p ON p.id = o.booking_id AND o.salon_id = p.salon_id) AS offline,
        (SELECT count(*) FROM done_phones WHERE phone NOT IN (SELECT phone FROM earlier)) AS new_customers,
        (SELECT count(*) FROM earlier) AS returning`;
    const r = rows[0];
    if (!r) throw new Error("insights: no row");
    return r;
  }
}
