import type { LocalDate } from "../booking/tz";
import { type PayVersion, versionAt } from "./commission";
import { daysInMonth, type Month, monthDates } from "./month";

/**
 * Base pay and the monthly payroll line of one staff member (ADR-0016). Estimates before tax and
 * social insurance: GuGu computes neither (no legal or tax claims).
 */

export const ADJUSTMENT_KINDS = ["bonus", "deduction", "advance"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export interface BasePayInput {
  versions: readonly PayVersion[];
  month: Month;
  /** Last day the person is employed (staff removed), null while employed. */
  employedUntil: LocalDate | null;
  /** Scheduled working minutes per local date (breaks and time off already removed). */
  workMinutesByDate: ReadonlyMap<LocalDate, number>;
}

export interface BasePayResult {
  amount: number;
  /** Days of the month covered by a pay version (employment). */
  employedDays: number;
  /** Employed days with scheduled work. */
  workingDays: number;
  /** Scheduled minutes on employed days. */
  workMinutes: number;
  /** Type in force on the last employed day of the month (for display), null if none. */
  baseType: PayVersion["baseType"] | null;
}

const roundVnd = (x: number) => Math.floor(x + 0.5);

/**
 * - monthly: amount × employed days ÷ days in month (pro-rated for joining/leaving mid-month);
 * - daily: amount × employed days with scheduled work;
 * - hourly: amount × scheduled hours on employed days.
 * Several versions in one month are pro-rated per version (each rounded once).
 */
export function basePayForMonth(input: BasePayInput): BasePayResult {
  const dim = daysInMonth(input.month);
  const groups = new Map<PayVersion, { days: number; workDays: number; minutes: number }>();
  let employedDays = 0;
  let workingDays = 0;
  let workMinutes = 0;
  let last: PayVersion | null = null;
  for (const date of monthDates(input.month)) {
    if (input.employedUntil !== null && date > input.employedUntil) continue;
    const v = versionAt(input.versions, date);
    if (!v) continue;
    const minutes = Math.max(0, input.workMinutesByDate.get(date) ?? 0);
    const g = groups.get(v) ?? { days: 0, workDays: 0, minutes: 0 };
    g.days++;
    g.minutes += minutes;
    if (minutes > 0) g.workDays++;
    groups.set(v, g);
    employedDays++;
    workMinutes += minutes;
    if (minutes > 0) workingDays++;
    last = v;
  }
  let amount = 0;
  for (const [v, g] of groups) {
    const a = Math.max(0, v.baseAmount);
    if (v.baseType === "monthly") amount += roundVnd((a * g.days) / dim);
    else if (v.baseType === "daily") amount += a * g.workDays;
    else if (v.baseType === "hourly") amount += roundVnd((a * g.minutes) / 60);
  }
  return { amount, employedDays, workingDays, workMinutes, baseType: last?.baseType ?? null };
}

export interface Adjustment {
  kind: AdjustmentKind;
  /** Always positive; the kind gives the sign. */
  amount: number;
}

export interface PayrollLine {
  base: number;
  commission: number;
  bonus: number;
  deduction: number;
  advance: number;
  /** base + commission + bonus − deduction − advance (what is left to hand over). */
  total: number;
  /** base + commission + bonus − deduction (the salon's cost; an advance is part of it, not extra). */
  cost: number;
}

export function payrollLine(
  base: number,
  commission: number,
  adjustments: readonly Adjustment[],
): PayrollLine {
  const sum = (k: AdjustmentKind) =>
    adjustments.filter((a) => a.kind === k).reduce((n, a) => n + Math.max(0, a.amount), 0);
  const bonus = sum("bonus");
  const deduction = sum("deduction");
  const advance = sum("advance");
  return {
    base,
    commission,
    bonus,
    deduction,
    advance,
    total: base + commission + bonus - deduction - advance,
    cost: base + commission + bonus - deduction,
  };
}

/**
 * The month's employer-cost terms of one person (ADR-0017), weighted by the employed days each
 * pay version covers (like monthly base pay): a fixed amount is pro-rated (amount × days ÷ days in
 * month), a % applies to that share of gross. `extra = fixed + gross × bps ÷ 10 000`, so the same
 * terms price both earned and projected gross.
 */
export interface EmployerCostTerms {
  /** Pro-rated fixed amounts (VND). */
  fixed: number;
  /** Day-weighted % of gross, basis points (may be fractional). */
  bps: number;
  /** Some employed day of the month has an employer cost set. */
  set: boolean;
}

export function employerCostTerms(
  input: Omit<BasePayInput, "workMinutesByDate">,
): EmployerCostTerms {
  const dim = daysInMonth(input.month);
  const days = new Map<PayVersion, number>();
  let employed = 0;
  for (const date of monthDates(input.month)) {
    if (input.employedUntil !== null && date > input.employedUntil) continue;
    const v = versionAt(input.versions, date);
    if (!v) continue;
    days.set(v, (days.get(v) ?? 0) + 1);
    employed++;
  }
  let fixed = 0;
  let bps = 0;
  let set = false;
  for (const [v, n] of days) {
    const e = v.employerCost;
    if (!e) continue;
    set = true;
    if (e.kind === "fixed") fixed += roundVnd((Math.max(0, e.amount) * n) / dim);
    else bps += (Math.max(0, e.bps) * n) / employed;
  }
  return { fixed, bps, set };
}

/** Employer cost on top of a gross amount (never negative). */
export function employerExtra(terms: EmployerCostTerms, gross: number): number {
  return terms.fixed + roundVnd((Math.max(0, gross) * terms.bps) / 10_000);
}
