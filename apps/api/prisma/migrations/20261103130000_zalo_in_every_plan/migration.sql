-- Owner decision 2026-11-03: Zalo OA connect + inbox in every plan (incl. Basic).
UPDATE plan_entitlements pe
SET value = 'true'
FROM plans p
WHERE pe.plan_id = p.id
  AND p.code = 'basic'
  AND pe.key IN ('zalo.oa_connect', 'zalo.inbox');
