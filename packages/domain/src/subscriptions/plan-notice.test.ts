import { describe, expect, it } from "vitest";
import { lastFreeInstant, planEndingNotice } from "./plan-notice";

const now = new Date("2026-11-03T05:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("planEndingNotice (X25 Today notice)", () => {
  it("warns in the last 14 days of the trial, naming the free Basic year after it", () => {
    const state = {
      plan: "trial",
      status: "trialing",
      trialEndsAt: inDays(10),
      freeUntil: inDays(360),
    } as const;
    expect(planEndingNotice(state, now)).toEqual({
      kind: "trial_ends",
      endsAt: new Date(inDays(10)),
      freeUntil: new Date(inDays(360)),
    });
    expect(planEndingNotice({ ...state, trialEndsAt: inDays(14.5) }, now)).toBeNull();
    expect(planEndingNotice({ ...state, trialEndsAt: inDays(14) }, now)?.kind).toBe("trial_ends");
  });

  it("warns in the last 14 days of the free Basic year, not before and not after", () => {
    const state = {
      plan: "basic",
      status: "active",
      trialEndsAt: inDays(-300),
      freeUntil: inDays(7),
    } as const;
    expect(planEndingNotice(state, now)).toEqual({
      kind: "free_year_ends",
      endsAt: new Date(inDays(7)),
    });
    expect(planEndingNotice({ ...state, freeUntil: inDays(20) }, now)).toBeNull();
    expect(planEndingNotice({ ...state, freeUntil: inDays(-1) }, now)).toBeNull();
    expect(planEndingNotice({ ...state, freeUntil: null }, now)).toBeNull();
  });

  it("stays quiet on Pro, Ultra and ended subscriptions", () => {
    for (const plan of ["pro", "ultra"] as const) {
      expect(
        planEndingNotice({ plan, status: "active", trialEndsAt: null, freeUntil: inDays(3) }, now),
      ).toBeNull();
    }
    expect(
      planEndingNotice(
        { plan: "basic", status: "cancelled", trialEndsAt: null, freeUntil: inDays(3) },
        now,
      ),
    ).toBeNull();
  });

  it("shows the day before the exclusive midnight as the last free day", () => {
    expect(lastFreeInstant(new Date("2027-11-03T17:00:00Z")).toISOString()).toBe(
      "2027-11-03T16:59:59.999Z",
    );
  });
});
