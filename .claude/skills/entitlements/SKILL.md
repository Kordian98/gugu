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
- MUST use a key from the registry (`ENTITLEMENT_KEYS` in `packages/contracts/src/subscriptions/entitlements.ts`); no string literals elsewhere.
- MUST give every key a safe default (deny / 0) for salons without a matching entitlement.
- MUST NOT delete data on downgrade. Over-limit resources become read-only after the grace period.
- Quota operations MUST be idempotent (`idempotencyKey`) and race-safe (atomic Redis reserve).
- Errors use problem codes `entitlement.required` (403) / `entitlement.quota_exceeded` (`SUBSCRIPTION_ERRORS` in contracts); the client translates `errors.<code>`.

## Key naming
`<domain>.<feature>[.<qualifier>]`, lowercase, dot-separated. Value types:
- `boolean`: `ai.agent.enabled`
- `limit` (integer per billing period or absolute): `ai.monthly_cost_cap_vnd`, `zalo_template.monthly_messages`
- `enum`: `analytics.retention_window` = `30d|90d|365d`

## Implementation map (M12.1)
- Module: `apps/api/src/modules/subscriptions` (global). Exports `EntitlementService` (`forSalon`, `get`, `isEnabled`, `limit`, `assert`, `invalidate`) and `SubscriptionsFacade` (`startTrial`, `transition`, `endDueTrials`).
- Decorator: `@RequiresEntitlement(key)` from `modules/subscriptions/http/requires-entitlement.ts` (boolean keys only; salon from RequestContext, else `:salonId`).
- Cache: Redis `entitlements:v1:<salonId>`, TTL ≤ 60 s (never past a trial end), fails open to the DB. Call `invalidate(salonId)` after writing subscriptions or overrides.
- An ended trial reads immediately as active **Basic** while the free year runs (X25, `subscriptions.free_until`), otherwise as `expired` (`effectiveStatus` / `effectivePlan`); `endDueTrials()` only records it. ADR-0015.
- Free Basic year (X25): `free_until` = local midnight after registration date + 12 months in the salon zone. Not a plan and not an entitlement: never gate on it. A free Basic year never qualifies a founding partner.

## Procedure: add a boolean-gated feature
1. Add the key to `ENTITLEMENT_KEYS` in `packages/contracts/src/subscriptions/entitlements.ts` (`boolean` or `limit`; defaults are deny / 0).
2. Add a migration inserting a `plan_entitlements` row for every plan, update `PLAN_CATALOG` in `apps/api/src/modules/subscriptions/domain/plan-catalog.ts` and bump the plan `version` (the catalogue integration test fails if DB and file disagree). Every plan (`basic`, `pro`, `ultra` and the internal `trial`) gets an explicit value; there is no free plan. The trial copies Pro booleans and Basic limits, except its AI cap (20,000 VND, q96).
3. Protect the API route:
   ```ts
   @RequiresEntitlement('zalo.inbox')
   @Get('salons/:salonId/zalo/threads')
   ```
   The guard resolves `salonId` from the tenant context (never from an unverified body).
4. In services callable from jobs or agents (no HTTP guard), call `entitlements.assert(salonId, 'zalo.inbox')`.
5. In the Expo app, read `useEntitlement('zalo.inbox')` (from `/api/v1/salons/:id/entitlements`), hide or disable the entry point, and show the localized upsell (`common:upgrade.*`).
6. Add localized error and upsell strings (vi + en).
7. Tests: guard denies with 403 `entitlement.required`, allows with an override, and the UI hides the entry point.

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
Use the admin panel (`/vi/admin/salons/<id>` → "Add override") or `POST /api/v1/admin/salons/:salonId/overrides` with `key`, `value`, `expiresAt` (mandatory, ≤ 366 days) and `reason`. It goes through `AdminActions.run` (audit row with before/after in the same transaction) and the cache is invalidated at once. Super_admin only (`platform.entitlements.write`). A suspended salon resolves to nothing, overrides included.

## Metered usage keys (current)
| Usage key | Limit key | Unit | Notes |
|---|---|---|---|
| `ai.requests` | none (cost cap only) | request | topic 08; recorded for reporting |
| `ai.tokens.input` / `ai.tokens.output` | none (cost cap only) | token | commit actual usage from the API response; drives `ai.cost` |
| `zalo_template.messages` | `zalo_template.monthly_messages` (100 / 300 / 1,000) | message | ZBS Template Message (formerly ZNS), channel `zalo_template`, sent **only from the central GuGu OA**. Never name keys `zns.*` |
| `sms.messages` | `notifications.sms.monthly_messages` (30 / 80 / 200) | message (segments counted) | provider **mocked** for now (provider-sink); metering still runs |
| `ai.cost` | `ai.monthly_cost_cap_vnd` (Basic 10,000 (import only) / trial 20,000 / Pro 250,000 / Ultra 600,000 VND) | VND | **hard cap**: reserve the estimated cost before every LLM call, commit the actual cost from token usage × model price; deny at the cap |
| `sms.cost` | none yet (`notifications.sms.monthly_cost_cap_vnd` later) | VND (converted from the provider currency at the stored FX rate) | **metered per salon on every send**, even when no cap applies |

Each usage event stores `unitCost`, `costCurrency` and `fxRateToVnd` for margin reporting in admin.

## Booking source and acquisition class
Plan rules and commission eligibility use the `BookingSource` → `gugu_acquired | salon_acquired` mapping owned by topic 12 (`docs/tasks/12-monetization-admin.md` §3.1a, code in `packages/domain/attribution`). `gugu_acquired`: `marketplace`, `promoted_listing`, `gugu_campaign`, `zalo_mini_app` (GuGu discovery). Everything else (`salon_profile`, `direct_link`, `qr_code`, `social_media`, `zalo_oa`, `zalo_link`, `zalo_chat`, `phone`, `walk_in`, `staff_created`, `repeat_customer`, `ai_agent`) is `salon_acquired`. Import the enum; never redefine it.

