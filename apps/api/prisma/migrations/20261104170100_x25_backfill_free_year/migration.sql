-- X25 backfill: every salon currently on the trial or on Basic gets the free Basic year from its
-- registration date (salons.created_at). Free until = local midnight after (registration date +
-- 12 months) in the salon's time zone — the same rule as freeYearEnd() in
-- src/modules/subscriptions/domain/free-year.ts (x25-backfill.int.test.ts checks they agree).
-- Founding partners (X20) are untouched: a free Basic year is not a paid subscription.
-- Re-runnable: rows that already have free_until are skipped.

CREATE TEMP TABLE x25_free_year AS
SELECT sa."id" AS salon_id,
  ((((sa."created_at" AT TIME ZONE sa."timezone")::date + INTERVAL '12 months')::date + 1)::timestamp
    AT TIME ZONE sa."timezone") AS free_until
FROM "salons" sa;

-- 1. Current trial or Basic subscriptions: record the free year.
UPDATE "subscriptions" s
SET "free_until" = f.free_until, "updated_at" = now()
FROM x25_free_year f, "plans" p
WHERE s."salon_id" = f.salon_id AND p."id" = s."plan_id"
  AND p."code" IN ('trial', 'basic')
  AND s."status" IN ('trialing', 'active', 'past_due')
  AND s."free_until" IS NULL;

-- 2. Basic subscriptions inside their free year are covered until it ends; a past_due one is
--    active again (past_due → active is an allowed transition). History row per change.
WITH changed AS (
  UPDATE "subscriptions" s
  SET "current_period_end" = GREATEST(COALESCE(s."current_period_end", s."free_until"), s."free_until"),
      "status" = 'active',
      "updated_at" = now()
  FROM "plans" p, "subscriptions" old
  WHERE p."id" = s."plan_id" AND p."code" = 'basic' AND old."id" = s."id"
    AND s."status" IN ('active', 'past_due')
    AND s."free_until" > now()
    AND (s."status" = 'past_due' OR s."current_period_end" IS NULL OR s."current_period_end" < s."free_until")
  RETURNING s."id", s."salon_id", old."status" AS from_status
)
INSERT INTO "subscription_events" ("id", "salon_id", "subscription_id", "from_status", "to_status", "actor", "reason")
SELECT uuidv7(), c."salon_id", c."id", c.from_status, 'active', 'system', 'x25_free_year_backfill'
FROM changed c;

-- 3. Salons whose trial already expired (no current subscription, newest row is an expired trial)
--    and are still inside their first year: under X25 the trial would have ended into free Basic,
--    so they get a new active Basic subscription until the free year ends (a returning salon gets
--    a new row; the expired one stays as history).
WITH due AS (
  SELECT f.salon_id, f.free_until
  FROM x25_free_year f
  JOIN LATERAL (
    SELECT s."status", p."code"
    FROM "subscriptions" s JOIN "plans" p ON p."id" = s."plan_id"
    WHERE s."salon_id" = f.salon_id
    ORDER BY s."created_at" DESC, s."id" DESC
    LIMIT 1
  ) latest ON TRUE
  JOIN "salons" sa ON sa."id" = f.salon_id
  WHERE latest."status" = 'expired' AND latest."code" = 'trial'
    AND f.free_until > now()
    AND sa."deleted_at" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "subscriptions" c
      WHERE c."salon_id" = f.salon_id AND c."status" IN ('trialing', 'active', 'past_due')
    )
),
basic AS (SELECT "id", "version" FROM "plans" WHERE "code" = 'basic'),
created AS (
  INSERT INTO "subscriptions" ("id", "salon_id", "plan_id", "plan_version", "status", "interval",
    "current_period_start", "current_period_end", "free_until", "updated_at")
  SELECT uuidv7(), d.salon_id, b."id", b."version", 'active', 'month', now(), d.free_until,
    d.free_until, now()
  FROM due d CROSS JOIN basic b
  RETURNING "id", "salon_id"
)
INSERT INTO "subscription_events" ("id", "salon_id", "subscription_id", "from_status", "to_status", "to_plan_code", "actor", "reason")
SELECT uuidv7(), c."salon_id", c."id", NULL, 'active', 'basic', 'system', 'x25_free_year_backfill'
FROM created c;

DROP TABLE x25_free_year;
