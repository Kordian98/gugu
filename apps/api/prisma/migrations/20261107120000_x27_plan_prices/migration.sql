-- X27 (owner, 2026-11-04): Pro 299,000 VND/month, Ultra 699,000 VND/month; yearly billing = 2 months
-- free (10 × monthly) for every paid plan. Basic monthly (99,000) was inserted by x25_basic_free_year.
-- Display only (invoiced manually, nothing is charged automatically). VND has no minor unit.
-- Mirrored in packages/contracts/src/subscriptions/plan-prices.ts (asserted by plan-prices.int.test.ts).
-- Same effective date as the Basic price so every price shows at once.
INSERT INTO "plan_prices" ("id", "plan_id", "interval", "amount_minor", "currency", "active_from")
SELECT uuidv7(), p."id", v."interval"::"plan_billing_interval", v."amount", 'VND',
       TIMESTAMPTZ '2026-11-01 00:00:00+07'
FROM "plans" p
JOIN (VALUES
  ('basic', 'year', 990000),
  ('pro', 'month', 299000),
  ('pro', 'year', 2990000),
  ('ultra', 'month', 699000),
  ('ultra', 'year', 6990000)
) AS v("code", "interval", "amount") ON v."code" = p."code"
ON CONFLICT ("plan_id", "interval", "active_from") DO NOTHING;
