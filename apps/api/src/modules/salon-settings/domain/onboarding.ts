import type { OnboardingStep } from "@gugu/contracts";

export interface OnboardingFacts {
  hasAddressAndPhone: boolean;
  activeServices: number;
  openingDays: number;
  /** Bookable staff with at least one schedule row and one service assignment. */
  readyStaff: number;
  status: "draft" | "pending_review" | "active" | "suspended" | "closed";
}

/** Setup checklist (07 §3.7). Go-live needs every step before "live". */
export function onboardingProgress(f: OnboardingFacts): {
  done: OnboardingStep[];
  canGoLive: boolean;
} {
  const done: OnboardingStep[] = [];
  if (f.hasAddressAndPhone) done.push("business");
  if (f.activeServices > 0) done.push("services");
  if (f.openingDays > 0) done.push("hours");
  if (f.readyStaff > 0) done.push("team");
  const canGoLive = done.length === 4 && f.status === "draft";
  if (f.status === "active") done.push("live");
  return { done, canGoLive };
}
