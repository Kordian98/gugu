import { Injectable } from "@nestjs/common";
import {
  ADMIN_ERRORS,
  type AdminUsage,
  type AdminUsageItem,
  type AdminUsageOverview,
  type AdminUsageQuery,
  type LimitValue,
  planCodeSchema,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AiCostMeter, aiCostMonth } from "../../ai-import/ai-import.facade";
import { Clock, EntitlementService } from "../../subscriptions/subscriptions.facade";
import { decodeOffset, encodeOffset } from "./cursor";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;
const SOFT_LIMIT_SHARE = 0.8;
/** Usage is computed per salon over every salon with a subscription; plenty for the MVP scale. */
const MAX_SALONS = 5_000;

/** [start, end) in UTC of a `YYYY-MM` calendar month in Asia/Ho_Chi_Minh. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - VN_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - VN_OFFSET_MS),
  };
}

function previousMonth(month: string): string {
  const { start } = monthRange(month);
  return aiCostMonth(new Date(start.getTime() - DAY_MS));
}

/** Like Promise.all over `items`, at most `limit` at a time (keeps the DB pool free). */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function share(used: number, cap: LimitValue): number | null {
  if (cap === "unlimited" || cap === 0) return null;
  return used / cap;
}

/**
 * Usage and cost for platform admin (topic 12 M12.6): AI spend from the hard-cap counter
 * (`AiCostMeter`, the same number that enforces the cap) and ZBS Template Message sends from
 * `zalo_send_logs`. These are GuGu's costs, never salon revenue (no RevenueKind applies).
 */