## Founding partners (spec §3.2a; flag implemented in M12.6, waiver not yet)
- `founding_partner` is not an entitlement key or a plan. It is a status on the organisation/salon, set once when the first **paid** subscription (`basic`, `pro` or `ultra`, never `trial`) becomes `active` before `MARKETPLACE_LAUNCH_AT` (config; `null` = not launched yet). Set it in the same transaction as that transition.
- Waiver window: `[MARKETPLACE_LAUNCH_AT, +24 months)`. It is computed, not stored, and evaluated at the booking's completion time in UTC.
- Any booking-fee or commission code MUST call `FoundingPartnerPolicy.waiverFor(salonId, at)` first. Inside the window, the fee is 0 and the ledger entry is written as `waived` with reason `founding_partner`. It beats rules, plans and overrides.
- Free marketplace listing needs no special handling: `booking.marketplace_listing` is true in every paid plan.
- Do not ship any fee logic for the marketplace before the legal review (spec R-FP8).

## Billing context
No payment processor in the MVP. Monthly/yearly subscriptions are invoiced manually by the owner's company (Polish or Vietnamese entity, TBD), and admin activates the plan. Gating code MUST NOT assume a payment webhook exists. Commission is dormant; the `BookingSource` mapping is captured now for later use.

## Plan placement (owner decisions)
Plans: **Basic, Pro, Ultra**, billed monthly or yearly. **There is no free plan** (X17). **X25:** Basic is free for the first 12 months after registration, then 99,000 VND/month (seeded in `plan_prices`).

| Entitlement key | Basic | Pro | Ultra |
|---|---|---|---|
| `crm.core` (CRM, clients, tags, internal notes) | yes | yes | yes |
| `calendar.core` (calendar, booking management) | yes | yes | yes |
| `booking.marketplace_listing` | yes | yes | yes |
| `ai.onboarding_import` (price-list screenshots → services) | yes | yes | yes |
| `ai.agent.enabled` (AI assistant) | no | yes | yes |
| `ai.monthly_review` (monthly business review on Opus) | no | yes | yes |
| `ai.monthly_cost_cap_vnd` (**hard**, all AI features) | 10,000 (import only, X25) | 250,000 | 600,000 |
| `zalo.oa_connect` + `zalo.inbox` (salon's own OA in the CRM inbox) | yes | yes | yes |
| `zalo_template.monthly_messages` (GuGu-paid, sent **only from the central GuGu OA**, q70) | 100 | 300 | 1,000 |
| `notifications.sms.monthly_messages` (GuGu-paid; provider **mocked** for now) | 30 | 80 | 200 |
| `salon.max_locations` | 1 | 1 | unlimited |
| `analytics.chain_reporting` (combined reporting across locations) | no | no | yes |
| `analytics.advanced` (admin-level analytics: cohorts, funnels, acquisition, exports) | no | no | yes |
| `promotion.weekly_credits_per_month` (promoted-listing credits) | 0 | 0 | 1 (admin-tunable) |
| `staff.max_seats` | unlimited | unlimited | unlimited (not a plan differentiator at launch; key kept) |

Owner-approved (X13, X17, q73, q74, q75), 2026-11-02. Caps are VND or messages per salon per calendar month and are reviewed after the first 20 salons. Any plan may buy extra promoted-listing weeks (flat weekly fee, invoiced manually, q74).

**Trial (`trial`, internal plan, `isPublic = false`):** used for the 14-day trial of every new salon. It is seeded with **Pro features** (all Pro booleans: `ai.agent.enabled`, `ai.monthly_review`, `zalo.oa_connect`, `zalo.inbox`, plus everything in Basic), an explicit AI cap `ai.monthly_cost_cap_vnd` = 20,000 (q96) and **Basic message limits**: `zalo_template.monthly_messages` = 100, `notifications.sms.monthly_messages` = 30, `salon.max_locations` = 1, `promotion.weekly_credits_per_month` = 0. Ultra-only keys are `no`. This way trials cannot abuse AI.

**Later (not in any plan at launch; no seed rows):** `ai.agent.write_actions` (assistant phase B), `branding.custom_subdomain`, `zalo.mini_app` (not planned, q41), `notifications.sms.monthly_cost_cap_vnd` (only once a real SMS provider replaces the mock).

New salons: 14-day trial on the internal `trial` plan, with **Pro features** (incl. the assistant), AI cap 20,000 VND, 100 Zalo template, 30 SMS, so trials cannot abuse AI. After the trial the salon drops to **Basic, free until 12 months after registration** (X25, q96). Only without a trial, free year or paid plan does the subscription become `expired` (read-only workspace, online bookings paused, no data deleted). Spec G19, R-S1a.

Basic is 99,000 VND/month (X25); Pro/Ultra prices TBD. Never hardcode prices or caps in code; seed caps as `PlanEntitlement` rows and prices as `PlanPrice` rows (the read model exposes `basicMonthlyPriceVnd`).

## Checklist before PR
- [ ] Key registered, typed, defaulted, described in vi/en
- [ ] Plan values seeded for every plan
- [ ] Backend enforcement (guard or `assert`) on every entry point: HTTP, jobs, agent tools, webhooks
- [ ] UI gating + upsell copy
- [ ] Quota path idempotent, with race and duplicate tests
- [ ] Spec §3.3 key list and the "Product AI-agent surface" table updated if relevant
