import type { BillingInterval, PlanCode } from "./entitlements";

/**
 * List prices (owner X25 + X27, 2026-11-04). Display only: GuGu invoices manually and never
 * charges automatically; no payment method is needed to start. VND has no minor unit.
 *
 * One source for every surface: the landing pricing assistant, Settings → Plan (via the API) and
 * the admin panel. The database rows in `plan_prices` are inserted by migrations
 * (`x25_basic_free_year`, `x27_plan_prices`); `plan-prices.int.test.ts` in apps/api asserts the
 * database matches this file. Changing a price = new migration + edit here.
 */
export type PublicPlanCode = Exclude<PlanCode, "trial">;

export const PUBLIC_PLANS = ["basic", "pro", "ultra"] as const satisfies readonly PublicPlanCode[];

export const PLAN_MONTHLY_PRICE_VND = {
  basic: 99_000,
  pro: 299_000,
  ultra: 699_000,
} as const satisfies Record<PublicPlanCode, number>;

/** X27: yearly billing = 2 months free, i.e. the year costs this many monthly prices. */
export const YEARLY_BILLED_MONTHS = 10;

/** List price of one billing period (a month or a year) in VND. */
export function planPriceVnd(plan: PublicPlanCode, interval: BillingInterval): number {
  const monthly = PLAN_MONTHLY_PRICE_VND[plan];
  return interval === "month" ? monthly : monthly * YEARLY_BILLED_MONTHS;
}

/** Every (plan, interval) price, as stored in `plan_prices`. */
export const PLAN_LIST_PRICES_VND: Record<PublicPlanCode, Record<BillingInterval, number>> = {
  basic: { month: planPriceVnd("basic", "month"), year: planPriceVnd("basic", "year") },
  pro: { month: planPriceVnd("pro", "month"), year: planPriceVnd("pro", "year") },
  ultra: { month: planPriceVnd("ultra", "month"), year: planPriceVnd("ultra", "year") },
};
