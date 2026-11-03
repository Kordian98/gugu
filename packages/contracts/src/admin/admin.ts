import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { cursorPageSchema, cursorQuerySchema } from "../common/pagination";
import {
  billingIntervalSchema,
  entitlementKeySchema,
  entitlementMapSchema,
  limitValueSchema,
  planCodeSchema,
  subscriptionStatusSchema,
} from "../subscriptions/entitlements";

/**
 * Platform admin API (`/api/v1/admin/*`, topic 12 M12.6). Callers are GuGu staff with a platform
 * role (`support_admin` | `super_admin`), never salon members. Every mutation carries a `reason`
 * and writes an audit row with before/after in the same transaction.
 */

/** Why the admin did it: stored in the audit log and shown in history. No personal data. */
export const adminReasonSchema = z.string().trim().min(5).max(500);

export const ADMIN_ERRORS = {
  /**
   * High-risk action needs a step-up: a TOTP (or recovery) code verified on this session within
   * ADMIN_STEP_UP_MINUTES (topic 05 step 9, ADR-0011). The client asks for a code and retries.
   */
  stepUpRequired: "admin.step_up_required",
  alreadySuspended: "admin.already_suspended",
  notSuspended: "admin.not_suspended",
  noCurrentSubscription: "admin.no_current_subscription",
  trialNotExtendable: "admin.trial_not_extendable",
  invalidDate: "admin.invalid_date",
  overrideNotActive: "admin.override_not_active",
  invalidOverrideValue: "admin.invalid_override_value",
  foundingPartnerExists: "admin.founding_partner_exists",
  foundingPartnerMissing: "admin.founding_partner_missing",
  usageMonthUnavailable: "admin.usage_month_unavailable",
  /** The free Basic year (X25) only applies to a current trial or Basic subscription. */
  freePeriodNotApplicable: "admin.free_period_not_applicable",
} as const;

/** Returned to members of a suspended salon on any write (read-only until unsuspended). */
export const SALON_SUSPENDED_ERROR = "salon.suspended";

export const PAID_PLAN_CODES = ["basic", "pro", "ultra"] as const;
export const paidPlanCodeSchema = z.enum(PAID_PLAN_CODES);
export type PaidPlanCode = z.infer<typeof paidPlanCodeSchema>;

export const salonStatusSchema = z.enum([
  "draft",
  "pending_review",
  "active",
  "suspended",
  "closed",
]);
export type SalonStatus = z.infer<typeof salonStatusSchema>;

export const invoicingEntitySchema = z.enum(["tbd", "pl", "vn"]);

export const effectiveSubscriptionStatusSchema = z.union([
  subscriptionStatusSchema,
  z.literal("none"),
]);

const boolParam = z.enum(["true", "false"]).transform((v) => v === "true");

export const ADMIN_SALON_SORTS = [
  "created_desc",
  "created_asc",
  "name_asc",
  "trial_ends_asc",
  "free_until_asc",
  "last_activity_desc",
  "bookings_desc",
] as const;

/** `GET /admin/salons` filters. Dates are UTC calendar days (`YYYY-MM-DD`, inclusive). */
export const adminSalonListQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  plan: z.union([planCodeSchema, z.literal("none")]).optional(),
  subscriptionStatus: effectiveSubscriptionStatusSchema.optional(),
  /** Trialing salons whose trial ends within this many days from now. */
  trialEndsWithinDays: z.coerce.number().int().min(0).max(90).optional(),
  /** X25: the free Basic year (trial or Basic) ends within this many days from now. */
  freeEndsWithinDays: z.coerce.number().int().min(0).max(366).optional(),
  /** X25: true = the free Basic year is over (Basic is now paid); false = still free. */
  freeEnded: boolParam.optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  /** Any member session, booking or audited change within this many days. */
  activeWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  /** No activity for at least this many days (or never). */
  inactiveForDays: z.coerce.number().int().min(1).max(365).optional(),
  minBookings: z.coerce.number().int().min(0).max(1_000_000).optional(),
  zaloConnected: boolParam.optional(),
  foundingPartner: boolParam.optional(),
  salonStatus: salonStatusSchema.optional(),
  sort: z.enum(ADMIN_SALON_SORTS).default("created_desc"),
});
export type AdminSalonListQuery = z.infer<typeof adminSalonListQuerySchema>;

