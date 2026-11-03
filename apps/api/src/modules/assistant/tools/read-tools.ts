import { Injectable } from "@nestjs/common";
import {
  BOOKING_STATUS_VALUES,
  bookingSourceSchema,
  bookingStatusSchema,
  type BookingStatusValue,
  countSchema,
  entityTokenSchema,
  isoDateSchema,
  isoDateTimeSchema,
  minutesSchema,
  moneyVndSchema,
  PERIOD_EXPRESSIONS,
  periodExpressionSchema,
  percentSchema,
  revenueKindSchema,
  signedMoneyVndSchema,
  signedPercentSchema,
} from "@gugu/contracts";
import {
  daysBetween,
  isLocalDate,
  monthOf,
  monthRange,
  offsetMinutesAt,
  resolvePeriod,
} from "@gugu/domain";
import { z } from "zod";
import { ProfitService } from "../../insights/insights.facade";
import { AssistantReadQueries } from "./read-queries";
import type { AssistantTool, ToolContext } from "./tool";

const MAX_RANGE_DAYS = 366;
const MAX_LIST_DAYS = 31;

const range = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((r) => isLocalDate(r.from) && isLocalDate(r.to) && r.from <= r.to, "invalid_range");

const rangeJson = {
  from: { type: "string", description: "First day, YYYY-MM-DD (salon-local)." },
  to: { type: "string", description: "Last day, inclusive, YYYY-MM-DD (salon-local)." },
} as const;
const statusesJson = {
  type: "array",
  items: { type: "string", enum: [...BOOKING_STATUS_VALUES] },
  description: "Only these statuses; empty array = all statuses.",
} as const;

const statusesInput = z.array(bookingStatusSchema).max(BOOKING_STATUS_VALUES.length);

