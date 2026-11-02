import { describe, expect, it } from "vitest";
import { ENTITLEMENT_KEYS, type EntitlementKey } from "@gugu/contracts";
import { PLAN_CATALOG } from "./plan-catalog";

const booleanKeys = (Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[]).filter(
  (k) => ENTITLEMENT_KEYS[k].type === "boolean",
);
const limitKeys = (Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[]).filter(
  (k) => ENTITLEMENT_KEYS[k].type === "limit",
);

describe("plan catalogue", () => {
  it("has the public plans basic, pro, ultra, an internal trial, and no free plan", () => {
    expect(Object.keys(PLAN_CATALOG).toSorted()).toEqual(["basic", "pro", "trial", "ultra"]);
    expect(PLAN_CATALOG.trial.isPublic).toBe(false);
    expect(Object.keys(PLAN_CATALOG)).not.toContain("free");
  });

  it("puts AI onboarding import in every plan and the assistant + review from Pro", () => {
    for (const plan of Object.values(PLAN_CATALOG)) {
      expect(plan.entitlements["ai.onboarding_import"]).toBe(true);
    }
    expect(PLAN_CATALOG.basic.entitlements["ai.agent.enabled"]).toBe(false);
    expect(PLAN_CATALOG.basic.entitlements["ai.monthly_review"]).toBe(false);
    for (const code of ["pro", "ultra"] as const) {
      expect(PLAN_CATALOG[code].entitlements["ai.agent.enabled"]).toBe(true);
      expect(PLAN_CATALOG[code].entitlements["ai.monthly_review"]).toBe(true);
    }
  });

  it("gives the trial Pro features with Basic limits", () => {
    for (const key of booleanKeys) {
      expect(PLAN_CATALOG.trial.entitlements[key], key).toBe(PLAN_CATALOG.pro.entitlements[key]);
    }
    for (const key of limitKeys) {
      expect(PLAN_CATALOG.trial.entitlements[key], key).toBe(PLAN_CATALOG.basic.entitlements[key]);
    }
    expect(PLAN_CATALOG.trial.entitlements["ai.monthly_cost_cap_vnd"]).toBe(20_000);
  });

  it("matches the owner-approved caps", () => {
    const caps = (code: keyof typeof PLAN_CATALOG) => [
      PLAN_CATALOG[code].entitlements["ai.monthly_cost_cap_vnd"],
      PLAN_CATALOG[code].entitlements["zalo_template.monthly_messages"],
      PLAN_CATALOG[code].entitlements["notifications.sms.monthly_messages"],
    ];
    expect(caps("basic")).toEqual([20_000, 100, 30]);
    expect(caps("pro")).toEqual([250_000, 300, 80]);
    expect(caps("ultra")).toEqual([600_000, 1_000, 200]);
  });

  it("reserves chain reporting, admin-level analytics and promotion credits for Ultra", () => {
    expect(PLAN_CATALOG.ultra.entitlements["analytics.chain_reporting"]).toBe(true);
    expect(PLAN_CATALOG.ultra.entitlements["analytics.advanced"]).toBe(true);
    expect(PLAN_CATALOG.ultra.entitlements["salon.max_locations"]).toBe("unlimited");
    expect(PLAN_CATALOG.pro.entitlements["analytics.advanced"]).toBe(false);
    expect(PLAN_CATALOG.pro.entitlements["promotion.weekly_credits_per_month"]).toBe(0);
  });
});
