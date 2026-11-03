/**
 * Owner "This month" profit estimate (ADR-0014): what was earned so far, what upcoming bookings
 * should still bring, minus service costs, payroll and other monthly costs. Pure arithmetic over
 * inputs the API loads; every output is registered in the metric catalogue (`profit.*`).
 *
 * The optional no-show allowance applies the salon's own historical no-show rate to everything
 * projected (revenue, service costs, projected commission): a no-show brings no revenue, uses no
 * material and earns no commission. It is an assumption and is labelled as one.
 */

export interface ProfitInput {
  /** Completed bookings: recorded amount where entered, else the booked price (VND). */
  earned: number;
  /** Part of `earned` that comes from amounts recorded at the salon. */
  earnedRecorded: number;
  /** Pending/confirmed/checked-in bookings still to come this month, at line snapshot prices. */
  upcoming: number;
  /** Historical no-show share (0..1), null when there is not enough history. */
  noShowRate: number | null;
  serviceCostsActual: number;
  serviceCostsUpcoming: number;
  /** Base pay of everyone for the full month. */
  basePay: number;
  commissionEarned: number;
  commissionUpcoming: number;
  /** Bonuses minus deductions of the month (advances are part of pay, not an extra cost). */
  adjustments: number;
  otherCosts: number;
  elapsedDays: number;
  daysInMonth: number;
}

export interface ProfitResult {
  revenueEarned: number;
  revenueEarnedRecorded: number;
  revenueUpcoming: number;
  noShowAllowance: number;
  /** earned + upcoming − no-show allowance. */
  revenueTotal: number;
  serviceCostsActual: number;
  serviceCostsProjected: number;
  serviceCosts: number;
  basePay: number;
  commissionEarned: number;
  commissionProjected: number;
  adjustments: number;
  payroll: number;
  otherCosts: number;
  grossProfit: number;
  netProfit: number;
  /** null when there is no revenue (renders as "—"). */
  grossMargin: number | null;
  netMargin: number | null;
  monthProgress: number;
}

const roundVnd = (x: number) => Math.round(x);

export function monthProfit(i: ProfitInput): ProfitResult {
  const rate = i.noShowRate === null ? 0 : Math.min(1, Math.max(0, i.noShowRate));
  const keep = 1 - rate;
  const noShowAllowance = roundVnd(i.upcoming * rate);
  const revenueTotal = i.earned + i.upcoming - noShowAllowance;
  const serviceCostsProjected = roundVnd(i.serviceCostsUpcoming * keep);
  const serviceCosts = i.serviceCostsActual + serviceCostsProjected;
  const commissionProjected = roundVnd(i.commissionUpcoming * keep);
  const payroll = i.basePay + i.commissionEarned + commissionProjected + i.adjustments;
  const grossProfit = revenueTotal - serviceCosts;
  const netProfit = grossProfit - payroll - i.otherCosts;
  return {
    revenueEarned: i.earned,
    revenueEarnedRecorded: i.earnedRecorded,
    revenueUpcoming: i.upcoming,
    noShowAllowance,
    revenueTotal,
    serviceCostsActual: i.serviceCostsActual,
    serviceCostsProjected,
    serviceCosts,
    basePay: i.basePay,
    commissionEarned: i.commissionEarned,
    commissionProjected,
    adjustments: i.adjustments,
    payroll,
    otherCosts: i.otherCosts,
    grossProfit,
    netProfit,
    grossMargin: revenueTotal > 0 ? grossProfit / revenueTotal : null,
    netMargin: revenueTotal > 0 ? netProfit / revenueTotal : null,
    monthProgress: i.daysInMonth > 0 ? Math.min(1, i.elapsedDays / i.daysInMonth) : 0,
  };
}

/** Minimum finished bookings before the salon's own no-show rate is used as an assumption. */
export const NO_SHOW_MIN_SAMPLE = 20;

export function noShowAssumption(noShows: number, finished: number): number | null {
  return finished >= NO_SHOW_MIN_SAMPLE ? noShows / finished : null;
}
