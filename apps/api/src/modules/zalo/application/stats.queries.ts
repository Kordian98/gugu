import { Injectable } from "@nestjs/common";
import type { ZaloStats, ZaloStatsQuery } from "@gugu/contracts";
import { addDays, dayBounds } from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { type SessionGroup, summarizeFunnel } from "../domain/funnel";

/**
 * Zalo statistics read model (owner request 2026-11-03): contacts, the bot funnel, why bookings
 * didn't happen, button actions, reminders, staff work and message costs for one salon and period.
 * Aggregates only — no text, names or phones — so the AI assistant may use it as is.
 * Each part is one indexed GROUP BY over zalo_funnel_events / zalo_send_logs (salon_id, time).
 */
@Injectable()
export class StatsQueries {
  constructor(private readonly prisma: PrismaService) {}

  async stats(salonId: string, query: ZaloStatsQuery): Promise<ZaloStats> {
    const salon = await this.prisma.salon.findUniqueOrThrow({
      where: { id: salonId },
      select: { timezone: true },
    });
    const tz = salon.timezone;
    const start = new Date(dayBounds(query.from, tz).start);
    const end = new Date(dayBounds(addDays(query.to, 1), tz).start);

    const [events, distinct, groups, sends, staffConversations] = await Promise.all([
      this.prisma.zaloFunnelEvent.groupBy({
        by: ["event", "reason"],
        where: { salonId, occurredAt: { gte: start, lt: end } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ customers: number; conversations_started: number }[]>`
        SELECT
          count(DISTINCT conversation_id) FILTER (WHERE event = 'inbound')::int AS customers,
          count(*) FILTER (WHERE event = 'conversation_started')::int AS conversations_started
        FROM zalo_funnel_events
        WHERE salon_id = ${salonId}::uuid AND occurred_at >= ${start} AND occurred_at < ${end}`,
      // Sessions started in the period, followed to their end even after the period.
      this.prisma.$queryRaw<
        {
          max_rank: number;
          booked: boolean;
          end_reason: string | null;
          end_step: string | null;
          n: number;
        }[]
      >`
        WITH s AS (
          SELECT DISTINCT session_id FROM zalo_funnel_events
          WHERE salon_id = ${salonId}::uuid AND event = 'session_started'
            AND occurred_at >= ${start} AND occurred_at < ${end}
        ), e AS (
          SELECT f.session_id,
            max(CASE f.step WHEN 'service' THEN 1 WHEN 'staff' THEN 2 WHEN 'slot' THEN 3
                            WHEN 'phone' THEN 4 WHEN 'confirm' THEN 5 ELSE 0 END) AS max_rank,
            bool_or(f.event = 'booked') AS booked,
            (array_agg(f.reason ORDER BY f.occurred_at DESC) FILTER (WHERE f.event = 'session_ended'))[1] AS end_reason,
            (array_agg(f.step ORDER BY f.occurred_at DESC) FILTER (WHERE f.event = 'session_ended'))[1] AS end_step
          FROM zalo_funnel_events f JOIN s USING (session_id)
          WHERE f.salon_id = ${salonId}::uuid
          GROUP BY f.session_id
        )
        SELECT max_rank::int, booked, end_reason, end_step, count(*)::int AS n
        FROM e GROUP BY 1, 2, 3, 4`,
      this.prisma.zaloSendLog.groupBy({
        by: ["purpose", "channel", "tier", "status"],
        where: { salonId, createdAt: { gte: start, lt: end } },
        _count: { _all: true },
        _sum: { costEstimateVnd: true },
      }),
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(DISTINCT conversation_id)::int AS n FROM (
          SELECT conversation_id FROM zalo_send_logs
          WHERE salon_id = ${salonId}::uuid AND purpose = 'staff_reply'
            AND created_at >= ${start} AND created_at < ${end} AND conversation_id IS NOT NULL
          UNION
          SELECT conversation_id FROM zalo_funnel_events
          WHERE salon_id = ${salonId}::uuid AND event = 'staff_takeover'
            AND occurred_at >= ${start} AND occurred_at < ${end}
        ) x`,
    ]);

    const count = (event: string, reason?: string) =>
      events
        .filter((e) => e.event === event && (reason === undefined || e.reason === reason))
        .reduce((n, e) => n + e._count._all, 0);
    const funnel = summarizeFunnel(
      groups.map((g): SessionGroup => ({
        maxRank: g.max_rank,
        booked: g.booked,
        endReason: g.end_reason,
        endStep: g.end_step,
        count: g.n,
      })),
    );
    const lost: Record<string, number> = { ...funnel.lost };
    const add = (reason: string, n: number) => {
      if (n > 0) lost[reason] = (lost[reason] ?? 0) + n;
    };
    add("bot_disabled", count("bot_unavailable", "bot_disabled"));
    add("out_of_window", count("reply_blocked", "out_of_window"));

    const sent = (f: (s: (typeof sends)[number]) => boolean) =>
      sends.filter(f).reduce((n, s) => n + s._count._all, 0);
    const cost = (f: (s: (typeof sends)[number]) => boolean) =>
      sends.filter(f).reduce((n, s) => n + (s._sum.costEstimateVnd ?? 0), 0);
    const isReminder = (s: (typeof sends)[number]) => s.purpose.startsWith("reminder_");
    const isSent = (s: (typeof sends)[number]) => s.status === "sent";

    return {
      from: query.from,
      to: query.to,
      timeZone: tz,
      contacts: {
        uniqueCustomers: distinct[0]?.customers ?? 0,
        newFollowers: count("followed"),
        unfollows: count("unfollowed"),
        conversationsStarted: distinct[0]?.conversations_started ?? 0,
      },
      funnel: {
        sessions: funnel.sessions,
        bookings: funnel.booked,
        inProgress: funnel.inProgress,
        conversionRate: funnel.conversionRate,
        steps: funnel.steps,
      },
      lostReasons: Object.entries(lost)
        .map(([reason, n]) => ({ reason, count: n }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      notUnderstood: count("not_understood"),
      bookingActions: {
        cancelled: count("booking_cancelled"),
        rescheduled: count("booking_rescheduled"),
        attendanceConfirmed: count("attendance_confirmed"),
      },
      reminders: {
        sent: sent((s) => isReminder(s) && isSent(s)),
        notSent: sent((s) => isReminder(s) && s.status === "rejected"),
        failed: sent((s) => isReminder(s) && s.status === "failed"),
      },
      staff: {
        handoffs: count("handoff"),
        takeovers: count("staff_takeover"),
        staffHandledConversations: staffConversations[0]?.n ?? 0,
        staffReplies: sent((s) => s.purpose === "staff_reply" && isSent(s)),
      },
      costs: {
        totalVnd: cost(isSent),
        templateVnd: cost((s) => isSent(s) && s.channel === "template"),
        paidMessagesVnd: cost((s) => isSent(s) && s.channel === "cs" && s.tier === "paid"),
        templates: sent((s) => isSent(s) && s.channel === "template"),
        paidMessages: sent((s) => isSent(s) && s.channel === "cs" && s.tier === "paid"),
        freeMessages: sent((s) => isSent(s) && s.channel === "cs" && s.tier === "free"),
      },
    };
  }
}
