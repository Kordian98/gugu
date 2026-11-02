---
name: entitlements
description: How to gate a GuGu feature by subscription plan — add an entitlement key, enforce it in the NestJS API, meter usage quotas (AI tokens, ZNS/SMS), and reflect it in the Expo UI. Use when adding paid/limited features, touching plans, subscriptions, quotas, @RequiresEntitlement, EntitlementService or UsageService.
---

# Entitlements: gating features by plan

Commercial access in GuGu is expressed as **entitlement keys** resolved per salon. Code checks keys, never plan names, so pricing can change without code changes. Spec: `docs/tasks/12-monetization-admin.md` §3.3–3.4.

## When to use
- A feature should be available only on some plans (AI agent, Zalo inbox, advanced analytics…).
- A feature has a monthly limit (AI requests/tokens, ZNS/SMS messages, staff seats).
- You are changing plans, subscriptions or overrides.

Not for gradual rollout or experiments → use a **feature flag** instead. Never mix the two.

## Invariants
- MUST enforce on the backend. Client checks are only for hiding or disabling UI.
- MUST use a key from the registry (`packages/domain/entitlements/keys.ts`); no string literals elsewhere.
- MUST give every key a safe default (deny / 0) for salons without a matching entitlement.
- MUST NOT delete data on downgrade. Over-limit resources become read-only after the grace period.
- Quota operations MUST be idempotent (`idempotencyKey`) and race-safe (atomic Redis reserve).
- Errors use codes `ENTITLEMENT_REQUIRED` / `ENTITLEMENT_QUOTA_EXCEEDED` with vi/en messages.

## Key naming
`<domain>.<feature>[.<qualifier>]`, lowercase, dot-separated. Value types:
- `boolean`: `ai.agent.enabled`
- `limit` (integer per billing period or absolute): `ai.agent.monthly_tokens`, `staff.max_seats`
- `enum`: `analytics.retention_window` = `30d|90d|365d`

## Procedure: add a boolean-gated feature
1. Add the key to `packages/domain/entitlements/keys.ts` with `valueType`, `default`, and vi/en description keys.
2. Add a migration/seed setting the value for each plan (`PlanEntitlement`). Free plan explicitly `false`.
3. Protect the API route:
   ```ts
   @RequiresEntitlement('zalo.inbox')
   @Get('salons/:salonId/zalo/threads')
   ```
   The guard resolves `salonId` from the tenant context (never from an unverified body).
4. In services callable from jobs or agents (no HTTP guard), call `entitlements.assert(salonId, 'zalo.inbox')`.
5. In the Expo app, read `useEntitlement('zalo.inbox')` (from `/api/v1/salons/:id/entitlements`), hide or disable the entry point, and show the localized upsell (`common:upgrade.*`).
6. Add localized error and upsell strings (vi + en).
7. Tests: guard denies with 403 `ENTITLEMENT_REQUIRED`, allows with an override, and the UI hides the entry point.

## Procedure: add a metered quota
1. Add a `limit` key (e.g. `zns.monthly_messages`) plus a usage key in `packages/domain/usage/keys.ts`.
2. Around the costly operation:
   ```ts
   const r = await usage.reserve(salonId, 'zns.messages', 1, idemKey);
   if (!r.allowed) throw new QuotaExceededError('zns.monthly_messages');
   try { await send(); await usage.commit(r.id, 1); }
   catch (e) { await usage.release(r.id); throw e; }
   ```
   For AI: reserve an estimated token count, then commit the actual `usage` reported by the API response.
3. Define the over-limit behavior (deny / fallback channel / degrade) in the feature spec. Booking-critical notifications fall back rather than fail.
4. Soft-limit notification at 80% is automatic. Verify the template exists in vi/en.
5. Tests: 50 parallel reserves never exceed the limit, a duplicate idempotencyKey counts once, and release restores the quota.

## Procedure: grant a salon access manually (admin)
Use `EntitlementOverride` via the admin UI or API with `reason` and an optional `expiresAt`. This is audit logged, and the cache invalidates within 60 s.

## Checklist before PR
- [ ] Key registered, typed, defaulted, described in vi/en
- [ ] Plan values seeded for every plan
- [ ] Backend enforcement (guard or `assert`) on every entry point: HTTP, jobs, agent tools, webhooks
- [ ] UI gating + upsell copy
- [ ] Quota path idempotent, with race and duplicate tests
- [ ] Spec §3.3 key list and the "Product AI-agent surface" table updated if relevant