/** Local ISO date-time with the salon's UTC offset, so the model reads local clock times. */
function localIso(at: Date, timeZone: string): string {
  const offset = offsetMinutesAt(at.getTime(), timeZone);
  const local = new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function assertSpan(from: string, to: string, max: number) {
  if (daysBetween(from, to) + 1 > max) throw new ToolInputError("range_too_long");
}

/** Thrown for bad model input; returned to the model as an `is_error` tool result. */
export class ToolInputError extends Error {}

/**
 * The first read tools (topic 08 A1). Outputs are PII-free: counts, VND amounts, minutes, enums,
 * dates and tokens. Customer data is not reachable through any tool.
 */
@Injectable()
export class ReadTools {
  constructor(
    private readonly q: AssistantReadQueries,
    private readonly profit: ProfitService,
  ) {}

  all(): AssistantTool[] {
    return [
      this.resolvePeriod(),
      this.bookingsCount(),
      this.revenueSummary(),
      this.utilization(),
      this.bookingsList(),
      this.monthProfit(),
    ] as AssistantTool[];
  }

  /**
   * Salon-level "This month" profit (metric catalogue profit.*, ADR-0016). Totals and margins
   * only: per-person pay, salaries and commissions are personal data and never reach the model
   * (X10) — the output schema has no staff dimension at all.
   */
  private monthProfit(): AssistantTool<{ date: string }> {
    const pct = (r: number | null) => (r === null ? null : Math.round(r * 1000) / 10);
    const output = z.strictObject({
      monthStart: isoDateSchema,
      monthEnd: isoDateSchema,
      monthProgressPercent: percentSchema,
      revenueKind: z.literal("estimated_from_bookings"),
      revenueEarnedVnd: moneyVndSchema,
      recordedAtSalonPartVnd: moneyVndSchema,
      recordedAtSalonKind: z.literal("recorded_offline_sale"),
      revenueUpcomingVnd: moneyVndSchema,
      noShowAssumptionPercent: percentSchema.nullable(),
      noShowAllowanceVnd: moneyVndSchema,
      revenueTotalVnd: signedMoneyVndSchema,
      serviceCostsVnd: signedMoneyVndSchema,
      payrollTotalVnd: signedMoneyVndSchema,
      otherCostsVnd: moneyVndSchema,
      netProfitVnd: signedMoneyVndSchema,
      grossMarginPercent: signedPercentSchema.nullable(),
      netMarginPercent: signedPercentSchema.nullable(),
      payrollMonthClosed: z.boolean(),
    });
    return {
      name: "month_profit",
      description:
        "Estimated profit of one calendar month for the whole salon (lãi ước tính, lợi nhuận tháng này): revenue earned so far from completed appointments, revenue still to come from upcoming ones, an optional no-show allowance (an assumption from the salon's own history), service execution costs, the team's payroll as ONE total (base pay + commissions + bonuses − deductions, plus the employer costs such as taxes and insurance that the salon itself entered per person; GuGu computes no tax or insurance), other monthly costs, estimated net profit and gross/net margin. Pass any day of the month (use resolve_period first). Pay of individual people is NOT available to you: never guess or split it. All money is an estimate, not a payment.",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Any day of the month, YYYY-MM-DD (salon-local)." },
        },
        required: ["date"],
        additionalProperties: false,
      },
      input: z
        .strictObject({ date: isoDateSchema })
        .refine((i) => isLocalDate(i.date), "invalid_date"),
      output,
      permission: "payroll.read",
      period: (i) => monthRange(monthOf(i.date)),
      handler: async (ctx, i) => {
        const month = monthOf(i.date);
        const p = await this.profit.compute(ctx.salonId, month, new Date(ctx.now()));
        const b = p.breakdown;
        const range = monthRange(month);
        return {
          monthStart: range.from,
          monthEnd: range.to,
          monthProgressPercent: pct(b.monthProgress) ?? 0,
          revenueKind: "estimated_from_bookings" as const,
          revenueEarnedVnd: b.revenueEarned,
          recordedAtSalonPartVnd: b.revenueEarnedRecorded,
          recordedAtSalonKind: "recorded_offline_sale" as const,
          revenueUpcomingVnd: b.revenueUpcoming,
          noShowAssumptionPercent: b.noShowAllowance > 0 ? pct(p.noShow.rate) : null,
          noShowAllowanceVnd: b.noShowAllowance,
          revenueTotalVnd: b.revenueTotal,
          serviceCostsVnd: b.serviceCosts,
          payrollTotalVnd: b.payroll,
          otherCostsVnd: b.otherCosts,
          netProfitVnd: b.netProfit,
          grossMarginPercent: pct(b.grossMargin),
          netMarginPercent: pct(b.netMargin),
          payrollMonthClosed: p.payrollClosed,
        };
      },
    };
  }

  private resolvePeriod(): AssistantTool<{ expression: string }> {
    const output = z.strictObject({
      expression: periodExpressionSchema,
      from: isoDateSchema,
      to: isoDateSchema,
    });
    return {
      name: "resolve_period",
      description:
        "Turn a relative period into exact salon-local dates. Use it before other tools whenever the user says today/hôm nay, yesterday/hôm qua, tomorrow/ngày mai, this week/tuần này, last week/tuần trước, next week/tuần sau, this month/tháng này, last month/tháng trước, last 7 or 30 days. Weeks start on Monday. Never compute dates yourself.",
      inputSchema: {
        type: "object",
        properties: { expression: { type: "string", enum: [...PERIOD_EXPRESSIONS] } },
        required: ["expression"],
        additionalProperties: false,
      },
      input: z.strictObject({ expression: periodExpressionSchema }),
      output,
      permission: "assistant.use",
      handler: (ctx, input) =>
        Promise.resolve({
          expression: input.expression,
          ...resolvePeriod(periodExpressionSchema.parse(input.expression), ctx.now(), ctx.timeZone),
        }),
    };
  }

  private bookingsCount(): AssistantTool<{
    from: string;
    to: string;
    statuses: BookingStatusValue[];
    groupBy: string;
  }> {
    const groupBy = z.enum(["none", "status", "staff", "service", "day"]);
    const output = z.strictObject({
      from: isoDateSchema,
      to: isoDateSchema,
      total: countSchema,
      groupBy,
      groups: z.array(
        z.strictObject({
          key: z.union([
            bookingStatusSchema,
            entityTokenSchema("staff"),
            entityTokenSchema("service"),
            isoDateSchema,
          ]),
          count: countSchema,
        }),
      ),
    });
    return {
      name: "bookings_count",
      description:
        "Number of bookings (lịch hẹn) that start in a date range, optionally filtered by status and grouped by status, staff member, service or day. Staff and services come back as tokens like staff_2 / service_5; write them exactly like that in your answer. For lists of individual appointments use bookings_list.",
      inputSchema: {
        type: "object",
        properties: {
          ...rangeJson,
          statuses: statusesJson,
          groupBy: { type: "string", enum: ["none", "status", "staff", "service", "day"] },
        },
        required: ["from", "to", "statuses", "groupBy"],
        additionalProperties: false,
      },
      input: range.and(
        z.strictObject({ from: z.string(), to: z.string(), statuses: statusesInput, groupBy }),
      ),
      output,
      permission: "bookings.read",
      period: (i) => ({ from: i.from, to: i.to }),
      handler: async (ctx, i) => {
        assertSpan(i.from, i.to, MAX_RANGE_DAYS);
        if (i.groupBy === "none") {
          const total = await this.q.countBookings(
            ctx.salonId,
            i.from,
            i.to,
            ctx.timeZone,
            i.statuses,
          );
          return { from: i.from, to: i.to, total, groupBy: i.groupBy, groups: [] };
        }
        const rows = await this.q.bookings(ctx.salonId, i.from, i.to, ctx.timeZone, i.statuses);
        const counts = new Map<string, number>();
        const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
        for (const b of rows) {
          if (i.groupBy === "status") bump(b.status);
          else if (i.groupBy === "staff") bump(await ctx.vault.tokenFor("staff", b.staffId));
          else if (i.groupBy === "day") bump(this.q.localDate(b.startsAt, ctx.timeZone));
          else for (const s of b.services) bump(await ctx.vault.tokenFor("service", s.serviceId));
        }
        const groups = [...counts.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => (i.groupBy === "day" ? a.key.localeCompare(b.key) : b.count - a.count));
        return { from: i.from, to: i.to, total: rows.length, groupBy: i.groupBy, groups };
      },
    };
  }

  private revenueSummary(): AssistantTool<{ from: string; to: string }> {
    const output = z.strictObject({
      from: isoDateSchema,
      to: isoDateSchema,
      currency: z.literal("VND"),
      items: z.array(
        z.strictObject({
          kind: revenueKindSchema,
          amountVnd: moneyVndSchema.nullable(),
          bookings: countSchema.nullable(),
          status: z.enum(["tracked", "not_tracked"]),
        }),
      ),
    });
    return {
      name: "revenue_summary",
      description:
        "Salon revenue (doanh thu) for bookings starting in a date range, split by kind. estimated_from_bookings = list prices of confirmed, checked-in and completed bookings (an estimate: customers pay at the salon). recorded_offline_sale = amounts the salon recorded as received. reported_by_salon is not tracked yet. Always say which kind a number is, and never add kinds together.",
      inputSchema: {
        type: "object",
        properties: { ...rangeJson },
        required: ["from", "to"],
        additionalProperties: false,
      },
      input: range,
      output,
      permission: "analytics.read",
      period: (i) => ({ from: i.from, to: i.to }),
      handler: async (ctx, i) => {
        assertSpan(i.from, i.to, MAX_RANGE_DAYS);
        const r = await this.q.revenue(ctx.salonId, i.from, i.to, ctx.timeZone);
        return {
          from: i.from,
          to: i.to,
          currency: "VND" as const,
          items: [
            {
              kind: "estimated_from_bookings" as const,
              amountVnd: r.estimatedVnd,
              bookings: r.estimatedBookings,
              status: "tracked" as const,
            },
            {
              kind: "recorded_offline_sale" as const,
              amountVnd: r.offlineVnd,
              bookings: r.offlineBookings,
              status: "tracked" as const,
            },
            {
              kind: "reported_by_salon" as const,
              amountVnd: null,
              bookings: null,
              status: "not_tracked" as const,
            },
          ],
        };
      },
    };
  }

  private utilization(): AssistantTool<{ from: string; to: string }> {
    const row = {
      scheduledMinutes: minutesSchema,
      bookedMinutes: minutesSchema,
      utilizationPercent: percentSchema.nullable(),
    };
    const output = z.strictObject({
      from: isoDateSchema,
      to: isoDateSchema,
      ...row,
      staff: z.array(z.strictObject({ staff: entityTokenSchema("staff"), ...row })),
    });
    return {
      name: "utilization",
      description:
        "How full the schedule was (công suất): booked minutes ÷ scheduled working minutes (after breaks and time off), for the whole salon and per staff member (tokens). utilizationPercent is null when nobody was scheduled. Max 92 days.",
      inputSchema: {
        type: "object",
        properties: { ...rangeJson },
        required: ["from", "to"],
        additionalProperties: false,
      },
      input: range,
      output,
      permission: "analytics.read",
      period: (i) => ({ from: i.from, to: i.to }),
      handler: async (ctx, i) => {
        assertSpan(i.from, i.to, 92);
        const rows = await this.q.utilization(ctx.salonId, i.from, i.to, ctx.timeZone);
        const scheduled = rows.reduce((n, r) => n + r.scheduledMinutes, 0);
        const booked = rows.reduce((n, r) => n + r.bookedMinutes, 0);
        const staff = [];
        for (const r of rows) {
          staff.push({
            staff: await ctx.vault.tokenFor("staff", r.staffId),
            scheduledMinutes: r.scheduledMinutes,
            bookedMinutes: r.bookedMinutes,
            utilizationPercent: r.utilizationPercent,
          });
        }
        return {
          from: i.from,
          to: i.to,
          scheduledMinutes: scheduled,
          bookedMinutes: booked,
          utilizationPercent: scheduled > 0 ? Math.round((booked / scheduled) * 1000) / 10 : null,
          staff,
        };
      },
    };
  }

  private bookingsList(): AssistantTool<{
    from: string;
    to: string;
    statuses: BookingStatusValue[];
    limit: number;
  }> {
    const output = z.strictObject({
      from: isoDateSchema,
      to: isoDateSchema,
      total: countSchema,
      items: z.array(
        z.strictObject({
          booking: entityTokenSchema("booking"),
          startsAt: isoDateTimeSchema,
          endsAt: isoDateTimeSchema,
          status: bookingStatusSchema,
          source: bookingSourceSchema,
          staff: entityTokenSchema("staff"),
          services: z.array(entityTokenSchema("service")),
          priceVnd: moneyVndSchema,
        }),
      ),
    });
    return {
      name: "bookings_list",
      description:
        "Individual bookings starting in a date range (max 31 days, up to `limit` rows, earliest first): times in salon-local time, status, source, staff and services as tokens, list price in VND. No customer details are available. Use it for questions like 'what does tomorrow look like?'.",
      inputSchema: {
        type: "object",
        properties: {
          ...rangeJson,
          statuses: statusesJson,
          limit: { type: "integer", description: "1–50." },
        },
        required: ["from", "to", "statuses", "limit"],
        additionalProperties: false,
      },
      input: range.and(
        z.strictObject({
          from: z.string(),
          to: z.string(),
          statuses: statusesInput,
          limit: z.number().int().min(1).max(50),
        }),
      ),
      output,
      permission: "bookings.read",
      period: (i) => ({ from: i.from, to: i.to }),
      handler: async (ctx, i) => {
        assertSpan(i.from, i.to, MAX_LIST_DAYS);
        const [total, rows] = await Promise.all([
          this.q.countBookings(ctx.salonId, i.from, i.to, ctx.timeZone, i.statuses),
          this.q.bookings(ctx.salonId, i.from, i.to, ctx.timeZone, i.statuses, i.limit),
        ]);
        const items = [];
        for (const b of rows) {
          const services = [];
          for (const s of b.services)
            services.push(await ctx.vault.tokenFor("service", s.serviceId));
          items.push({
            booking: await ctx.vault.tokenFor("booking", b.id),
            startsAt: localIso(b.startsAt, ctx.timeZone),
            endsAt: localIso(b.endsAt, ctx.timeZone),
            status: b.status,
            source: b.source,
            staff: await ctx.vault.tokenFor("staff", b.staffId),
            services,
            priceVnd: Number(b.totalPriceMinor),
          });
        }
        return { from: i.from, to: i.to, total, items };
      },
    };
  }
}

export type { ToolContext };