@Injectable()
export class AdminUsageQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly meter: AiCostMeter,
    private readonly entitlements: EntitlementService,
  ) {}

  /** Current month for one salon. */
  async forSalon(salonId: string): Promise<AdminUsage> {
    const month = aiCostMonth(this.clock.now());
    const { start, end } = monthRange(month);
    const [ai, zalo, ents] = await Promise.all([
      this.meter.monthlyUsage([salonId], month),
      this.prisma.zaloSendLog.aggregate({
        where: { salonId, channel: "template", status: "sent", sentAt: { gte: start, lt: end } },
        _count: { _all: true },
        _sum: { costEstimateVnd: true },
      }),
      this.entitlements.forSalon(salonId),
    ]);
    return {
      month,
      aiCostVnd: ai.get(salonId) ?? 0,
      aiCapVnd: ents.entitlements["ai.monthly_cost_cap_vnd"],
      zaloTemplateSent: zalo._count._all,
      zaloTemplateCostVnd: zalo._sum.costEstimateVnd ?? 0,
      zaloTemplateLimit: ents.entitlements["zalo_template.monthly_messages"],
    };
  }

  async overview(query: AdminUsageQuery): Promise<AdminUsageOverview> {
    const now = this.clock.now();
    const current = aiCostMonth(now);
    const month = query.month ?? current;
    // AI counters live ~40 days: only the current and the previous month are reliable.
    if (month !== current && month !== previousMonth(current)) {
      throw new AppError(400, ADMIN_ERRORS.usageMonthUnavailable, "Month not available", {
        errors: [{ path: "month", code: ADMIN_ERRORS.usageMonthUnavailable }],
      });
    }
    const { start, end } = monthRange(month);
    const salons = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        plan: string | null;
        status: string | null;
        trial_ends_at: Date | null;
      }[]
    >`
      SELECT sa.id, sa.name, cur.plan, cur.status, cur.trial_ends_at
      FROM salons sa
      LEFT JOIN LATERAL (
        SELECT p.code AS plan, s.status::text AS status, s.trial_ends_at
        FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.salon_id = sa.id
        ORDER BY s.created_at DESC, s.id DESC LIMIT 1
      ) cur ON TRUE
      WHERE sa.deleted_at IS NULL
      ORDER BY sa.created_at, sa.id
      LIMIT ${MAX_SALONS}`;
    const ids = salons.map((s) => s.id);
    const [ai, zalo, ents] = await Promise.all([
      this.meter.monthlyUsage(ids, month),
      this.prisma.zaloSendLog.groupBy({
        by: ["salonId"],
        where: {
          salonId: { in: ids },
          channel: "template",
          status: "sent",
          sentAt: { gte: start, lt: end },
        },
        _count: { _all: true },
        _sum: { costEstimateVnd: true },
      }),
      // Resolved (cached ≤ 60 s) entitlements: caps include overrides, so this is the real cap.
      mapLimit(ids, 8, (id) => this.entitlements.forSalon(id)),
    ]);
    const zaloBy = new Map(zalo.map((z) => [z.salonId, z]));
    const all: AdminUsageItem[] = salons.map((s, i) => {
      const e = ents[i]?.entitlements;
      const aiCostVnd = ai.get(s.id) ?? 0;
      const aiCapVnd = e?.["ai.monthly_cost_cap_vnd"] ?? 0;
      const z = zaloBy.get(s.id);
      return {
        salonId: s.id,
        name: s.name,
        plan: s.plan ? planCodeSchema.parse(s.plan) : null,
        subscriptionStatus: ents[i]?.status ?? "none",
        aiCostVnd,
        aiCapVnd,
        aiCapShare: share(aiCostVnd, aiCapVnd),
        zaloTemplateSent: z?._count._all ?? 0,
        zaloTemplateCostVnd: z?._sum.costEstimateVnd ?? 0,
        zaloTemplateLimit: e?.["zalo_template.monthly_messages"] ?? 0,
      };
    });
    // Closest to (or past) the cap first, then by absolute spend.
    all.sort(
      (a, b) =>
        (b.aiCapShare ?? -1) - (a.aiCapShare ?? -1) ||
        b.aiCostVnd - a.aiCostVnd ||
        a.salonId.localeCompare(b.salonId),
    );
    const offset = decodeOffset(query.cursor);
    const items = all.slice(offset, offset + query.limit);
    const byPlan = new Map<
      string,
      { salons: number; aiCostVnd: number; zaloTemplateCostVnd: number }
    >();
    for (const it of all) {
      const k = it.plan ?? "none";
      const agg = byPlan.get(k) ?? { salons: 0, aiCostVnd: 0, zaloTemplateCostVnd: 0 };
      agg.salons++;
      agg.aiCostVnd += it.aiCostVnd;
      agg.zaloTemplateCostVnd += it.zaloTemplateCostVnd;
      byPlan.set(k, agg);
    }
    const soon = new Date(now.getTime() + 7 * DAY_MS);
    return {
      month,
      items,
      nextCursor: offset + items.length < all.length ? encodeOffset(offset + items.length) : null,
      totals: {
        salons: all.length,
        aiCostVnd: all.reduce((n, it) => n + it.aiCostVnd, 0),
        zaloTemplateSent: all.reduce((n, it) => n + it.zaloTemplateSent, 0),
        zaloTemplateCostVnd: all.reduce((n, it) => n + it.zaloTemplateCostVnd, 0),
        nearAiCap: all.filter((it) => (it.aiCapShare ?? 0) >= SOFT_LIMIT_SHARE).length,
        byPlan: [...byPlan.entries()].map(([plan, v]) => ({
          plan: plan === "none" ? "none" : planCodeSchema.parse(plan),
          ...v,
        })),
      },
      trialsEndingSoon: salons
        .filter(
          (s) =>
            s.status === "trialing" &&
            s.trial_ends_at !== null &&
            s.trial_ends_at > now &&
            s.trial_ends_at <= soon,
        )
        .sort((a, b) => (a.trial_ends_at?.getTime() ?? 0) - (b.trial_ends_at?.getTime() ?? 0))
        .map((s) => ({
          salonId: s.id,
          name: s.name,
          trialEndsAt: (s.trial_ends_at as Date).toISOString(),
        })),
    };
  }
}
