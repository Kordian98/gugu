import type { LocalDate } from "../booking/tz";

/**
 * Staff commission engine (owner request 2026-11-04, ADR-0016). Pure functions: the API loads
 * booking lines and pay settings, this decides who earns what. Rules:
 * - Commission is earned per **completed booking line**, by that line's staff member
 *   (`booking_services.staff_id`), never by the booking's first staff member.
 * - No-shows and cancellations earn nothing; pending/confirmed/checked-in lines are only
 *   *projected* (shown as such, never as earned).
 * - Pay settings are effective-dated: the version in force on the line's local date applies, so
 *   later changes never rewrite past months.
 * Money is VND (integer đồng). Percentages are basis points (10% = 1000 bps).
 */

export const BASE_PAY_TYPES = ["none", "monthly", "daily", "hourly"] as const;
export type BasePayType = (typeof BASE_PAY_TYPES)[number];

export const COMMISSION_BASES = ["price_after_discount", "price_minus_cost"] as const;
export type CommissionBase = (typeof COMMISSION_BASES)[number];
export const DEFAULT_COMMISSION_BASE: CommissionBase = "price_after_discount";

export const MAX_COMMISSION_BPS = 10_000;

export type CommissionRate = { kind: "percent"; bps: number } | { kind: "fixed"; amount: number };

/** Override for one service (variantId null) or one variant of it. */
export interface CommissionOverride {
  serviceId: string;
  variantId: string | null;
  rate: CommissionRate;
}

/**
 * "Chi phí thực tế" (owner 2026-11-03, ADR-0017): what the person costs the salon on top of gross
 * pay (employer insurance and other contributions), as the salon's accountant gave it: a % of gross
 * or a fixed VND amount per month. GuGu never computes tax or insurance itself.
 */
export type EmployerCost = { kind: "percent"; bps: number } | { kind: "fixed"; amount: number };

/** One effective-dated version of a staff member's pay settings. */
export interface PayVersion {
  effectiveFrom: LocalDate;
  baseType: BasePayType;
  /** VND per month / per working day / per hour, by `baseType` (0 for none). */
  baseAmount: number;
  /** Default commission on services, basis points. */
  commissionBps: number;
  overrides: readonly CommissionOverride[];
  /** Not set (null/undefined) = the real cost equals gross pay. */
  employerCost?: EmployerCost | null;
}

export interface CommissionPolicyVersion {
  effectiveFrom: LocalDate;
  base: CommissionBase;
}

export type LineState = "earned" | "projected" | "none";

/** Booking status → what a line means for commission. */
export function lineState(status: string): LineState {
  if (status === "completed") return "earned";
  if (status === "pending" || status === "confirmed" || status === "checked_in") return "projected";
  return "none";
}

/** The version in force on `date` (latest `effectiveFrom` ≤ date), or null before the first. */
export function versionAt<T extends { effectiveFrom: LocalDate }>(
  versions: readonly T[],
  date: LocalDate,
): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= date && (best === null || v.effectiveFrom > best.effectiveFrom))
      best = v;
  }
  return best;
}

export function policyAt(
  versions: readonly CommissionPolicyVersion[],
  date: LocalDate,
): CommissionBase {
  return versionAt(versions, date)?.base ?? DEFAULT_COMMISSION_BASE;
}

/** Variant override → service override → the member's default percentage. */
export function rateFor(
  version: PayVersion,
  serviceId: string,
  variantId: string | null,
): CommissionRate {
  const variant =
    variantId === null
      ? undefined
      : version.overrides.find((o) => o.serviceId === serviceId && o.variantId === variantId);
  const service = version.overrides.find((o) => o.serviceId === serviceId && o.variantId === null);
  return (variant ?? service)?.rate ?? { kind: "percent", bps: version.commissionBps };
}

/** Rounds half up to whole đồng (inputs are non-negative). */
const roundVnd = (x: number) => Math.floor(x + 0.5);

export function commissionAmount(rate: CommissionRate, base: number): number {
  if (rate.kind === "fixed") return Math.max(0, rate.amount);
  return roundVnd((Math.max(0, base) * rate.bps) / 10_000);
}

