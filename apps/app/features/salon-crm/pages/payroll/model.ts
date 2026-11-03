import type {
  BasePayTypeValue,
  CommissionLines,
  CommissionOverride,
  EmployerCost,
  PayrollMonth,
  PayVersion,
  Profit,
} from "@gugu/contracts";

/**
 * Pure view logic of the payroll & commission screens (owner review 2026-11-03): no React, no
 * strings — the screens translate the codes. Unit-tested in model.test.ts.
 */

export type Rate = { kind: "percent"; percent: number } | { kind: "fixed"; amount: number };

export const rateOf = (o: Pick<CommissionOverride, "kind" | "percent" | "amount">): Rate =>
  o.kind === "percent"
    ? { kind: "percent", percent: o.percent ?? 0 }
    : { kind: "fixed", amount: o.amount ?? 0 };

const rateKey = (r: Rate) =>
  r.kind === "percent" ? `p:${String(r.percent)}` : `f:${String(r.amount)}`;

export const RATE_KINDS = ["percent", "fixed"] as const;
export const EMPLOYER_KINDS = ["none", "percent", "fixed"] as const;
export type RateSource = "variant" | "service" | "default" | "none";
export const SOURCE_DEFAULT: RateSource = "default";
export const SOURCE_SERVICE: RateSource = "service";

/** Base-pay types in the order an owner thinks of them (monthly first, "none" last). */
export const BASE_TYPE_ORDER: BasePayTypeValue[] = ["monthly", "daily", "hourly", "none"];

/** Effective rate of one person for one service (variant override → service override → default). */
export function effectiveRate(
  v: PayVersion | null,
  serviceId: string,
  variantId: string | null = null,
): { rate: Rate; source: "variant" | "service" | "default" | "none" } {
  if (!v) return { rate: { kind: "percent", percent: 0 }, source: "none" };
  const variant =
    variantId === null
      ? undefined
      : v.overrides.find((o) => o.serviceId === serviceId && o.variantId === variantId);
  if (variant) return { rate: rateOf(variant), source: "variant" };
  const service = v.overrides.find((o) => o.serviceId === serviceId && o.variantId === null);
  if (service) return { rate: rateOf(service), source: "service" };
  return { rate: { kind: "percent", percent: v.commissionPercent }, source: "default" };
}

export interface OverrideGroup {
  key: string;
  serviceId: string;
  variantId: string | null;
  rate: Rate;
  staffIds: string[];
}

/**
 * Own rates of the whole team as one simple table: one row per service (variant) and rate, with
 * the people who have it ("Sơn gel → 30% → Mai, Tuấn"). Sorted by service order, then rate.
 */
export function groupOverrides(
  staff: { staffId: string; current: PayVersion | null }[],
  serviceOrder: string[] = [],
): OverrideGroup[] {
  const groups = new Map<string, OverrideGroup>();
  for (const s of staff) {
    for (const o of s.current?.overrides ?? []) {
      const rate = rateOf(o);
      const key = `${o.serviceId}:${o.variantId ?? ""}:${rateKey(rate)}`;
      const g = groups.get(key) ?? {
        key,
        serviceId: o.serviceId,
        variantId: o.variantId,
        rate,
        staffIds: [],
      };
      g.staffIds.push(s.staffId);
      groups.set(key, g);
    }
  }
  const pos = (id: string) => {
    const i = serviceOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...groups.values()].sort(
    (a, b) =>
      pos(a.serviceId) - pos(b.serviceId) ||
      a.serviceId.localeCompare(b.serviceId) ||
      (a.variantId ?? "").localeCompare(b.variantId ?? "") ||
      rateKey(a.rate).localeCompare(rateKey(b.rate)),
  );
}

/** Commission of one example service price at a rate (the "e.g. 200.000đ → 20.000đ" preview). */
export function exampleCommission(rate: Rate, price: number): number {
  return rate.kind === "fixed" ? rate.amount : Math.floor((price * rate.percent) / 100 + 0.5);
}

// ─── Effective date ───────────────────────────────────────────────────────────────────────

export type EffectiveChoice = "today" | "monthStart" | "custom";

export const monthStart = (ymd: string) => `${ymd.slice(0, 8)}01`;

/** Which quick choice a date corresponds to. */
export function effectiveChoiceOf(from: string, today: string): EffectiveChoice {
  if (from === today) return "today";
  if (from === monthStart(today)) return "monthStart";
  return "custom";
}

