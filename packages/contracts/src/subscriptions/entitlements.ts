import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * Entitlement key registry (spec 12 §3.3 R-S2a, skill `entitlements`). Code gates features by these
 * keys, never by plan name. Adding a key: add it here, seed a value for every plan in a migration,
 * and update the plan catalogue in apps/api. A key missing for a salon resolves to its default.
 */
export const ENTITLEMENT_KEYS = {
  "crm.core": { type: "boolean" },
  "calendar.core": { type: "boolean" },
  "booking.marketplace_listing": { type: "boolean" },
  "ai.onboarding_import": { type: "boolean" },
  "ai.agent.enabled": { type: "boolean" },
  "ai.monthly_review": { type: "boolean" },
  "zalo.oa_connect": { type: "boolean" },
  "zalo.inbox": { type: "boolean" },
  "analytics.chain_reporting": { type: "boolean" },
  "analytics.advanced": { type: "boolean" },
  /** Hard monthly cap on the salon's total AI cost, in VND. */
  "ai.monthly_cost_cap_vnd": { type: "limit" },
  /** GuGu-paid ZBS Template Messages per month (sent only from the central GuGu OA). */
  "zalo_template.monthly_messages": { type: "limit" },
  /** GuGu-paid SMS per month (provider mocked for now). */
  "notifications.sms.monthly_messages": { type: "limit" },
  "salon.max_locations": { type: "limit" },
  "promotion.weekly_credits_per_month": { type: "limit" },
  "staff.max_seats": { type: "limit" },
} as const satisfies Record<string, { type: "boolean" | "limit" }>;

export type EntitlementKey = keyof typeof ENTITLEMENT_KEYS;
export type BooleanEntitlementKey = {
  [K in EntitlementKey]: (typeof ENTITLEMENT_KEYS)[K]["type"] extends "boolean" ? K : never;
}[EntitlementKey];
export type LimitEntitlementKey = Exclude<EntitlementKey, BooleanEntitlementKey>;

export const entitlementKeySchema = z.enum(
  Object.keys(ENTITLEMENT_KEYS) as [EntitlementKey, ...EntitlementKey[]],
);

/** A limit: a non-negative integer per period (or absolute), or `"unlimited"`. */
export const limitValueSchema = z.union([z.number().int().nonnegative(), z.literal("unlimited")]);
export type LimitValue = z.infer<typeof limitValueSchema>;

export type EntitlementValue<K extends EntitlementKey = EntitlementKey> =
  K extends BooleanEntitlementKey ? boolean : LimitValue;

export type EntitlementMap = { [K in EntitlementKey]: EntitlementValue<K> };

/** Safe default for a salon without a matching entitlement: deny / 0. */
export function defaultEntitlementValue<K extends EntitlementKey>(key: K): EntitlementValue<K> {
  return (ENTITLEMENT_KEYS[key].type === "boolean" ? false : 0) as EntitlementValue<K>;
}

/** Validates a stored value for `key`; returns undefined when it does not fit the key's type. */
export function parseEntitlementValue<K extends EntitlementKey>(
  key: K,
  value: unknown,
): EntitlementValue<K> | undefined {
  const schema = ENTITLEMENT_KEYS[key].type === "boolean" ? z.boolean() : limitValueSchema;
  const parsed = schema.safeParse(value);
  return parsed.success ? (parsed.data as EntitlementValue<K>) : undefined;
}

/** True when `used + amount` stays within `limit`. */
export function isWithinLimit(limit: LimitValue, used: number, amount = 1): boolean {
  return limit === "unlimited" || used + amount <= limit;
}

const entitlementMapShape = Object.fromEntries(
  (Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[]).map((key) => [
    key,
    ENTITLEMENT_KEYS[key].type === "boolean" ? z.boolean() : limitValueSchema,
  ]),
) as unknown as { [K in EntitlementKey]: z.ZodType<EntitlementValue<K>> };

export const entitlementMapSchema = z.object(entitlementMapShape);

export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const planCodeSchema = z.enum(["basic", "pro", "ultra", "trial"]);
export type PlanCode = z.infer<typeof planCodeSchema>;

export const billingIntervalSchema = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/**
 * `GET /api/v1/salons/:salonId/entitlements` — for UI gating only; the API always enforces.
 * `status` is the effective status (a trial past its end reads as `expired`); `none` = never
 * subscribed.
 */
export const salonEntitlementsSchema = z.object({
  salonId: uuidV7Schema,
  plan: planCodeSchema.nullable(),
  status: z.union([subscriptionStatusSchema, z.literal("none")]),
  trialEndsAt: z.iso.datetime().nullable(),
  entitlements: entitlementMapSchema,
});
export type SalonEntitlements = z.infer<typeof salonEntitlementsSchema>;

export const salonIdParamSchema = z.object({ salonId: uuidV7Schema });

/** Stable problem+json codes of this domain (client translates `errors.<code>`). */
export const SUBSCRIPTION_ERRORS = {
  entitlementRequired: "entitlement.required",
  quotaExceeded: "entitlement.quota_exceeded",
  trialUnavailable: "subscription.trial_unavailable",
  invalidTransition: "subscription.invalid_transition",
} as const;
