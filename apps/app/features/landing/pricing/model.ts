import type { BillingInterval, PublicPlanCode } from "@gugu/contracts";
import { planCost } from "@gugu/domain";

/**
 * Landing buying assistant (X27, owner 2026-11-04): three one-tap questions recommend a plan; the
 * cost comes from the shared list prices (@gugu/contracts) and the savings are an illustrative,
 * conservative estimate from the assumptions below (shown in "Cách tính").
 */
export type Team = "solo" | "small" | "large";
export type Answers = { team: Team; ai: boolean; multi: boolean };

export const TEAMS = ["solo", "small", "large"] as const satisfies readonly Team[];
export const DEFAULT_ANSWERS: Answers = { team: "small", ai: false, multi: false };

/** Defaults the visitor can change in "Cách tính": bookings per week and average service price. */
export const TEAM_DEFAULTS: Record<Team, { weekly: number; price: number }> = {
  solo: { weekly: 25, price: 250_000 },
  small: { weekly: 70, price: 300_000 },
  large: { weekly: 160, price: 350_000 },
};

/**
 * Assumptions (not measurements): weeks per month; minutes of confirming / reminding / rebooking per
 * booking that self-booking and automatic reminders take over; share of no-shows; share of no-shows
 * that reminders prevent. 25 % is at the low end of what healthcare reminder studies report
 * (BMJ Open 2016; Hasvold & Wootton 2011, ≈ 34 %).
 */
export const ASSUMPTIONS = {
  weeksPerMonth: 4.33,
  minutesPerBooking: 3,
  noShowRate: 0.1,
  reminderCut: 0.25,
} as const;

export const LIMITS = {
  weekly: { min: 5, max: 600, step: 5 },
  price: { min: 50_000, max: 2_000_000, step: 50_000 },
} as const;

/** Multiple locations need Ultra (salon.max_locations); the assistant needs Pro (ai.agent.enabled). */
export function recommend(a: Answers): PublicPlanCode {
  if (a.multi) return "ultra";
  if (a.ai) return "pro";
  return "basic";
}

export type Estimate = {
  bookingsPerMonth: number;
  /** Hours saved per month (whole hours). */
  hours: number;
  /** No-shows avoided per month (one decimal). */
  noShowsAvoided: number;
  /** Revenue kept per month, rounded to 1,000 đ. */
  keptVnd: number;
};

export function estimate(weekly: number, price: number): Estimate {
  const { weeksPerMonth, minutesPerBooking, noShowRate, reminderCut } = ASSUMPTIONS;
  const bookingsPerMonth = Math.round(weekly * weeksPerMonth);
  const avoided = bookingsPerMonth * noShowRate * reminderCut;
  return {
    bookingsPerMonth,
    hours: Math.round((bookingsPerMonth * minutesPerBooking) / 60),
    noShowsAvoided: Math.round(avoided * 10) / 10,
    keptVnd: Math.round((avoided * price) / 1000) * 1000,
  };
}

/**
 * The plan a visitor actually starts on and pays for. Ultra's multi-location features are not built
 * yet (q106), so an Ultra recommendation starts on Pro and is billed as Pro until they ship.
 */
export function billedPlan(plan: PublicPlanCode): PublicPlanCode {
  return plan === "ultra" ? "pro" : plan;
}

export type Advice = {
  plan: PublicPlanCode;
  /** What is billed today (`billedPlan`); `cost` is for this plan. */
  billed: PublicPlanCode;
  estimate: Estimate;
  cost: ReturnType<typeof planCost>;
  /** Revenue kept minus the plan's monthly cost in the first year (may be negative). */
  netFirstYearPerMonthVnd: number;
  /** Same after the first year. */
  netLaterPerMonthVnd: number;
};

export function advise(
  plan: PublicPlanCode,
  interval: BillingInterval,
  weekly: number,
  price: number,
): Advice {
  const e = estimate(weekly, price);
  const billed = billedPlan(plan);
  const cost = planCost(billed, interval);
  return {
    plan,
    billed,
    estimate: e,
    cost,
    netFirstYearPerMonthVnd: e.keptVnd - cost.firstYearPerMonthVnd,
    netLaterPerMonthVnd: e.keptVnd - cost.laterPerMonthVnd,
  };
}
