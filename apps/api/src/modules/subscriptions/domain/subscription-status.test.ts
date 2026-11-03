import { describe, expect, it } from "vitest";
import { canTransition, effectivePlan, effectiveStatus, isCurrent } from "./subscription-status";

describe("subscription state machine", () => {
  it.each([
    ["trialing", "active"],
    ["trialing", "expired"],
    ["active", "past_due"],
    ["past_due", "active"],
    ["active", "cancelled"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["expired", "active"],
    ["cancelled", "active"],
    ["active", "trialing"],
    ["trialing", "trialing"],
    ["expired", "trialing"],
  ] as const)("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("treats only trialing, active and past_due as current", () => {
    expect(["trialing", "active", "past_due"].every((s) => isCurrent(s as never))).toBe(true);
    expect(isCurrent("expired")).toBe(false);
    expect(isCurrent("cancelled")).toBe(false);
  });

  it("reads a trial past its end as expired before the job runs", () => {
    const trialEndsAt = new Date("2026-11-16T00:00:00Z");
    const sub = { status: "trialing" as const, trialEndsAt };
    expect(effectiveStatus(sub, new Date("2026-11-15T23:59:59Z"))).toBe("trialing");
    expect(effectiveStatus(sub, trialEndsAt)).toBe("expired");
    expect(effectiveStatus({ status: "active", trialEndsAt }, new Date("2027-01-01Z"))).toBe(
      "active",
    );
  });

  it("X25: an ended trial inside the free year reads as active Basic; after it, expired", () => {
    const trialEndsAt = new Date("2026-11-16T00:00:00Z");
    const freeUntil = new Date("2027-11-03T17:00:00Z");
    const sub = { status: "trialing" as const, trialEndsAt, freeUntil };
    const during = new Date("2026-11-20T00:00:00Z");
    expect(effectiveStatus(sub, new Date("2026-11-15T00:00:00Z"))).toBe("trialing");
    expect(effectivePlan(sub, "trial", new Date("2026-11-15T00:00:00Z"))).toBe("trial");
    expect(effectiveStatus(sub, during)).toBe("active");
    expect(effectivePlan(sub, "trial", during)).toBe("basic");
    expect(effectiveStatus(sub, freeUntil)).toBe("expired");
    expect(effectivePlan(sub, "trial", freeUntil)).toBe("trial");
    // A stored Basic subscription is never re-mapped.
    expect(effectivePlan({ status: "active", trialEndsAt, freeUntil }, "pro", during)).toBe("pro");
  });
});
