import { describe, expect, it } from "vitest";
import { onboardingProgress, type OnboardingFacts } from "./onboarding";

const base: OnboardingFacts = {
  hasAddressAndPhone: false,
  activeServices: 0,
  openingDays: 0,
  readyStaff: 0,
  status: "draft",
};

describe("onboarding progress", () => {
  it("starts empty and cannot go live", () => {
    expect(onboardingProgress(base)).toEqual({ done: [], canGoLive: false });
  });
  it("allows go-live once business, services, hours and team are done", () => {
    const r = onboardingProgress({
      ...base,
      hasAddressAndPhone: true,
      activeServices: 2,
      openingDays: 6,
      readyStaff: 1,
    });
    expect(r).toEqual({ done: ["business", "services", "hours", "team"], canGoLive: true });
  });
  it("marks live for active salons and never offers go-live again", () => {
    const r = onboardingProgress({ ...base, hasAddressAndPhone: true, status: "active" });
    expect(r.done).toEqual(["business", "live"]);
    expect(r.canGoLive).toBe(false);
  });
});
