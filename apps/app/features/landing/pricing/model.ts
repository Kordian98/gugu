import type { BillingInterval, PublicPlanCode } from "@gugu/contracts";
import { planCost } from "@gugu/domain";

/**
 * Landing buying assistant (X27, owner 2026-11-04/05): three one-tap questions recommend a plan;
 * the cost comes from the shared list prices (@gugu/contracts) and the savings are an
 * illustrative, conservative estimate from the assumptions below (all shown in "Cách tính").
 */
export type Team = "solo" | "small" | "large";
export type Answers = { team: Team; ai: boolean; multi: boolean };

export const TEAMS = ["solo", "small", "large"] as const satisfies readonly Team[];
export const DEFAULT_ANSWERS: Answers = { team: "small", ai: false, multi: false };
/** The three questions, in order. All are preselected by `DEFAULT_ANSWERS`. */
export const QUESTION_KEYS = ["team", "ai", "multi"] as const satisfies readonly (keyof Answers)[];

/**
 * Defaults per team answer, per location: bookings per week and average service price (editable
 * in "Cách tính"), staff for payroll (2–5 → 4, 6+ → 8; just me → none) and, when the visitor wants
 * the assistant, owner time Gu answers instead of digging through reports (≈ 3 / 4 / 5 h a month;
 * owner, 2026-11-05).
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
 * A salon that wants the AI assistant usually has more clients: its default bookings are this much
 * higher than the same team size without it (assumption; an edited number replaces it everywhere).
 */
export const PRO_VOLUME_UPLIFT = 0.35;

/** "Nhiều cơ sở" asks nothing more: 2 locations by default (the low end of 2–3), editable. */
export const DEFAULT_MULTI_LOCATIONS = 2;

/**
 * Assumptions (not measurements), per month unless noted:
 * - front desk: weeks per month; minutes of confirming / reminding / rebooking per booking that
 *   self-booking and automatic reminders take over; no-shows; share reminders prevent (25 % is the
 *   low end of healthcare reminder studies: BMJ Open 2016; Hasvold & Wootton 2011, ≈ 34 %);
 * - owner, by hand in a notebook / Excel, all in every plan: commissions ≈ 1 h per staff member
 *   (owner, 2026-11-05), payroll assembly 20 min per staff member, the profit tally 1 h;
 * - several locations (Ultra): merging each location's notebook / Excel into one report ≈ 2 h per
 *   location; one shared client list and calendar ≈ 1 h per location per week fewer calls between
 *   branches (front desk / manager). Payroll and commissions count staff across all locations.
 */
export const ASSUMPTIONS = {
  weeksPerMonth: 4.33,
  minutesPerBooking: 3,
  noShowRate: 0.1,
  reminderCut: 0.25,
  commissionMinutesPerStaff: 60,
  payrollMinutesPerStaff: 20,
  profitTallyMinutes: 60,
  reportMergeMinutesPerLocation: 120,
  branchCallMinutesPerLocationWeek: 60,
} as const;

export const LIMITS = {
  weekly: { min: 5, max: 2000, step: 5 },
  price: { min: 50_000, max: 2_000_000, step: 50_000 },
  locations: { min: 2, max: 10, step: 1 },
} as const;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export type Profile = {
  /** Locations (1, or the multi-location default / the visitor's number). */
  locations: number;
  /** Bookings per week across all locations. */
  weekly: number;
  price: number;
  /** Staff across all locations. */
  staff: number;
  /** Owner minutes a month the assistant saves (0 unless "Muốn trợ lý AI?" = Có). */
  assistantMinutes: number;
  uplift: boolean;
};

/**
 * Profile defaults from the answers: per-location team volume × locations (+35 % bookings when the
 * assistant is wanted), staff × locations, the assistant's time.
 */
export function profileDefaults(a: Answers, locations?: number): Profile {
  const d = TEAM_DEFAULTS[a.team];
  const locs = a.multi ? (locations ?? DEFAULT_MULTI_LOCATIONS) : 1;
  const perLocation = a.ai ? d.weekly * (1 + PRO_VOLUME_UPLIFT) : d.weekly;
  return {
    locations: locs,
    weekly: roundTo(perLocation * locs, LIMITS.weekly.step),
    price: d.price,
    staff: d.staff * locs,
    assistantMinutes: a.ai ? d.assistantMinutes : 0,
    uplift: a.ai,
  };
}

