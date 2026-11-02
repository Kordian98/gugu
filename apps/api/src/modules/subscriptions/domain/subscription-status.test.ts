import { describe, expect, it } from "vitest";
import { canTransition, effectiveStatus, isCurrent } from "./subscription-status";

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
});
