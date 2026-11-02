import type { EntitlementMap, PlanCode } from "@gugu/contracts";

/**
 * Plan catalogue v1 (owner decisions X17, q73, q75; spec 12 §3.3 R-S2a). The database rows are
 * inserted by migration `add_subscriptions_entitlements`; `plan-catalog.int.test.ts` asserts the
 * database matches this file. Changing a value = new migration + edit here + bump `version`.
 */
export interface CatalogPlan {
  isPublic: boolean;
  version: number;
  entitlements: EntitlementMap;
}

const BASIC_FEATURES = {
  "crm.core": true,
  "calendar.core": true,
  "booking.marketplace_listing": true,
  "ai.onboarding_import": true,
  "ai.agent.enabled": false,
  "ai.monthly_review": false,
  // Owner decision 2026-11-03: Zalo (OA connect + inbox + bot) is in every plan.
  "zalo.oa_connect": true,
  "zalo.inbox": true,
  "analytics.chain_reporting": false,
  "analytics.advanced": false,
} as const;

const PRO_FEATURES = {
  ...BASIC_FEATURES,
  "ai.agent.enabled": true,
  "ai.monthly_review": true,
} as const;

const BASIC_LIMITS = {
  "ai.monthly_cost_cap_vnd": 20_000,
  "zalo_template.monthly_messages": 100,
  "notifications.sms.monthly_messages": 30,
  "salon.max_locations": 1,
  "promotion.weekly_credits_per_month": 0,
  "staff.max_seats": "unlimited",
} as const;

export const PLAN_CATALOG: Record<PlanCode, CatalogPlan> = {
  basic: { isPublic: true, version: 1, entitlements: { ...BASIC_FEATURES, ...BASIC_LIMITS } },
  pro: {
    isPublic: true,
    version: 1,
    entitlements: {
      ...PRO_FEATURES,
      ...BASIC_LIMITS,
      "ai.monthly_cost_cap_vnd": 250_000,
      "zalo_template.monthly_messages": 300,
      "notifications.sms.monthly_messages": 80,
    },
  },
  ultra: {
    isPublic: true,
    version: 1,
    entitlements: {
      ...PRO_FEATURES,
      "analytics.chain_reporting": true,
      "analytics.advanced": true,
      "ai.monthly_cost_cap_vnd": 600_000,
      "zalo_template.monthly_messages": 1_000,
      "notifications.sms.monthly_messages": 200,
      "salon.max_locations": "unlimited",
      "promotion.weekly_credits_per_month": 1,
      "staff.max_seats": "unlimited",
    },
  },
  // Internal plan for every new salon's 14-day trial: Pro features, Basic limits, so a trial
  // cannot run up AI or messaging cost (owner correction 2026-11-02).
  trial: { isPublic: false, version: 1, entitlements: { ...PRO_FEATURES, ...BASIC_LIMITS } },
};