export const adminSalonListItemSchema = z.object({
  id: uuidV7Schema,
  name: z.string(),
  slug: z.string(),
  status: salonStatusSchema,
  createdAt: z.iso.datetime(),
  plan: planCodeSchema.nullable(),
  /** Effective: a trial past its end reads `expired`. */
  subscriptionStatus: effectiveSubscriptionStatusSchema,
  trialEndsAt: z.iso.datetime().nullable(),
  /** End of the paid period (manual billing) — `current_period_end` of a paid subscription. */
  paidUntil: z.iso.datetime().nullable(),
  /** X25: end of the free Basic year (exclusive); null when the salon has none. */
  freeUntil: z.iso.datetime().nullable(),
  /** Paid period ended but the subscription is still current: invoice follow-up needed. */
  paidUntilOverdue: z.boolean(),
  bookingsTotal: z.number().int(),
  bookings30d: z.number().int(),
  lastActivityAt: z.iso.datetime().nullable(),
  zaloConnected: z.boolean(),
  foundingPartner: z.boolean(),
});
export type AdminSalonListItem = z.infer<typeof adminSalonListItemSchema>;
export const adminSalonListSchema = cursorPageSchema(adminSalonListItemSchema).extend({
  total: z.number().int(),
});
export type AdminSalonList = z.infer<typeof adminSalonListSchema>;

export const adminSalonParamsSchema = z.object({ salonId: uuidV7Schema });
export const adminOverrideParamsSchema = z.object({
  salonId: uuidV7Schema,
  overrideId: uuidV7Schema,
});

