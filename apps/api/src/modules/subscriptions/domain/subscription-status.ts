import type { PlanCode, SubscriptionStatus } from "@gugu/contracts";
import { isInFreeYear } from "./free-year";

/**
 * Subscription state machine (spec 12 R-S3). Billing is manual, so admin drives most transitions;
 * the system only ends trials. `cancelled` and `expired` are terminal — a returning salon gets a
 * new subscription row, which keeps history intact.
 */
const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  trialing: ["active", "expired", "cancelled"],
  active: ["past_due", "cancelled", "expired"],
  past_due: ["active", "cancelled", "expired"],
  cancelled: [],
  expired: [],
};

/** Statuses that grant the plan's entitlements. At most one per salon (partial unique index). */
export const CURRENT_STATUSES = [
  "trialing",
  "active",
  "past_due",
] as const satisfies readonly SubscriptionStatus[];

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isCurrent(status: SubscriptionStatus): boolean {
  return (CURRENT_STATUSES as readonly SubscriptionStatus[]).includes(status);
}

export interface SubscriptionTimes {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  /** X25 free Basic year end; optional for callers that predate it (treated as none). */
  freeUntil?: Date | null;
}

/** True when a stored trial has passed its end (whatever the end-of-trial job has written). */
export function trialEnded(sub: SubscriptionTimes, now: Date): boolean {
  return sub.status === "trialing" && sub.trialEndsAt !== null && sub.trialEndsAt <= now;
}

/**
 * Status as it should be read now, so access never depends on job timing:
 * - a trial past its end falls to free Basic (`active`) while the free year runs (X25);
 * - otherwise a trial past its end is `expired`.
 */
export function effectiveStatus(sub: SubscriptionTimes, now: Date): SubscriptionStatus {
  if (trialEnded(sub, now)) return isInFreeYear(sub.freeUntil ?? null, now) ? "active" : "expired";
  return sub.status;
}

/** Plan as it should be read now: an ended trial inside the free year reads as `basic` (X25). */
export function effectivePlan(sub: SubscriptionTimes, plan: PlanCode, now: Date): PlanCode {
  return trialEnded(sub, now) && isInFreeYear(sub.freeUntil ?? null, now) ? "basic" : plan;
}
