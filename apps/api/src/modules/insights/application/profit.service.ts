import { Injectable } from "@nestjs/common";
import type { Profit } from "@gugu/contracts";
import {
  METRICS,
  type MetricDefinition,
  type Month,
  monthProfit,
  monthProgress,
  noShowAssumption,
  PROFIT_METRIC_KEYS,
  type ProfitMetricKey,
  type ProfitResult,
  toLocal,
} from "@gugu/domain";
import { computeMonth, PayrollData, SalonCostsService } from "../../salon-crm/salon-crm.facade";

/** Registry key → value of the computed month (exhaustive: a new profit.* key fails typecheck). */
const VALUE: Record<ProfitMetricKey, (r: ProfitResult) => number | null> = {
  "profit.revenue_earned": (r) => r.revenueEarned,
  "profit.revenue_earned_recorded": (r) => r.revenueEarnedRecorded,
  "profit.revenue_upcoming": (r) => r.revenueUpcoming,
  "profit.no_show_allowance": (r) => r.noShowAllowance,
  "profit.revenue_total": (r) => r.revenueTotal,
  "profit.service_costs": (r) => r.serviceCosts,
  "profit.payroll": (r) => r.payroll,
  "profit.employer_costs": (r) => r.employerCosts,
  "profit.other_costs": (r) => r.otherCosts,
  "profit.net": (r) => r.netProfit,
  "profit.gross_margin": (r) => r.grossMargin,
  "profit.net_margin": (r) => r.netMargin,
  "profit.month_progress": (r) => r.monthProgress,
};

export function profitMetrics(r: ProfitResult): Profit["metrics"] {
  const out: Profit["metrics"] = {};
  for (const key of PROFIT_METRIC_KEYS) {
    const def: MetricDefinition = METRICS[key];
    out[key] = {
      value: VALUE[key](r),
      unit: def.unit,
      revenueKind: def.revenueKind ?? null,
      basis: def.basis ?? "actual",
    };
  }
  return out;
}

/**
 * Owner "This month" profit view (ADR-0016, metric catalogue `profit.*`): earned so far +
 * still to come − service costs − payroll − other costs. Salon-level aggregates only. A closed
 * payroll month uses its snapshot so Payroll and Insights always agree.
 */
@Injectable()
export class ProfitService {
  constructor(
    private readonly data: PayrollData,
    private readonly costs: SalonCostsService,
  ) {}

  async compute(salonId: string, month: Month, now: Date): Promise<Profit> {
    const [loaded, costList, history] = await Promise.all([
      this.data.load(salonId, month),
      this.costs.forMonth(salonId, month),
      this.data.noShowHistory(salonId, now),
    ]);
    const today = toLocal(now.getTime(), loaded.timeZone).date;
    const progress = monthProgress(month, today);
    const c = computeMonth(loaded, now);
    const results = new Map(c.results.map((r) => [r.lineId, r]));

    // Revenue per booking: the recorded amount where entered, else the booked line prices.
    const earnedByBooking = new Map<string, { price: number; recorded: number | null }>();
    let upcoming = 0;
    let costsActual = 0;
    let costsUpcoming = 0;
    const withoutCost = new Set<string>();
    for (const l of c.lines) {
      const state = results.get(l.lineId)?.state ?? "none";
      if (state === "none") continue;
      if (l.cost === null) withoutCost.add(l.serviceId);
      if (state === "earned") {
        const b = earnedByBooking.get(l.bookingId) ?? { price: 0, recorded: l.recordedForBooking };
        b.price += l.price;
        earnedByBooking.set(l.bookingId, b);
        costsActual += l.cost ?? 0;
      } else {
        upcoming += l.price;
        costsUpcoming += l.cost ?? 0;
      }
    }
    let earned = 0;
    let earnedRecorded = 0;
    for (const b of earnedByBooking.values()) {
      earned += b.recorded ?? b.price;
      earnedRecorded += b.recorded ?? 0;
    }

    const closed = c.dto.status === "closed";
    // A closed month's rows and totals already come from its snapshot (computeMonth).
    const totals = c.dto.totals;
    const commissionUpcoming = closed
      ? 0
      : c.dto.rows.reduce((n, r) => n + r.projectedCommission, 0);
    const noShowRate = noShowAssumption(history.noShows, history.finished);
    const r = monthProfit({
      earned,
      earnedRecorded,
      upcoming,
      noShowRate: upcoming > 0 ? noShowRate : null,
      serviceCostsActual: costsActual,
      serviceCostsUpcoming: costsUpcoming,
      basePay: totals.base,
      commissionEarned: totals.commission,
      commissionUpcoming,
      adjustments: totals.bonus - totals.deduction,
      employerCostsActual: totals.employerCost,
      employerCostsUpcoming: closed
        ? 0
        : c.dto.rows.reduce((n, r) => n + r.projectedEmployerCost, 0),
      otherCosts: costList.total,
      elapsedDays: progress.elapsedDays,
      daysInMonth: progress.daysInMonth,
    });
    return {
      month,
      phase: progress.phase,
      elapsedDays: progress.elapsedDays,
      daysInMonth: progress.daysInMonth,
      metrics: profitMetrics(r),
      breakdown: r,
      noShow: { rate: noShowRate, sample: history.finished },
      servicesWithoutCost: withoutCost.size,
      payrollClosed: closed,
      costs: costList.items,
    };
  }
}
