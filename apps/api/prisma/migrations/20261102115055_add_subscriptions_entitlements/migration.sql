-- CreateEnum
CREATE TYPE "plan_billing_interval" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "billing_mode" AS ENUM ('manual');

-- CreateEnum
CREATE TYPE "invoicing_entity" AS ENUM ('tbd', 'pl', 'vn');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "interval" "plan_billing_interval" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "active_from" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlements" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "status" "subscription_status" NOT NULL,
    "interval" "plan_billing_interval",
    "billing_mode" "billing_mode" NOT NULL DEFAULT 'manual',
    "invoicing_entity" "invoicing_entity" NOT NULL DEFAULT 'tbd',
    "trial_ends_at" TIMESTAMPTZ(6),
    "current_period_start" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "from_status" "subscription_status",
    "to_status" "subscription_status" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_overrides" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_plan_id_interval_active_from_key" ON "plan_prices"("plan_id", "interval", "active_from");

-- CreateIndex
CREATE UNIQUE INDEX "plan_entitlements_plan_id_key_key" ON "plan_entitlements"("plan_id", "key");

-- CreateIndex
CREATE INDEX "subscriptions_salon_id_idx" ON "subscriptions"("salon_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_salon_id_id_key" ON "subscriptions"("salon_id", "id");

-- CreateIndex
CREATE INDEX "subscription_events_subscription_id_occurred_at_idx" ON "subscription_events"("subscription_id", "occurred_at");

-- CreateIndex
CREATE INDEX "entitlement_overrides_salon_id_key_idx" ON "entitlement_overrides"("salon_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_overrides_salon_id_id_key" ON "entitlement_overrides"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_salon_id_subscription_id_fkey" FOREIGN KEY ("salon_id", "subscription_id") REFERENCES "subscriptions"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw objects (ADR-0008; listed in prisma/raw-objects.json) ──────────────────────────────────
-- At most one current subscription per salon.
CREATE UNIQUE INDEX "subscriptions_one_current_per_salon" ON "subscriptions" ("salon_id")
  WHERE "status" IN ('trialing', 'active', 'past_due');
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_trial_ends_when_trialing"
  CHECK ("status" <> 'trialing' OR "trial_ends_at" IS NOT NULL);
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_amount_non_negative"
  CHECK ("amount_minor" >= 0);

-- ─── Reference data: plan catalogue v1 (owner decisions X17, q73, q75; spec 12 §3.3 R-S2a) ──────
-- Mirrored in src/modules/subscriptions/domain/plan-catalog.ts; plan-catalog.int.test.ts asserts
-- both agree. Change values only with a new migration + catalogue update + plan version bump.
-- Prices are not seeded (owner: pricing later).
INSERT INTO "plans" ("id", "code", "is_public", "version", "updated_at") VALUES
  (uuidv7(), 'basic', true, 1, now()),
  (uuidv7(), 'pro', true, 1, now()),
  (uuidv7(), 'ultra', true, 1, now()),
  (uuidv7(), 'trial', false, 1, now());

INSERT INTO "plan_entitlements" ("id", "plan_id", "key", "value")
SELECT uuidv7(), p."id", v."key", v."value"::jsonb
FROM (VALUES
  -- basic
  ('basic', 'crm.core', 'true'), ('basic', 'calendar.core', 'true'),
  ('basic', 'booking.marketplace_listing', 'true'), ('basic', 'ai.onboarding_import', 'true'),
  ('basic', 'ai.agent.enabled', 'false'), ('basic', 'ai.monthly_review', 'false'),
  ('basic', 'zalo.oa_connect', 'false'), ('basic', 'zalo.inbox', 'false'),
  ('basic', 'analytics.chain_reporting', 'false'), ('basic', 'analytics.advanced', 'false'),
  ('basic', 'ai.monthly_cost_cap_vnd', '20000'), ('basic', 'zalo_template.monthly_messages', '100'),
  ('basic', 'notifications.sms.monthly_messages', '30'), ('basic', 'salon.max_locations', '1'),
  ('basic', 'promotion.weekly_credits_per_month', '0'), ('basic', 'staff.max_seats', '"unlimited"'),
  -- pro
  ('pro', 'crm.core', 'true'), ('pro', 'calendar.core', 'true'),
  ('pro', 'booking.marketplace_listing', 'true'), ('pro', 'ai.onboarding_import', 'true'),
  ('pro', 'ai.agent.enabled', 'true'), ('pro', 'ai.monthly_review', 'true'),
  ('pro', 'zalo.oa_connect', 'true'), ('pro', 'zalo.inbox', 'true'),
  ('pro', 'analytics.chain_reporting', 'false'), ('pro', 'analytics.advanced', 'false'),
  ('pro', 'ai.monthly_cost_cap_vnd', '250000'), ('pro', 'zalo_template.monthly_messages', '300'),
  ('pro', 'notifications.sms.monthly_messages', '80'), ('pro', 'salon.max_locations', '1'),
  ('pro', 'promotion.weekly_credits_per_month', '0'), ('pro', 'staff.max_seats', '"unlimited"'),
  -- ultra
  ('ultra', 'crm.core', 'true'), ('ultra', 'calendar.core', 'true'),
  ('ultra', 'booking.marketplace_listing', 'true'), ('ultra', 'ai.onboarding_import', 'true'),
  ('ultra', 'ai.agent.enabled', 'true'), ('ultra', 'ai.monthly_review', 'true'),
  ('ultra', 'zalo.oa_connect', 'true'), ('ultra', 'zalo.inbox', 'true'),
  ('ultra', 'analytics.chain_reporting', 'true'), ('ultra', 'analytics.advanced', 'true'),
  ('ultra', 'ai.monthly_cost_cap_vnd', '600000'), ('ultra', 'zalo_template.monthly_messages', '1000'),
  ('ultra', 'notifications.sms.monthly_messages', '200'), ('ultra', 'salon.max_locations', '"unlimited"'),
  ('ultra', 'promotion.weekly_credits_per_month', '1'), ('ultra', 'staff.max_seats', '"unlimited"'),
  -- trial: Pro features, Basic limits (owner correction 2026-11-02)
  ('trial', 'crm.core', 'true'), ('trial', 'calendar.core', 'true'),
  ('trial', 'booking.marketplace_listing', 'true'), ('trial', 'ai.onboarding_import', 'true'),
  ('trial', 'ai.agent.enabled', 'true'), ('trial', 'ai.monthly_review', 'true'),
  ('trial', 'zalo.oa_connect', 'true'), ('trial', 'zalo.inbox', 'true'),
  ('trial', 'analytics.chain_reporting', 'false'), ('trial', 'analytics.advanced', 'false'),
  ('trial', 'ai.monthly_cost_cap_vnd', '20000'), ('trial', 'zalo_template.monthly_messages', '100'),
  ('trial', 'notifications.sms.monthly_messages', '30'), ('trial', 'salon.max_locations', '1'),
  ('trial', 'promotion.weekly_credits_per_month', '0'), ('trial', 'staff.max_seats', '"unlimited"')
) AS v("plan_code", "key", "value")
JOIN "plans" p ON p."code" = v."plan_code";