/** Multiple locations need Ultra (salon.max_locations); the assistant needs Pro (ai.agent.enabled). */
export function recommend(a: Answers): PublicPlanCode {
  if (a.multi) return "ultra";
  if (a.ai) return "pro";
  return "basic";
}

/** Plans with the Gu assistant. */
export const hasAssistant = (plan: PublicPlanCode) => plan !== "basic";

export type Estimate = {
  bookingsPerMonth: number;
  /** Front-desk hours saved per month (bookings work + fewer calls between branches). */
  hours: number;
  /** Owner hours saved per month (commissions, payroll, profit, reports, assistant; ≥ 1). */
  ownerHours: number;
  /** No-shows avoided per month (one decimal). */
  noShowsAvoided: number;
  /** Revenue kept per month, rounded to 1,000 đ. */
  keptVnd: number;
};

export type EstimateInput = {
  weekly: number;
  price: number;
  staff?: number;
  /** Assistant minutes, already zero on plans without the assistant. */
  assistantMinutes?: number;
  /** Locations whose multi-location savings count (Ultra only; 1 = none). */
  locations?: number;
};

/** Owner minutes per month: staff × (commissions + payroll) + profit tally + assistant + reports. */
export function ownerMinutes(staff: number, assistantMinutes = 0, locations = 1): number {
  const a = ASSUMPTIONS;
  const reports = locations > 1 ? locations * a.reportMergeMinutesPerLocation : 0;
  return (
    staff * (a.commissionMinutesPerStaff + a.payrollMinutesPerStaff) +
    a.profitTallyMinutes +
    assistantMinutes +
    reports
  );
}

/** Front-desk minutes per month: bookings work + fewer calls between branches (several locations). */
export function frontDeskMinutes(bookingsPerMonth: number, locations = 1): number {
  const a = ASSUMPTIONS;
  const calls =
    locations > 1 ? locations * a.branchCallMinutesPerLocationWeek * a.weeksPerMonth : 0;
  return bookingsPerMonth * a.minutesPerBooking + calls;
}

export function estimate({
  weekly,
  price,
  staff = 0,
  assistantMinutes = 0,
  locations = 1,
}: EstimateInput): Estimate {
  const { weeksPerMonth, noShowRate, reminderCut } = ASSUMPTIONS;
  const bookingsPerMonth = Math.round(weekly * weeksPerMonth);
  const avoided = bookingsPerMonth * noShowRate * reminderCut;
  return {
    bookingsPerMonth,
    hours: Math.round(frontDeskMinutes(bookingsPerMonth, locations) / 60),
    ownerHours: Math.max(1, Math.round(ownerMinutes(staff, assistantMinutes, locations) / 60)),
    noShowsAvoided: Math.round(avoided * 10) / 10,
    keptVnd: Math.round((avoided * price) / 1000) * 1000,
  };
}

export type Advice = {
  plan: PublicPlanCode;
  estimate: Estimate;
  cost: ReturnType<typeof planCost>;
  /** Locations whose multi-location savings count (Ultra only). */
  countedLocations: number;
  /** Assistant minutes counted (plans with the assistant only). */
  countedAssistantMinutes: number;
  /** Revenue kept minus the plan's monthly cost in the first year (may be negative). */
  netFirstYearPerMonthVnd: number;
  /** Same after the first year. */
  netLaterPerMonthVnd: number;
};

/**
 * Same inputs for every plan; what differs is only what the plan itself does: the assistant's time
 * (Pro, Ultra), the multi-location savings (Ultra) and the plan's own fee.
 */
export function advise(plan: PublicPlanCode, interval: BillingInterval, p: Profile): Advice {
  const countedAssistantMinutes = hasAssistant(plan) ? p.assistantMinutes : 0;
  const countedLocations = plan === "ultra" ? p.locations : 1;
  const e = estimate({
    weekly: p.weekly,
    price: p.price,
    staff: p.staff,
    assistantMinutes: countedAssistantMinutes,
    locations: countedLocations,
  });
  const cost = planCost(plan, interval);
  return {
    plan,
    estimate: e,
    cost,
    countedLocations,
    countedAssistantMinutes,
    netFirstYearPerMonthVnd: e.keptVnd - cost.firstYearPerMonthVnd,
    netLaterPerMonthVnd: e.keptVnd - cost.laterPerMonthVnd,
  };
}
