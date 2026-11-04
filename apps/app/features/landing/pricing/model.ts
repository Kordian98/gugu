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
/** The three questions, in order. All are preselected by `DEFAULT_ANSWERS`. */
export const QUESTION_KEYS = ["team", "ai", "multi"] as const satisfies readonly (keyof Answers)[];

/**
 * Defaults per team answer: bookings per week and average service price (the visitor can change
 * both in "Cách tính"), the staff count assumed for payroll (2–5 → 4, 6+ → 8; just me → none) and,
 * when the visitor wants the assistant, the owner time Gu answers instead of digging through
 * reports (≈ 3 / 4 / 5 h a month, more staff = more questions about numbers and people; owner,
 * 2026-11-05; at or above the 2–3 h floor).
 */
export const TEAM_DEFAULTS: Record<
  Team,
  { weekly: number; price: number; staff: number; assistantMinutes: number }
> = {
  solo: { weekly: 25, price: 250_000, staff: 0, assistantMinutes: 180 },
  small: { weekly: 70, price: 300_000, staff: 4, assistantMinutes: 240 },
  large: { weekly: 160, price: 350_000, staff: 8, assistantMinutes: 300 },
};

/**
 * Assumptions (not measurements): weeks per month; minutes of confirming / reminding / rebooking per
 * booking that self-booking and automatic reminders take over; share of no-shows; share of no-shows
 * that reminders prevent. 25 % is at the low end of what healthcare reminder studies report
 * (BMJ Open 2016; Hasvold & Wootton 2011, ≈ 34 %).
 */
/**
 * A salon that wants the AI assistant (Pro) usually has more clients: its default bookings per week
 * are this much higher than the same team size on Basic (assumption, shown and editable in
 * "Cách tính"; an edited number replaces the profile default for every plan).
 */
export const PRO_VOLUME_UPLIFT = 0.35;

export const ASSUMPTIONS = {
  weeksPerMonth: 4.33,
  minutesPerBooking: 3,
  noShowRate: 0.1,
  reminderCut: 0.25,
  /**
   * Owner time by hand (notebook / Excel) that payroll, commissions and "Tháng này" take over, all
   * in every plan, per month: commissions ≈ 1 h per staff member (collecting completed services,
   * applying rates, checking; owner, 2026-11-05), payroll assembly (low end of 20–30 min per staff
   * member) and the profit tally (low end of 1–2 h). A solo salon has no commissions or payroll.
   */
  commissionMinutesPerStaff: 60,
  payrollMinutesPerStaff: 20,
  profitTallyMinutes: 60,
} as const;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Profile defaults from the answers: team-size volume, +35 % bookings when the assistant is wanted. */
export type Profile = {
  weekly: number;
  price: number;
  staff: number;
  /** Owner minutes a month the assistant saves (0 unless "Muốn trợ lý AI?" = Có). */
  assistantMinutes: number;
  uplift: boolean;
};

export function profileDefaults(a: Answers): Profile {
  const d = TEAM_DEFAULTS[a.team];
  const weekly = a.ai ? roundTo(d.weekly * (1 + PRO_VOLUME_UPLIFT), LIMITS.weekly.step) : d.weekly;
  return {
    weekly,
    price: d.price,
    staff: d.staff,
    assistantMinutes: a.ai ? d.assistantMinutes : 0,
    uplift: a.ai,
  };
}

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
  /** Front-desk hours saved per month (confirming, reminding, rebooking; whole hours). */
  hours: number;
  /** Owner hours saved per month (payroll, commissions, profit tally; whole hours, ≥ 1). */
  ownerHours: number;
  /** No-shows avoided per month (one decimal). */
  noShowsAvoided: number;
  /** Revenue kept per month, rounded to 1,000 đ. */
  keptVnd: number;
};

/**
 * Owner minutes per month: staff × (commissions + payroll assembly) + the profit tally, plus the
 * assistant's time on Pro.
 */
export function ownerMinutes(staff: number, assistantMinutes = 0): number {
  const { commissionMinutesPerStaff, payrollMinutesPerStaff, profitTallyMinutes } = ASSUMPTIONS;
  return (
    staff * (commissionMinutesPerStaff + payrollMinutesPerStaff) +
    profitTallyMinutes +
    assistantMinutes
  );
}

export function estimate(weekly: number, price: number, staff = 0, assistantMinutes = 0): Estimate {
  const { weeksPerMonth, minutesPerBooking, noShowRate, reminderCut } = ASSUMPTIONS;
  const bookingsPerMonth = Math.round(weekly * weeksPerMonth);
  const avoided = bookingsPerMonth * noShowRate * reminderCut;
  return {
    bookingsPerMonth,
    hours: Math.round((bookingsPerMonth * minutesPerBooking) / 60),
    ownerHours: Math.max(1, Math.round(ownerMinutes(staff, assistantMinutes) / 60)),
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
  staff = 0,
  assistantMinutes = 0,
): Advice {
  const billed = billedPlan(plan);
  // The assistant's time only counts on a plan that has the assistant (Pro; Ultra starts on Pro).
  const e = estimate(weekly, price, staff, billed === "pro" ? assistantMinutes : 0);
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
