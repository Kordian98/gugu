import { Injectable } from "@nestjs/common";
import type { Insights } from "@gugu/contracts";
import {
  dayBounds,
  METRICS,
  type MetricDefinition,
  PERIOD_METRIC_KEYS,
  type PeriodMetricKey,
  previousPeriod,
  ratio,
} from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
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
  margin: bigint;
  new_customers: bigint;
  returning: bigint;
};

/**
 * Own scope by booking line (security review L2): a booking is the member's when **any** of its
 * lines is theirs (same rule as the booking engine's read scope); money and counts per staff are
 * attributed by line (`booking_services.staff_id`, `price_minor`), never by the first line's staff.
 */
const ownBooking = (own: string | null, alias = "b") =>
  Prisma.sql`(${own}::uuid IS NULL OR EXISTS (
    SELECT 1 FROM booking_services ox
    WHERE ox.booking_id = ${Prisma.raw(alias)}.id AND ox.salon_id = ${Prisma.raw(alias)}.salon_id
      AND ox.staff_id = ${own}::uuid))`;
const ownLine = (own: string | null, alias = "bs") =>
  Prisma.sql`(${own}::uuid IS NULL OR ${Prisma.raw(alias)}.staff_id = ${own}::uuid)`;

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
    const values = (
      c: Counts,
    ): Omit<Record<PeriodMetricKey, number | null>, "appointments.upcoming"> => ({
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
      "margin.estimated": Number(c.margin),
    });
    const own0 = scope.staffId;
    const [up] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM bookings b
      WHERE b.salon_id = ${ctx.salonId}::uuid AND b.status IN ('pending', 'confirmed')
        AND b.starts_at >= now()
        AND ${ownBooking(own0)}`;
    const cur = { ...values(now), "appointments.upcoming": Number(up?.n ?? 0) };
    const old = { ...values(before), "appointments.upcoming": null };
    const metrics: Insights["metrics"] = {};
    for (const key of PERIOD_METRIC_KEYS) {
      const def: MetricDefinition = METRICS[key];
      // Internal cost based metrics (margin) only for owners/managers (services.cost.read).
      if (def.requiresPermission && !ctx.permissions.has(def.requiresPermission)) continue;
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
          coalesce(sum(l.price) FILTER (WHERE b.status = 'completed'), 0) AS revenue
        FROM bookings b
        CROSS JOIN LATERAL (
          SELECT coalesce(sum(bs.price_minor), 0) AS price FROM booking_services bs
          WHERE bs.booking_id = b.id AND bs.salon_id = b.salon_id AND ${ownLine(own)}
        ) l
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND ${ownBooking(own)}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<
        { service_id: string; name: unknown; count: bigint; revenue: bigint }[]
      >`
        SELECT bs.service_id, (array_agg(bs.name ORDER BY b.starts_at DESC))[1] AS name,
          count(*) AS count, coalesce(sum(bs.price_minor), 0) AS revenue
        -- Per line (multi-service bookings, M6.8): each service gets its own line price.
        FROM bookings b JOIN booking_services bs ON bs.booking_id = b.id AND bs.salon_id = b.salon_id
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND b.status = 'completed' AND ${ownLine(own)}
        GROUP BY bs.service_id ORDER BY count DESC LIMIT 10`,
      this.prisma.$queryRaw<{ source: Insights["sources"][number]["source"]; count: bigint }[]>`
        SELECT b.source::text AS source, count(*) AS count FROM bookings b
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND b.status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')
          AND ${ownBooking(own)}
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
        -- Per line (L2): each staff member of a chain gets their own lines and line prices.
        SELECT bs.staff_id, sp.display_name AS name,
          count(DISTINCT b.id) FILTER (WHERE b.status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')) AS appointments,
          count(DISTINCT b.id) FILTER (WHERE b.status = 'completed') AS completed,
          count(DISTINCT b.id) FILTER (WHERE b.status = 'no_show') AS no_shows,
          coalesce(sum(bs.price_minor) FILTER (WHERE b.status = 'completed'), 0) AS revenue
        FROM bookings b
        JOIN booking_services bs ON bs.booking_id = b.id AND bs.salon_id = b.salon_id
        JOIN staff_profiles sp ON sp.id = bs.staff_id AND sp.salon_id = bs.salon_id
        WHERE b.salon_id = ${ctx.salonId}::uuid AND b.starts_at >= ${start} AND b.starts_at < ${end}
          AND ${ownLine(own)}
        GROUP BY bs.staff_id, sp.display_name ORDER BY appointments DESC`,
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
          AND ${ownBooking(own)}
      ), lines AS (
        -- The reader's lines only (whole booking for the salon scope).
        SELECT bs.*, p.status FROM period p
        JOIN booking_services bs ON bs.booking_id = p.id AND bs.salon_id = p.salon_id
        WHERE ${ownLine(own)}
      ), done_phones AS (
        SELECT DISTINCT customer_phone_e164 AS phone FROM period
        WHERE status = 'completed' AND customer_phone_e164 IS NOT NULL
      ), earlier AS (
        SELECT DISTINCT b.customer_phone_e164 AS phone FROM bookings b
        WHERE b.salon_id = ${salonId}::uuid AND b.status = 'completed' AND b.starts_at < ${start}
          AND b.customer_phone_e164 IN (SELECT phone FROM done_phones)
          AND ${ownBooking(own)}
      )
      SELECT
        (SELECT count(*) FROM period) AS total,
        (SELECT count(*) FROM period WHERE status NOT IN ('cancelled_by_customer', 'cancelled_by_salon')) AS active,
        (SELECT count(*) FROM period WHERE status = 'completed') AS completed,
        (SELECT count(*) FROM period WHERE status = 'checked_in') AS checked_in,
        (SELECT count(*) FROM period WHERE status = 'no_show') AS no_show,
        (SELECT count(*) FROM period WHERE status IN ('cancelled_by_customer', 'cancelled_by_salon')) AS cancelled,
        (SELECT coalesce(sum(price_minor), 0) FROM lines WHERE status = 'completed') AS revenue,
        -- A recorded amount belongs to the whole booking: own scope gets its lines' price share.
        (SELECT coalesce(sum(CASE WHEN ${own}::uuid IS NULL THEN o.amount_minor
            ELSE round(o.amount_minor * sh.mine / nullif(sh.total, 0)) END), 0)::bigint
          FROM offline_sales o JOIN period p ON p.id = o.booking_id AND o.salon_id = p.salon_id
          CROSS JOIN LATERAL (
            SELECT sum(x.price_minor) FILTER (WHERE x.staff_id = ${own}::uuid)::numeric AS mine,
              sum(x.price_minor)::numeric AS total
            FROM booking_services x WHERE x.booking_id = p.id AND x.salon_id = p.salon_id
          ) sh) AS offline,
        (SELECT count(*) FROM done_phones WHERE phone NOT IN (SELECT phone FROM earlier)) AS new_customers,
        (SELECT count(*) FROM earlier) AS returning,
        -- booking_services.price_minor already includes the line's add-ons.
        (SELECT coalesce(sum(bs.price_minor - coalesce(v.cost_amount_minor, s.cost_amount_minor) - coalesce(ad.cost, 0)), 0)
          FROM lines bs
          JOIN services s ON s.id = bs.service_id AND s.salon_id = bs.salon_id
          LEFT JOIN service_variants v ON v.id = bs.variant_id AND v.salon_id = bs.salon_id
          LEFT JOIN LATERAL (
            SELECT sum(coalesce(a.extra_cost_amount_minor, 0)) AS cost
            FROM booking_service_addons x
            JOIN service_addons a ON a.id = x.add_on_id AND a.salon_id = x.salon_id
            WHERE x.booking_service_id = bs.id
          ) ad ON true
          WHERE bs.status = 'completed'
            AND coalesce(v.cost_amount_minor, s.cost_amount_minor) IS NOT NULL) AS margin`;
    const r = rows[0];
    if (!r) throw new Error("insights: no row");
    return r;
  }
}