export const adminOverrideSchema = z.object({
  id: uuidV7Schema,
  key: z.string(),
  /** null when the stored value does not fit the key (ignored by the resolver). */
  value: z.union([z.boolean(), limitValueSchema]).nullable(),
  reason: z.string(),
  createdBy: z.string(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  active: z.boolean(),
});
export type AdminOverride = z.infer<typeof adminOverrideSchema>;

export const adminSubscriptionSchema = z.object({
  id: uuidV7Schema,
  plan: planCodeSchema,
  planVersion: z.number().int(),
  status: subscriptionStatusSchema,
  storedStatus: subscriptionStatusSchema,
  interval: billingIntervalSchema.nullable(),
  billingMode: z.literal("manual"),
  invoicingEntity: invoicingEntitySchema,
  trialEndsAt: z.iso.datetime().nullable(),
  currentPeriodStart: z.iso.datetime().nullable(),
  paidUntil: z.iso.datetime().nullable(),
  /** X25: end of the free Basic year (exclusive); null when the salon has none. */
  freeUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminSubscription = z.infer<typeof adminSubscriptionSchema>;

export const adminSubscriptionEventSchema = z.object({
  id: uuidV7Schema,
  fromStatus: subscriptionStatusSchema.nullable(),
  toStatus: subscriptionStatusSchema,
  fromPlan: z.string().nullable(),
  toPlan: z.string().nullable(),
  actor: z.string(),
  reason: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

export const adminAuditEntrySchema = z.object({
  id: uuidV7Schema,
  action: z.string(),
  actorType: z.string(),
  actorId: z.string().nullable(),
  targetType: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Never secrets or personal data (audit rule). Admin entries hold reason, before and after. */
  metadata: z.record(z.string(), z.unknown()),
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminUsageSchema = z.object({
  /** `YYYY-MM`, Asia/Ho_Chi_Minh calendar month (the cap period). */
  month: z.string(),
  /** Metered AI cost (the hard-cap counter), VND. GuGu's cost, not salon revenue. */
  aiCostVnd: z.number().int(),
  aiCapVnd: limitValueSchema,
  /** ZBS Template Messages (channel `zalo_template`) sent this month and their estimated cost. */
  zaloTemplateSent: z.number().int(),
  zaloTemplateCostVnd: z.number().int(),
  zaloTemplateLimit: limitValueSchema,
});
export type AdminUsage = z.infer<typeof adminUsageSchema>;

export const foundingPartnerStatusSchema = z.object({
  qualifiedAt: z.iso.datetime(),
  source: z.enum(["paid_before_launch", "admin_grant"]),
  revokedAt: z.iso.datetime().nullable(),
});

export const adminSalonDetailSchema = z.object({
  salon: z.object({
    id: uuidV7Schema,
    name: z.string(),
    slug: z.string(),
    status: salonStatusSchema,
    createdAt: z.iso.datetime(),
    timezone: z.string(),
    verifiedAt: z.iso.datetime().nullable(),
    suspendedAt: z.iso.datetime().nullable(),
    organization: z.object({ id: uuidV7Schema, name: z.string() }),
  }),
  members: z.array(
    z.object({
      userId: uuidV7Schema,
      email: z.string().nullable(),
      displayName: z.string().nullable(),
      role: z.string(),
      status: z.string(),
      lastSeenAt: z.iso.datetime().nullable(),
    }),
  ),
  subscription: adminSubscriptionSchema.nullable(),
  subscriptionHistory: z.array(adminSubscriptionEventSchema),
  entitlements: entitlementMapSchema,
  overrides: z.array(adminOverrideSchema),
  foundingPartner: foundingPartnerStatusSchema.nullable(),
  usage: adminUsageSchema,
  bookingsTotal: z.number().int(),
  bookings30d: z.number().int(),
  zalo: z.object({ connected: z.boolean(), status: z.string().nullable() }),
  lastActivityAt: z.iso.datetime().nullable(),
  recentAudit: z.array(adminAuditEntrySchema),
});
export type AdminSalonDetail = z.infer<typeof adminSalonDetailSchema>;

// ─── Mutations (all require `reason`) ──────────────────────────────────────────────────────────

export const adminReasonInputSchema = z.object({ reason: adminReasonSchema });
export type AdminReasonInput = z.infer<typeof adminReasonInputSchema>;

/** Assign or change the paid plan (manual billing, no processor): the subscription becomes active. */
export const adminAssignPlanInputSchema = z.object({
  plan: paidPlanCodeSchema,
  interval: billingIntervalSchema,
  /** End of the period the salon has paid for (invoice issued outside GuGu). */
  paidUntil: z.iso.datetime(),
  invoicingEntity: invoicingEntitySchema.optional(),
  reason: adminReasonSchema,
});
export type AdminAssignPlanInput = z.infer<typeof adminAssignPlanInputSchema>;

/** New trial end (absolute, UTC). At most 90 days from now. Re-opens an expired trial. */
export const adminExtendTrialInputSchema = z.object({
  trialEndsAt: z.iso.datetime(),
  reason: adminReasonSchema,
});
export type AdminExtendTrialInput = z.infer<typeof adminExtendTrialInputSchema>;

export const adminSetPaidUntilInputSchema = z.object({
  paidUntil: z.iso.datetime(),
  reason: adminReasonSchema,
});
export type AdminSetPaidUntilInput = z.infer<typeof adminSetPaidUntilInputSchema>;

/**
 * X25: move the end of the free Basic year later (absolute, UTC), at most 366 days from now. Only
 * for a current trial or Basic subscription. A free Basic period that covered the subscription
 * moves with it; a past_due Basic subscription becomes active again. Needs a step-up.
 */
export const adminExtendFreePeriodInputSchema = z.object({
  freeUntil: z.iso.datetime(),
  reason: adminReasonSchema,
});
export type AdminExtendFreePeriodInput = z.infer<typeof adminExtendFreePeriodInputSchema>;

/** Per-salon override with a mandatory expiry (≤ 366 days). Value must fit the key's type. */
export const adminCreateOverrideInputSchema = z.object({
  key: entitlementKeySchema,
  value: z.union([z.boolean(), limitValueSchema]),
  expiresAt: z.iso.datetime(),
  reason: adminReasonSchema,
});
export type AdminCreateOverrideInput = z.infer<typeof adminCreateOverrideInputSchema>;

export const adminMutationResultSchema = z.object({ auditId: uuidV7Schema });
export type AdminMutationResult = z.infer<typeof adminMutationResultSchema>;

// ─── Usage overview ────────────────────────────────────────────────────────────────────────────

export const adminUsageQuerySchema = cursorQuerySchema.extend({
  /** `YYYY-MM`; defaults to the current month. Only the current and previous month are kept. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type AdminUsageQuery = z.infer<typeof adminUsageQuerySchema>;

export const adminUsageItemSchema = z.object({
  salonId: uuidV7Schema,
  name: z.string(),
  plan: planCodeSchema.nullable(),
  subscriptionStatus: effectiveSubscriptionStatusSchema,
  aiCostVnd: z.number().int(),
  aiCapVnd: limitValueSchema,
  /** aiCost / cap (0..1+); null for unlimited or a 0 cap. */
  aiCapShare: z.number().nullable(),
  zaloTemplateSent: z.number().int(),
  zaloTemplateCostVnd: z.number().int(),
  zaloTemplateLimit: limitValueSchema,
});
export type AdminUsageItem = z.infer<typeof adminUsageItemSchema>;

export const adminUsageOverviewSchema = z.object({
  month: z.string(),
  items: z.array(adminUsageItemSchema),
  nextCursor: z.string().nullable(),
  totals: z.object({
    salons: z.number().int(),
    aiCostVnd: z.number().int(),
    zaloTemplateSent: z.number().int(),
    zaloTemplateCostVnd: z.number().int(),
    /** Salons at or above 80% of their AI cap (soft limit). */
    nearAiCap: z.number().int(),
    byPlan: z.array(
      z.object({
        plan: z.union([planCodeSchema, z.literal("none")]),
        salons: z.number().int(),
        aiCostVnd: z.number().int(),
        zaloTemplateCostVnd: z.number().int(),
      }),
    ),
  }),
  trialsEndingSoon: z.array(
    z.object({ salonId: uuidV7Schema, name: z.string(), trialEndsAt: z.iso.datetime() }),
  ),
});
export type AdminUsageOverview = z.infer<typeof adminUsageOverviewSchema>;
