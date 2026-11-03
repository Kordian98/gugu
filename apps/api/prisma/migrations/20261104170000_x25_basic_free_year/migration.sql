-- X25 (owner, 2026-11-04; amends X17): Basic is free for the first 12 months after registration,
-- then 99,000 VND/month. Basic has no AI assistant (already false since v1) and its AI cost cap is
-- sized for the price-list import only. The trial keeps 20,000 VND (Pro features incl. the
-- assistant, small cap; q96). Mirrored in src/modules/subscriptions/domain/plan-catalog.ts.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "free_until" TIMESTAMPTZ(6);

-- Basic: AI cap for import only (≈ 2 worst-case 10-photo imports per month).
UPDATE "plan_entitlements" pe
SET "value" = '10000'::jsonb
FROM "plans" p
WHERE pe."plan_id" = p."id" AND p."code" = 'basic' AND pe."key" = 'ai.monthly_cost_cap_vnd';

UPDATE "plans" SET "version" = 2, "updated_at" = now() WHERE "code" = 'basic';

-- First list price (display only; invoiced manually, no processor). VND has no minor unit.
-- Effective from the catalogue start so it shows at once (it is only charged after a free year).
INSERT INTO "plan_prices" ("id", "plan_id", "interval", "amount_minor", "currency", "active_from")
SELECT uuidv7(), p."id", 'month', 99000, 'VND', TIMESTAMPTZ '2026-11-01 00:00:00+07'
FROM "plans" p
WHERE p."code" = 'basic'
ON CONFLICT ("plan_id", "interval", "active_from") DO NOTHING;