/**
 * What saving from `from` does, as a code the screen turns into one sentence:
 * - `future`: nothing changes until then;
 * - `today`: from today, earlier months unchanged;
 * - `backdated`: services already done since `from` this month are recalculated;
 * - `earlierMonth`: an earlier (still open) month changes too.
 */
export function effectivePreview(
  from: string,
  today: string,
): "future" | "today" | "backdated" | "earlierMonth" {
  if (from > today) return "future";
  if (from === today) return "today";
  return from.slice(0, 7) === today.slice(0, 7) ? "backdated" : "earlierMonth";
}

// ─── Validation ───────────────────────────────────────────────────────────────────────────

export interface PayDraft {
  baseType: BasePayTypeValue;
  amount: number | null;
  percent: number | null;
  overrides: {
    serviceId: string;
    kind: "percent" | "fixed";
    percent: number | null;
    amount: number | null;
  }[];
  employerCost: {
    kind: "none" | "percent" | "fixed";
    percent: number | null;
    amount: number | null;
  };
}

export type PayError =
  | "amountRequired"
  | "percentRequired"
  | "percentRange"
  | "overrideRequired"
  | "employerPercentRequired"
  | "employerAmountRequired";

/** Field → error code; empty when the draft can be saved. */
export function validatePay(
  d: PayDraft,
): Partial<Record<"amount" | "percent" | "employer" | `override:${string}`, PayError>> {
  const e: Partial<Record<string, PayError>> = {};
  if (d.baseType !== "none" && (d.amount === null || d.amount <= 0)) e["amount"] = "amountRequired";
  if (d.percent === null) e["percent"] = "percentRequired";
  else if (d.percent < 0 || d.percent > 100) e["percent"] = "percentRange";
  d.overrides.forEach((o, i) => {
    if (o.kind === "percent" ? o.percent === null : o.amount === null || o.amount <= 0)
      e[`override:${String(i)}`] = "overrideRequired";
  });
  if (d.employerCost.kind === "percent" && d.employerCost.percent === null)
    e["employer"] = "employerPercentRequired";
  if (
    d.employerCost.kind === "fixed" &&
    (d.employerCost.amount === null || d.employerCost.amount <= 0)
  )
    e["employer"] = "employerAmountRequired";
  return e;
}

/** A soft warning (never blocking): an amount that is probably missing or has an extra zero. */
export function amountLooksOff(
  baseType: BasePayTypeValue,
  amount: number | null,
): "low" | "high" | null {
  if (amount === null || amount <= 0) return null;
  const [low, high] =
    baseType === "monthly"
      ? [500_000, 200_000_000]
      : baseType === "daily"
        ? [50_000, 10_000_000]
        : baseType === "hourly"
          ? [10_000, 2_000_000]
          : [0, Number.MAX_SAFE_INTEGER];
  if (amount < low) return "low";
  if (amount > high) return "high";
  return null;
}

export function employerCostOf(d: PayDraft["employerCost"]): EmployerCost | null {
  if (d.kind === "percent" && d.percent !== null) return { kind: "percent", percent: d.percent };
  if (d.kind === "fixed" && d.amount !== null) return { kind: "fixed", amount: d.amount };
  return null;
}

/** "12,5" / "12.5" → 12.5 (max two decimals); "" → null; never above 100. */
export function parsePercent(text: string): number | null {
  const clean = text.replace(",", ".").replace(/[^\d.]/g, "");
  if (clean === "" || clean === ".") return null;
  const n = Number(clean);
  if (Number.isNaN(n)) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

/** Digits of a typed VND amount ("8.000.000đ", "8,000,000") → 8000000; "" → null. */
export function parseMoney(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, 11);
  return digits === "" ? null : Math.min(10_000_000_000, Number(digits));
}

// ─── Payroll month ────────────────────────────────────────────────────────────────────────

export type MonthStatus = "future" | "open" | "closed" | "paid";

/** Open / closed / paid (closed and everyone with something to receive marked as paid). */
export function monthStatus(p: Pick<PayrollMonth, "status" | "phase" | "rows">): MonthStatus {
  if (p.status === "closed") {
    const due = p.rows.filter((r) => r.total !== 0);
    return due.length > 0 && due.every((r) => r.paidOn !== null) ? "paid" : "closed";
  }
  return p.phase === "future" ? "future" : "open";
}