/**
 * Splits the amount recorded at the salon over a booking's lines in proportion to their booked
 * prices (largest remainder, so the parts add up exactly). Used as "price after discount" when
 * the salon recorded less than the booked total. A recorded amount ≥ the total (tips, extras)
 * never raises commission: each line keeps its booked price.
 */
export function priceAfterDiscount(prices: readonly number[], recorded: number | null): number[] {
  const total = prices.reduce((a, b) => a + b, 0);
  if (recorded === null || recorded >= total || total <= 0) return [...prices];
  const target = Math.max(0, recorded);
  const exact = prices.map((p) => (p * target) / total);
  const out = exact.map(Math.floor);
  let rest = target - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    rest--;
  }
  return out;
}

/** One booked service line as loaded by the API. */
export interface CommissionLineInput {
  lineId: string;
  bookingId: string;
  staffId: string;
  serviceId: string;
  variantId: string | null;
  /** Salon-local date the line starts on. */
  date: LocalDate;
  status: string;
  /** Booked line price snapshot incl. add-ons (VND). */
  price: number;
  /** Execution cost of the line (service/variant + add-ons), null when none is set. */
  cost: number | null;
  /** Amount recorded at the salon for the whole booking, null when none. */
  recordedForBooking: number | null;
}

export interface CommissionLineResult {
  lineId: string;
  bookingId: string;
  staffId: string;
  date: LocalDate;
  state: LineState;
  /** Commission base after discount/cost (VND). */
  base: number;
  rate: CommissionRate | null;
  /** Earned (state earned) or expected (state projected); 0 for none. */
  amount: number;
}

/**
 * Commission for every line. Lines of a booking share its recorded amount pro rata; the rate and
 * the base policy are those in force on the line's date for the line's own staff member.
 */
export function computeCommissions(
  lines: readonly CommissionLineInput[],
  payByStaff: ReadonlyMap<string, readonly PayVersion[]>,
  policy: readonly CommissionPolicyVersion[],
): CommissionLineResult[] {
  const byBooking = new Map<string, CommissionLineInput[]>();
  for (const l of lines) {
    const list = byBooking.get(l.bookingId) ?? [];
    list.push(l);
    byBooking.set(l.bookingId, list);
  }
  const discounted = new Map<string, number>();
  for (const group of byBooking.values()) {
    const parts = priceAfterDiscount(
      group.map((l) => l.price),
      group[0]?.recordedForBooking ?? null,
    );
    group.forEach((l, i) => discounted.set(l.lineId, parts[i] ?? l.price));
  }
  return lines.map((l) => {
    const state = lineState(l.status);
    const afterDiscount = discounted.get(l.lineId) ?? l.price;
    const base =
      policyAt(policy, l.date) === "price_minus_cost"
        ? Math.max(0, afterDiscount - (l.cost ?? 0))
        : afterDiscount;
    const version = versionAt(payByStaff.get(l.staffId) ?? [], l.date);
    const rate = version ? rateFor(version, l.serviceId, l.variantId) : null;
    const amount = state === "none" || rate === null ? 0 : commissionAmount(rate, base);
    return {
      lineId: l.lineId,
      bookingId: l.bookingId,
      staffId: l.staffId,
      date: l.date,
      state,
      base,
      rate,
      amount,
    };
  });
}

export interface CommissionTotals {
  earned: number;
  projected: number;
  earnedLines: number;
  projectedLines: number;
}

/** Totals per staff member (only staff with at least one earning or projected line). */
export function commissionTotalsByStaff(
  results: readonly CommissionLineResult[],
): Map<string, CommissionTotals> {
  const out = new Map<string, CommissionTotals>();
  for (const r of results) {
    if (r.state === "none") continue;
    const t = out.get(r.staffId) ?? { earned: 0, projected: 0, earnedLines: 0, projectedLines: 0 };
    if (r.state === "earned") {
      t.earned += r.amount;
      t.earnedLines++;
    } else {
      t.projected += r.amount;
      t.projectedLines++;
    }
    out.set(r.staffId, t);
  }
  return out;
}
