import { Injectable } from "@nestjs/common";
import type { ZaloUsage } from "@gugu/contracts";
import { dayBounds, toLocal } from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { EntitlementService } from "../../subscriptions/subscriptions.facade";
import { ZaloClock } from "./zalo-clock";

/** Monthly send counts and estimated cost (salon timezone), plus the template cap in force. */
@Injectable()
export class UsageQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly clock: ZaloClock,
  ) {}

  async monthBounds(salonId: string): Promise<{ month: string; start: Date; end: Date }> {
    const salon = await this.prisma.salon.findUniqueOrThrow({
      where: { id: salonId },
      select: { timezone: true },
    });
    const today = toLocal(this.clock.now().getTime(), salon.timezone).date;
    const month = today.slice(0, 7);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const next =
      m === 12 ? `${String(y + 1)}-01-01` : `${String(y)}-${String(m + 1).padStart(2, "0")}-01`;
    return {
      month,
      start: new Date(dayBounds(`${month}-01`, salon.timezone).start),
      end: new Date(dayBounds(next, salon.timezone).start),
    };
  }

  /** Effective monthly template limit: plan entitlement, lowered by the owner's cap. */
  async templateLimit(salonId: string, cap: number | null): Promise<number | null> {
    const plan = await this.entitlements.limit(salonId, "zalo_template.monthly_messages");
    const planLimit = plan === "unlimited" ? null : plan;
    if (cap === null) return planLimit;
    return planLimit === null ? cap : Math.min(planLimit, cap);
  }

  async templatesSentThisMonth(salonId: string): Promise<number> {
    const { start, end } = await this.monthBounds(salonId);
    return this.prisma.zaloSendLog.count({
      where: { salonId, channel: "template", status: "sent", sentAt: { gte: start, lt: end } },
    });
  }

  async month(salonId: string): Promise<ZaloUsage> {
    const { month, start, end } = await this.monthBounds(salonId);
    const rows = await this.prisma.zaloSendLog.groupBy({
      by: ["channel", "tier", "status"],
      where: { salonId, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: { costEstimateVnd: true },
    });
    const count = (f: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(f).reduce((n, r) => n + r._count._all, 0);
    const conn = await this.prisma.zaloOaConnection.findUnique({
      where: { salonId },
      select: { monthlyTemplateCap: true },
    });
    return {
      month,
      templatesSent: count((r) => r.channel === "template" && r.status === "sent"),
      paidMessagesSent: count(
        (r) => r.channel === "cs" && r.tier === "paid" && r.status === "sent",
      ),
      freeMessagesSent: count(
        (r) => r.channel === "cs" && r.tier === "free" && r.status === "sent",
      ),
      rejected: count((r) => r.status === "rejected"),
      costEstimateVnd: rows
        .filter((r) => r.status === "sent")
        .reduce((n, r) => n + (r._sum.costEstimateVnd ?? 0), 0),
      templateLimit: await this.templateLimit(salonId, conn?.monthlyTemplateCap ?? null),
    };
  }
}
