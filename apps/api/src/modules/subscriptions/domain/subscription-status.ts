import type { SubscriptionStatus } from "@gugu/contracts";

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

/**
 * Status as it should be read now: a trial past its end is `expired` even before the
 * expiry job has written the transition, so access never depends on job timing.
 */
export function effectiveStatus(
  sub: { status: SubscriptionStatus; trialEndsAt: Date | null },
  now: Date,
): SubscriptionStatus {
  if (sub.status === "trialing" && sub.trialEndsAt !== null && sub.trialEndsAt <= now) {
    return "expired";
  }
  return sub.status;
}
