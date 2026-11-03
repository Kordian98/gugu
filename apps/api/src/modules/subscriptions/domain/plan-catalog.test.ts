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

  it("gives the trial Pro features with Basic limits, except an explicit 20k AI cap (X25, q96)", () => {
    for (const key of booleanKeys) {
      expect(PLAN_CATALOG.trial.entitlements[key], key).toBe(PLAN_CATALOG.pro.entitlements[key]);
    }
    for (const key of limitKeys.filter((k) => k !== "ai.monthly_cost_cap_vnd")) {
      expect(PLAN_CATALOG.trial.entitlements[key], key).toBe(PLAN_CATALOG.basic.entitlements[key]);
    }
    expect(PLAN_CATALOG.trial.entitlements["ai.monthly_cost_cap_vnd"]).toBe(20_000);
  });

  it("X25: Basic has the AI import and Zalo but no assistant, with an import-sized AI cap", () => {
    const basic = PLAN_CATALOG.basic.entitlements;
    expect(basic["ai.onboarding_import"]).toBe(true);
    expect(basic["ai.agent.enabled"]).toBe(false);
    expect(basic["ai.monthly_review"]).toBe(false);
    expect(basic["zalo.oa_connect"]).toBe(true);
    expect(basic["zalo.inbox"]).toBe(true);
    expect(basic["ai.monthly_cost_cap_vnd"]).toBe(10_000);
    expect(PLAN_CATALOG.basic.version).toBe(2);
  });

  it("full entitlement matrix per plan", () => {
    const matrix = Object.fromEntries(
      (["basic", "pro", "ultra", "trial"] as const).map((code) => [
        code,
        PLAN_CATALOG[code].entitlements,
      ]),
    );
    expect(matrix).toMatchInlineSnapshot(`
      {
        "basic": {
          "ai.agent.enabled": false,
          "ai.monthly_cost_cap_vnd": 10000,
          "ai.monthly_review": false,
          "ai.onboarding_import": true,
          "analytics.advanced": false,
          "analytics.chain_reporting": false,
          "booking.marketplace_listing": true,
          "calendar.core": true,
          "crm.core": true,
          "notifications.sms.monthly_messages": 30,
          "promotion.weekly_credits_per_month": 0,
          "salon.max_locations": 1,
          "staff.max_seats": "unlimited",
          "zalo.inbox": true,
          "zalo.oa_connect": true,
          "zalo_template.monthly_messages": 100,
        },
        "pro": {
          "ai.agent.enabled": true,
          "ai.monthly_cost_cap_vnd": 250000,
          "ai.monthly_review": true,
          "ai.onboarding_import": true,
          "analytics.advanced": false,
          "analytics.chain_reporting": false,
          "booking.marketplace_listing": true,
          "calendar.core": true,
          "crm.core": true,
          "notifications.sms.monthly_messages": 80,
          "promotion.weekly_credits_per_month": 0,
          "salon.max_locations": 1,
          "staff.max_seats": "unlimited",
          "zalo.inbox": true,
          "zalo.oa_connect": true,
          "zalo_template.monthly_messages": 300,
        },
        "trial": {
          "ai.agent.enabled": true,
          "ai.monthly_cost_cap_vnd": 20000,
          "ai.monthly_review": true,
          "ai.onboarding_import": true,
          "analytics.advanced": false,
          "analytics.chain_reporting": false,
          "booking.marketplace_listing": true,
          "calendar.core": true,
          "crm.core": true,
          "notifications.sms.monthly_messages": 30,
          "promotion.weekly_credits_per_month": 0,
          "salon.max_locations": 1,
          "staff.max_seats": "unlimited",
          "zalo.inbox": true,
          "zalo.oa_connect": true,
          "zalo_template.monthly_messages": 100,
        },
        "ultra": {
          "ai.agent.enabled": true,
          "ai.monthly_cost_cap_vnd": 600000,
          "ai.monthly_review": true,
          "ai.onboarding_import": true,
          "analytics.advanced": true,
          "analytics.chain_reporting": true,
          "booking.marketplace_listing": true,
          "calendar.core": true,
          "crm.core": true,
          "notifications.sms.monthly_messages": 200,
          "promotion.weekly_credits_per_month": 1,
          "salon.max_locations": "unlimited",
          "staff.max_seats": "unlimited",
          "zalo.inbox": true,
          "zalo.oa_connect": true,
          "zalo_template.monthly_messages": 1000,
        },
      }
    `);
  });

  it("matches the owner-approved caps", () => {
    const caps = (code: keyof typeof PLAN_CATALOG) => [
      PLAN_CATALOG[code].entitlements["ai.monthly_cost_cap_vnd"],
      PLAN_CATALOG[code].entitlements["zalo_template.monthly_messages"],
      PLAN_CATALOG[code].entitlements["notifications.sms.monthly_messages"],
    ];
    expect(caps("basic")).toEqual([10_000, 100, 30]);
    expect(caps("trial")).toEqual([20_000, 100, 30]);
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
