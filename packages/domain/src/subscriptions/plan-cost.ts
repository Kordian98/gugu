import {
  type BillingInterval,
  PLAN_MONTHLY_PRICE_VND,
  type PublicPlanCode,
  YEARLY_BILLED_MONTHS,
  planPriceVnd,
} from "@gugu/contracts";

export type PlanCost = {
  plan: PublicPlanCode;
  interval: BillingInterval;
  /** What the first 12 months cost (Basic: free year, X25; Pro/Ultra: after the 14-day trial). */
  firstYearVnd: number;
  /** First-year cost per month (yearly billing spread over 12 months, rounded to whole đồng). */
  firstYearPerMonthVnd: number;
  /** Price of one billing period from the second year on (a month or a year). */
  laterPeriodVnd: number;
  /** Later cost per month (yearly billing spread over 12 months, rounded). */
  laterPerMonthVnd: number;
  /** Saving of yearly vs monthly billing over one year (X27: 2 months free). 0 while free. */
  yearlySavingVnd: number;
};

const MONTHS = 12;

/**
 * List-price cost of a plan (X25, X27). Display only: GuGu invoices manually and never charges
 * automatically. Pro and Ultra are paid from the end of the 14-day trial; Basic is free for its
 * first 12 months, then billed like the others.
 */
export function planCost(plan: PublicPlanCode, interval: BillingInterval): PlanCost {
  const monthly = PLAN_MONTHLY_PRICE_VND[plan];
  const yearly = interval === "year";
  const yearCost = yearly ? planPriceVnd(plan, "year") : monthly * MONTHS;
  const freeFirstYear = plan === "basic";
  const firstYearVnd = freeFirstYear ? 0 : yearCost;
  const saving = yearly ? monthly * (MONTHS - YEARLY_BILLED_MONTHS) : 0;
  return {
    plan,
    interval,
    firstYearVnd,
    firstYearPerMonthVnd: Math.round(firstYearVnd / MONTHS),
    laterPeriodVnd: planPriceVnd(plan, interval),
    laterPerMonthVnd: Math.round(yearCost / MONTHS),
    yearlySavingVnd: freeFirstYear ? 0 : saving,
  };
}

/** The saving of yearly billing after the free Basic year (2 × the monthly price). */
export function yearlySavingVnd(plan: PublicPlanCode): number {
  return PLAN_MONTHLY_PRICE_VND[plan] * (MONTHS - YEARLY_BILLED_MONTHS);
}
