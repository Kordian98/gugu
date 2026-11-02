---
name: entitlements
description: How to gate a GuGu feature by subscription plan — add an entitlement key, enforce it in the NestJS API, meter usage quotas (AI tokens, Zalo template messages, SMS count and cost), and reflect it in the Expo UI. Use when adding paid/limited features, touching plans, subscriptions, quotas, @RequiresEntitlement, EntitlementService or UsageService.
---

# Entitlements: gating features by plan

Commercial access in GuGu is expressed as **entitlement keys** resolved per salon. Code checks keys, never plan names, so pricing can change without code changes. Spec: `docs/tasks/12-monetization-admin.md` §3.3–3.4.

## When to use
- A feature should be available only on some plans (AI agent, Zalo inbox, advanced analytics…).
- A feature has a monthly limit (AI requests/tokens, Zalo template messages, SMS messages or SMS cost, staff seats).
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
2. Add a migration/seed setting the value for each plan (`PlanEntitlement`). Every plan (`basic`, `pro`, `ultra`) gets an explicit value; there is no free plan.
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
1. Add a `limit` key (e.g. `zalo_template.monthly_messages`) plus a usage key in `packages/domain/usage/keys.ts`.
2. Around the costly operation:
   ```ts
   const r = await usage.reserve(salonId, 'zalo_template.messages', 1, idemKey);
   if (!r.allowed) throw new QuotaExceededError('zalo_template.monthly_messages');
   try { await send(); await usage.commit(r.id, 1); }
   catch (e) { await usage.release(r.id); throw e; }
   ```
   For AI: reserve an estimated token count, then commit the actual `usage` reported by the API response.
3. Define the over-limit behavior (deny / fallback channel / degrade) in the feature spec. Booking-critical notifications fall back rather than fail.
4. Soft-limit notification at 80% is automatic. Verify the template exists in vi/en.
5. Tests: 50 parallel reserves never exceed the limit, a duplicate idempotencyKey counts once, and release restores the quota.

## Procedure: grant a salon access manually (admin)
Use `EntitlementOverride` via the admin UI or API with `reason` and an optional `expiresAt`. This is audit logged, and the cache invalidates within 60 s.

## Metered usage keys (current)
| Usage key | Limit key | Unit | Notes |
|---|---|---|---|
| `ai.requests` | `ai.agent.monthly_requests` | request | topic 08 |
| `ai.tokens.input` / `ai.tokens.output` | `ai.agent.monthly_tokens` | token | commit actual usage from the API response |
| `zalo_template.messages` | `zalo_template.monthly_messages` | message | ZBS Template Message (formerly ZNS), channel `zalo_template`. Never name keys `zns.*` |
| `sms.messages` | `notifications.sms.monthly_messages` | message (segments counted) | international provider |
| `ai.cost` | `ai.monthly_cost_cap_vnd` | VND | **hard cap**: reserve the estimated cost before every LLM call, commit the actual cost from token usage × model price; deny at the cap |
| `sms.cost` | `notifications.sms.monthly_cost_cap_vnd` | VND (converted from the provider currency at the stored FX rate) | **metered per salon on every send**, even when no cap applies |

Each usage event stores `unitCost`, `costCurrency` and `fxRateToVnd` for margin reporting in admin.

## Booking source and acquisition class
Plan rules and commission eligibility use the `BookingSource` → `gugu_acquired | salon_acquired` mapping owned by topic 12 (`docs/tasks/12-monetization-admin.md` §3.1a, code in `packages/domain/attribution`). `gugu_acquired`: `marketplace`, `promoted_listing`, `gugu_campaign`, `zalo_mini_app` (GuGu discovery). Everything else (`salon_profile`, `direct_link`, `qr_code`, `social_media`, `zalo_oa`, `zalo_link`, `zalo_chat`, `phone`, `walk_in`, `staff_created`, `repeat_customer`, `ai_agent`) is `salon_acquired`. Import the enum; never redefine it.

## Billing context
No payment processor in the MVP. Monthly/yearly subscriptions are invoiced manually by the owner's company (Polish or Vietnamese entity, TBD), and admin activates the plan. Gating code MUST NOT assume a payment webhook exists. Commission is dormant; the `BookingSource` mapping is captured now for later use.

## Plan placement (owner decisions)
Plans: **Basic, Pro, Ultra**, billed monthly or yearly. **There is no free plan** (X17).

| Entitlement key | Basic | Pro | Ultra |
|---|---|---|---|
| `booking.marketplace_listing` | yes | yes | yes |
| `staff.max_seats` | 3 | 10 | unlimited |
| `salon.max_locations` | 1 | 1 | 5 (+ combined reporting for chains) |
| `crm.customer_tags`, `crm.internal_notes` | yes | yes | yes |
| `analytics.advanced` | no | yes | yes |
| `ai.onboarding_import` (price-list screenshots → services) | **yes** (decided) | **yes** (decided) | **yes** (decided) |
| `ai.onboarding_import.monthly_runs` | 3 | 10 | 30 |
| `ai.agent.enabled` (AI assistant) | **no** (decided) | **yes** (decided) | **yes** (decided) |
| `ai.monthly_review` (Opus business review) | **no** (decided) | **yes** (decided) | **yes** (decided) |
| `ai.agent.write_actions` (phase B) | no | no | yes |
| `ai.monthly_cost_cap_vnd` (hard) | small | medium | large (values: q73) |
| `zalo.oa_connect`, `zalo.inbox` | yes | yes | yes |
| `zalo.mini_app` | no | no | no (not planned, q41) |
| `zalo_template.monthly_messages` / `notifications.sms.monthly_messages` (GuGu-paid, fair use) | low | medium | high (values: q73) |
| `promotion.promoted_listing` | add-on | add-on | 1 week/month included |
| `branding.custom_subdomain` (future) | no | no | yes |

Rows marked **(decided)** come from the owner (X13, X17). Every other cell is the topic 12 recommendation and is **provisional until q75** (Ultra contents, trial).

New salons: provisional 14-day trial with Pro entitlements, then `expired` (read-only workspace, online bookings paused, no data deleted) until a paid plan is active. See spec G19 / q75.

Prices are TBD. Never hardcode these in code; seed them as `PlanEntitlement` rows.

## Checklist before PR
- [ ] Key registered, typed, defaulted, described in vi/en
- [ ] Plan values seeded for every plan
- [ ] Backend enforcement (guard or `assert`) on every entry point: HTTP, jobs, agent tools, webhooks
- [ ] UI gating + upsell copy
- [ ] Quota path idempotent, with race and duplicate tests
- [ ] Spec §3.3 key list and the "Product AI-agent surface" table updated if relevant
