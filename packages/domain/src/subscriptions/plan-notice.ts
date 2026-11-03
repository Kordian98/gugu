import { PLAN_ENDING_NOTICE_DAYS, type SalonEntitlements } from "@gugu/contracts";

const DAY_MS = 86_400_000;

export type PlanNotice =
  | { kind: "trial_ends"; endsAt: Date; freeUntil: Date | null }
  | { kind: "free_year_ends"; endsAt: Date };

type PlanState = Pick<SalonEntitlements, "plan" | "status" | "trialEndsAt" | "freeUntil">;

/**
 * X25 owner notice on Today: shown in the last 14 days before the Pro trial or the free Basic year
 * ends (display only; the API decides access). The trial notice wins when both are close.
 */
export function planEndingNotice(state: PlanState, now: Date): PlanNotice | null {
  const within = (at: Date) =>
    at.getTime() > now.getTime() &&
    at.getTime() - now.getTime() <= PLAN_ENDING_NOTICE_DAYS * DAY_MS;
  const freeUntil = state.freeUntil ? new Date(state.freeUntil) : null;
  if (state.status === "trialing" && state.trialEndsAt) {
    const endsAt = new Date(state.trialEndsAt);
    return within(endsAt) ? { kind: "trial_ends", endsAt, freeUntil } : null;
  }
  if (state.plan === "basic" && (state.status === "active" || state.status === "past_due")) {
    return freeUntil && within(freeUntil) ? { kind: "free_year_ends", endsAt: freeUntil } : null;
  }
  return null;
}

/** The last free day for display: the free year ends at an exclusive midnight. */
export function lastFreeInstant(freeUntil: Date): Date {
  return new Date(freeUntil.getTime() - 1);
}