export interface MonthSummary {
  /** Earned so far: the "to pay" total. */
  earned: number;
  /** Commission expected on services still to come (0 once closed). */
  projected: number;
  /** earned + projected. */
  estimate: number;
  paidCount: number;
  realCost: number;
  employerCostSet: boolean;
}

export function monthSummary(p: PayrollMonth): MonthSummary {
  const projected =
    p.status === "closed" ? 0 : p.rows.reduce((n, r) => n + r.projectedCommission, 0);
  return {
    earned: p.totals.total,
    projected,
    estimate: p.totals.total + projected,
    paidCount: p.rows.filter((r) => r.paidOn !== null).length,
    realCost: p.totals.realCost,
    employerCostSet: p.rows.some((r) => r.employerCostSet),
  };
}

/** Commission lines of one person, done first then upcoming, each by date. */
export function sortLines(items: CommissionLines["items"]): {
  earned: CommissionLines["items"];
  projected: CommissionLines["items"];
} {
  const by = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  return {
    earned: items.filter((l) => l.state === "earned").sort(by),
    projected: items.filter((l) => l.state === "projected").sort(by),
  };
}

/** Commission per service ("Sơn gel × 5 · 75.000đ"), biggest first — the staff "my earnings" list. */
export function topServices(
  items: Pick<CommissionLines["items"][number], "state" | "service" | "amount">[],
  locale: "vi" | "en",
  limit = 5,
): { name: string; count: number; amount: number }[] {
  const m = new Map<string, { name: string; count: number; amount: number }>();
  for (const l of items) {
    if (l.state !== "earned") continue;
    const name = (locale === "en" && l.service.en) || l.service.vi;
    const g = m.get(name) ?? { name, count: 0, amount: 0 };
    g.count++;
    g.amount += l.amount;
    m.set(name, g);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, limit);
}

// ─── Profit waterfall ─────────────────────────────────────────────────────────────────────

export interface WaterfallStep {
  id: "revenue" | "noShow" | "serviceCosts" | "payroll" | "otherCosts" | "net";
  /** Signed contribution (revenue +, costs −); for `net` the result. */
  amount: number;
  /** Part already happened (earned / done). */
  actual: number;
  /** Part still expected (upcoming bookings, projected commission, assumption). */
  projected: number;
  /** Running total before and after this step (bar from → to). */
  from: number;
  to: number;
}

/**
 * Revenue → no-show allowance → service costs → payroll (real cost) → other costs → net. Each step
 * splits into the part that already happened and the part still expected, so "actual vs projected"
 * is visible on the bar itself. Steps that are 0 (no-show without history) are dropped.
 */
export function waterfall(b: Profit["breakdown"]): WaterfallStep[] {
  const raw: Omit<WaterfallStep, "from" | "to">[] = [
    {
      id: "revenue",
      amount: b.revenueEarned + b.revenueUpcoming,
      actual: b.revenueEarned,
      projected: b.revenueUpcoming,
    },
    { id: "noShow", amount: -b.noShowAllowance, actual: 0, projected: b.noShowAllowance },
    {
      id: "serviceCosts",
      amount: -b.serviceCosts,
      actual: b.serviceCostsActual,
      projected: b.serviceCostsProjected,
    },
    {
      id: "payroll",
      amount: -b.payroll,
      actual: b.payroll - b.commissionProjected,
      projected: b.commissionProjected,
    },
    { id: "otherCosts", amount: -b.otherCosts, actual: b.otherCosts, projected: 0 },
  ];
  const steps: WaterfallStep[] = [];
  let run = 0;
  for (const s of raw) {
    if (s.id === "noShow" && s.amount === 0) continue;
    steps.push({ ...s, from: run, to: run + s.amount });
    run += s.amount;
  }
  steps.push({ id: "net", amount: b.netProfit, actual: 0, projected: 0, from: 0, to: b.netProfit });
  return steps;
}

/** Scale of a waterfall: smallest and largest running totals (always including 0). */
export function waterfallRange(steps: WaterfallStep[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const s of steps) {
    min = Math.min(min, s.from, s.to);
    max = Math.max(max, s.from, s.to);
  }
  return { min, max: max === min ? min + 1 : max };
}
