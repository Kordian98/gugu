# Domain: monetization, attribution, admin, analytics

Durable reference for booking attribution, commission, plans/entitlements, usage metering, feature flags, analytics/metrics, trust signals and the platform admin. Read this before changing any of them. The spec with rationale is `docs/tasks/12-monetization-admin.md`.

Status: **X25 implemented** (Basic free for the first year, then 99,000 VND/month; no assistant in Basic; trial ends into free Basic; ADR-0015). **M12.1 implemented** (plans, subscriptions, entitlements, trial). **M12.6 platform admin panel implemented** (platform roles, audited admin API, salon directory/detail, manual plans/trials/paid-until, overrides, founding partners, suspension, usage overview; ADR-0010). Everything else in this doc is still a skeleton.

## Summary
- Customers book for free and pay at the salon. GuGu never processes customer payments.
- Revenue is monthly/yearly SaaS subscriptions only: **Basic, Pro, Ultra**, monthly or yearly. There is **no free plan**. **X25:** every salon gets **Basic free for its first 12 months** from registration; after that Basic costs **99,000 VND/month** (`plan_prices`, display only; Pro/Ultra prices TBD). AI onboarding import is in all three. The AI assistant and the monthly Opus review are included **from Pro** (never in Basic). Basic: CRM, calendar, Zalo (OA + inbox, every plan), AI import (AI cap 10,000 VND, import only), marketplace listing. Pro adds the AI assistant, the monthly review and higher message quotas. Ultra adds multi-location chain reporting, the highest AI cap, admin-level analytics and promoted-listing credits. New salons get a 14-day trial with Pro features including the assistant, an AI cap of 20,000 VND and Basic message limits (100 Zalo template messages, 30 SMS); when it ends they drop to the free Basic year (q96). Final matrix: spec R-S2a. Every salon has a hard AI cost cap. GuGu pays for messaging inside the plan and tracks its cost. Plans are assigned manually in the MVP.
- Every booking has one immutable attribution record. Commission is **dormant**: specified (append-only ledger, no automatic charging) but not built for launch.

## Invariants
- **Founding partners (X19/X20):** salons or organisations whose first paid subscription started before `MARKETPLACE_LAUNCH_AT` carry `founding_partner`. For `[launch, launch + 24 months)`, every booking fee and commission is 0, recorded as a `waived` ledger entry with reason `founding_partner`. Fee rules MUST check `FoundingPartnerPolicy` first. Legal review is needed before marketplace launch. Spec §3.2a.
- SaaS first: the marketplace (and with it booking fees, commissions and promoted listings) launches only after GuGu has a Vietnamese company.
- No automatic charging. `paid` is a manual flag.
- No commission for cancelled or no-show bookings. One-time per new customer per salon by default.
- Gate by entitlement key, enforced on the backend.
- Quotas are idempotent and never overshoot.
- Flags ≠ entitlements.
- No client analytics without consent. No PII in events.
- Money figures always carry `RevenueKind` (`estimated_from_bookings | recorded_offline_sale | reported_by_salon`, owned by topic 07).
- `BookingSource` is a single enum owned here and mapped to `gugu_acquired | salon_acquired` (spec §3.1a).
- Zalo transactional channel is `zalo_template` (ZBS Template Message, formerly ZNS). SMS count and cost are metered per salon.
- No personal data goes to any LLM. Agent tools and the Admin Copilot use aggregates and opaque tokens only.
- Subscriptions are invoiced manually by the owner's company (Polish or Vietnamese, TBD). No processor in the MVP.
- Analytics is in-house: `/api/v1/events` → `analytics_event` (Postgres) → rollups. No third-party analytics.
- Salons see their own reliability score; raw risk signals are admin-only.
- Promoted listings are allowed at launch: flat weekly fee invoiced manually, max 2 Sponsored per page, always labeled.
- Paid Zalo template messages are sent only from the central GuGu OA. SMS is mocked for now; metering runs anyway. The Admin Copilot ships in v1, PII-free.
- Admin mutations require a reason and are audit logged.

## Model
_TODO: entity list with key fields and relations once the Prisma schema exists (see topic 04)._

| Entity | Purpose | Tenant-scoped |
|---|---|---|
| BookingAttribution | `BookingSource` + acquisition class + new-customer + eligibility per booking | yes |
| CommissionRule | versioned commission configuration | global/plan/salon |
| CommissionLedgerEntry / Event | append-only commission bookkeeping | yes |
| Plan / PlanEntitlement | commercial packaging | no |
| Subscription / EntitlementOverride | salon's current plan and grants | yes |
| FoundingPartner (`founding_partners`) | X20 flag per organisation: `qualified_at`, `source` (`paid_before_launch` \| `admin_grant`), `qualifying_subscription_id`, `revoked_at` | organisation |
| Salon suspension (`salons.status = suspended`, `suspended_at`, `pre_suspension_status`) | platform admin suspension | yes |
| UsageEvent / UsageCounter | metering | yes |
| FeatureFlag | rollout control | no |
| RiskSignal / SalonReliabilitySnapshot | trust | yes |
| AnalyticsEvent | in-house raw events (partitioned) | pseudonymous |
| MetricDaily / FunnelDaily / CohortMonthly | rollups | yes/platform |

## Flows
_TODO: sequence descriptions._
- Booking created → attribution attached (in-transaction)
- Booking completed → customer confirmation prompt → dispute window → commission confirmed
- AI request → entitlement check → usage reserve → model call → commit actual tokens
- Admin override → audit → cache invalidation (implemented: `AdminActions.run`, see "Platform admin")

## Entitlement keys
Registry: `ENTITLEMENT_KEYS` in `packages/contracts/src/subscriptions/entitlements.ts`. Values per plan: `PLAN_CATALOG` in `apps/api/src/modules/subscriptions/domain/plan-catalog.ts`, mirrored by rows inserted in migration `20261102115055_add_subscriptions_entitlements` (an integration test asserts they agree). Resolution: active override (newest wins) → plan of the current subscription → default (deny / 0). An expired, cancelled or missing subscription grants nothing.

## Subscriptions (M12.1)
- Tables: `plans`, `plan_prices` (empty, prices TBD), `plan_entitlements`, `subscriptions`, `subscription_events` (append-only history), `entitlement_overrides`.
- State machine (`domain/subscription-status.ts`): trialing → active | expired | cancelled; active → past_due | cancelled | expired; past_due → active | cancelled | expired. `cancelled` and `expired` are terminal; a returning salon gets a new row. Each transition writes a `subscription_events` row (from, to, actor, reason).
- One current (trialing | active | past_due) subscription per salon: partial unique index `subscriptions_one_current_per_salon`.
- Trial: `trial` plan (internal), 14 days, Pro features (incl. the assistant), AI cap 20,000 VND (`TRIAL_AI_CAP_VND`, q96), Basic message limits. A salon from the email-only signup has an AI cap of 0 until it is named (its first setup step, ADR-0018); admin overrides of the cap still apply.
- **Free Basic year (X25, ADR-0015):** `subscriptions.free_until` = local midnight after (registration date + 12 months) in the salon's time zone (`domain/free-year.ts`), set by `startTrial` and on every new row an admin creates. A trial past `trial_ends_at` reads immediately as **active Basic** while `free_until` is ahead (`effectiveStatus` / `effectivePlan`), otherwise as `expired`. `SubscriptionsFacade.endDueTrials()` records it in place (`trialing → active`, plan `trial → basic`, `current_period_end = free_until`, reason `trial_ended_free_basic`) or writes `expired`; it is not scheduled yet. After `free_until` Basic is paid: an admin records paid-until; lapses follow the manual state machine. A free Basic year never qualifies a founding partner.
- Read model (`GET /salons/:salonId/entitlements`) adds `freeUntil`, `paidUntil` and `basicMonthlyPriceVnd`. The cache TTL is capped by the trial end and the free-year end while they are ahead.
- Owner UI: Settings → Plan (`PlanSection`: plan, status, trial end, last free day, paid-until) and a Today notice in the last 3 days of the trial (`TRIAL_ENDING_NOTICE_DAYS`, q104) or the last 14 days of the free year (`PLAN_ENDING_NOTICE_DAYS`) (`PlanNotice`, logic `planEndingNotice` in `packages/domain`). Visible with `subscription.read` (owner, manager).
- The assistant bubble shows the "available from Pro" upsell when `ai.agent.enabled` is off, before any "not configured" notice; `POST /assistant/turns` answers 403 `entitlement.required` on Basic. AI import keeps working on Basic.

## Contract with topic 05 (salon registration)
Inside the registration transaction, right after inserting the salon, call `SubscriptionsFacade.startTrial({ salonId }, tx)` (input schema `startTrialInputSchema`, result `subscriptionSummarySchema` in `@gugu/contracts`). It is idempotent while that trial is current. If the salon already had a subscription, it throws `subscription.trial_unavailable` (409). It joins the caller's transaction, so a failed registration also rolls back the trial. Open items for topic 05:
1. Add FKs `subscriptions.salon_id`, `subscription_events.salon_id`, `entitlement_overrides.salon_id` → `salons(id)` (`Restrict`) in its salons migration or right after.
2. Replace the placeholder `SALON_ACCESS` port (`DenyAllSalonAccess`, which fails closed with 401) with the membership guard and `@RequirePermission('subscription.read')`.
3. Set `RequestContext.salonId` in the membership guard so `@RequiresEntitlement` uses it.

## Events
_TODO: one row per catalog event (name, side, properties, owner, metrics using it)._

| Event | Side | Owner | Feeds metric |
|---|---|---|---|
| `salon_quick_started` `{ locale }` | server (`analytics_events`, interim) | 07 | signup funnel |
| `setup_step_viewed` `{ step, step_index }` | server (interim) | 07 | setup drop-off per step |
| `setup_step_completed` `{ step, step_index, method, business_type, seconds_since_start }` | server (interim) | 07 | setup drop-off; share using AI import (07 §3.7) |
| `setup_step_skipped`, `setup_left` `{ step, step_index }` | server (interim) | 07 | setup drop-off |
| `setup_finished` `{ seconds_since_start, completed_count, skipped_count, went_live }` | server (interim) | 07 | time to first bookable state (07 §3.7) |
| `setup_card_dismissed` `{ remaining_count }`, `starter_services_added` `{ business_type, count }` | server (interim) | 07 | — |

_Interim store (ADR-0018): table `analytics_events` + catalogue `ANALYTICS_EVENTS` in `@gugu/contracts`, written by `modules/analytics`, until this topic builds `packages/analytics` and the partitioned pipeline._

## Metrics
_TODO: link each definition in `packages/domain/metrics` with its version._

## Feature flags
_TODO: active flags, owners, removal dates._

## Platform admin (M12.6)
GuGu staff only. A platform role is a column on the user (`users.platform_role`), never a salon membership. Default deny: every `/api/v1/admin/*` route has `@RequirePlatformPermission`; anonymous → 401, any salon role → 403 (generated matrix in `apps/api/src/modules/admin/admin.int.test.ts`).

### Admin permissions
| Action | Route | Permission | support_admin | super_admin | Step-up |
|---|---|---|---|---|---|
| Salon directory (search, filters, sort) | `GET /admin/salons` | `platform.directory.read` | yes | yes | — |
| Salon detail (members, subscription, overrides, usage, recent audit) | `GET /admin/salons/:salonId` | `platform.directory.read` | yes | yes | — |
| Usage overview (AI cost vs cap, Zalo templates, trials ending in 7 days) | `GET /admin/usage?month=` | `platform.usage.read` | yes | yes | — |
| Assign/change paid plan (+ interval, paid-until, invoicing entity) | `POST /admin/salons/:salonId/subscription/plan` | `platform.subscriptions.write` | no | yes | yes (can create a founding partner) |
| Extend trial (≤ 90 days ahead; re-opens an expired trial) | `POST …/subscription/trial` | `platform.subscriptions.write` | no | yes | — |
| Set paid-until (past_due paid into the future → active) | `POST …/subscription/paid-until` | `platform.subscriptions.write` | no | yes | — |
| Extend the free Basic year (X25; trial or Basic only, only later, ≤ 366 days beyond the current end) | `POST …/subscription/free-until` | `platform.subscriptions.write` | no | yes | yes (gives away paid months) |
| Entitlement override (mandatory expiry ≤ 366 days) / revoke | `POST …/overrides`, `POST …/overrides/:id/revoke` | `platform.entitlements.write` | no | yes | create |
| Founding partner grant / revoke | `POST …/founding-partner`, `POST …/founding-partner/revoke` | `platform.founding_partner.write` | no | yes | revoke |
| Suspend / unsuspend | `POST …/suspend`, `POST …/unsuspend` | `platform.salons.suspend` | no | yes | yes |
| Own second factor (status, enrol, confirm, step-up, recovery codes) | `GET /admin/mfa`, `POST /admin/mfa/*` | `platform.mfa.self` | yes | yes | — |
| Admin team list + reset ANOTHER admin's 2FA (q93; never oneself; reason required) | `GET /admin/team`, `POST /admin/team/:userId/mfa/reset` | `platform.mfa.reset` | no | yes | reset |

Directory filters (X25): `freeEndsWithinDays`, `freeEnded=true|false`, sort `free_until_asc`; list items and the detail carry `freeUntil` (the panel shows the last free day).

Every write above also needs an enrolled TOTP factor (403 `admin.mfa_enrollment_required`). Step-up = a TOTP or recovery code verified on the current session within 10 minutes (ADR-0011). Per-user limits: 240 requests and 30 writes per minute on `/admin/*`.

### Invariants
- Every admin mutation body requires `reason` (5–500 chars, no personal data) and goes through `AdminActions.run`: one transaction = domain change + `audit_logs` row (`actor_type = platform_admin`, actor id, `metadata = { reason, platformRole, before, after }`). No audit row → no change (rollback tested). Entitlement cache invalidated after commit.
- Step-up (ADR-0011, replaces ADR-0010's fresh sign-in): high-risk actions (suspend, unsuspend, founding-partner revoke, override create, plan assignment) need a TOTP/recovery code verified on this session within `ADMIN_STEP_UP_MINUTES` (10) → else 403 `admin.step_up_required`; the panel asks for the code inline and retries.
- Entitlement cache TTL is capped at the earliest of the trial end and every active override's `expiresAt` (`cacheTtl`).
- Suspension also blocks customer manage-link cancel/reschedule and invitation acceptance. Founding-partner changes are race-safe and clear the cache of every salon in the organisation. The panel shows only allow-listed audit metadata and hides removed members' emails.
- Suspended salon: `EntitlementService` grants nothing (overrides included, `suspended: true` in the read model); the guard refuses every non-GET salon route with 403 `salon.suspended`; members keep reading.
- Outside the guard (q89, 2026-11-04): the Zalo bot stops booking and answers once per conversation per 24 h with a neutral "contact the salon" notice; Zalo and email customer sends are skipped at send time (`salon_suspended`); the Zalo inbox stays readable. The salon summary (`GET /salons/:salonId`) carries `suspension { since, support { email, phone } }` (env `SUPPORT_EMAIL`, `SUPPORT_PHONE`) and the panel shows a banner on every page. Details: `docs/domains/zalo.md` → "Suspended salon".
- Subscription changes are in place on the one current row; each writes `subscription_events` (`from_plan_code` / `to_plan_code`, actor `admin:<userId>`). No processor, nothing charged: "paid until" is what an admin records after an offline invoice.
- Founding partner (R-FP3): set in the same transaction as the first paid `→ active` while `MARKETPLACE_LAUNCH_AT` (env; unset = not launched) is unset or in the future. Never re-set automatically after a revoke. Read model: `foundingPartner { since, waiverEndsAt }` (`waiverEndsAt` = launch + 24 months, null until the date is set).
- Usage = AI hard-cap counter (`AiCostMeter.monthlyUsage`, Redis, current + previous month only) and `zalo_send_logs` (channel `template`, status `sent`). These are GuGu costs, not salon revenue (no `RevenueKind`).
- Admin endpoints are not agent tools; nothing here is exposed to the product agent or the Admin Copilot.

### Local dev: seed a platform admin
```bash
cd apps/api
node --env-file=../../.env scripts/seed-platform-admin.mjs --email admin@gugu.local            # super_admin
node --env-file=../../.env scripts/seed-platform-admin.mjs --email support@gugu.local --role support_admin
```
The script requires `NODE_ENV=development`, a loopback host and a local database name (`gugu`/`gugu_<suffix>`), records the OS user, creates the user if needed and writes an `admin.platform_role_granted` audit row. Sign in at `/vi/sign-in` with that email (magic link in Mailpit), then open `/vi/admin`. Admin writes need two-step verification: add `--with-totp` to enrol a factor and print its secret, then `node scripts/totp-code.mjs <secret>` gives the current code (local TOTP flow: `docs/domains/auth-security.md#local-totp-flow`).

### UI
`apps/app/app/[locale]/(admin)/admin/` → `index.tsx` (overview), `salons/index.tsx` (directory), `salons/[salonId].tsx` (detail + action sheets). Feature code in `apps/app/features/admin/`. Light/dark allowed (X18, shares `CrmThemeProvider`); strings in the `admin` namespace (vi/en). Buttons are hidden by `PLATFORM_ROLE_PERMISSIONS` for display only.

## File map
- `apps/api/src/modules/subscriptions/`: `domain/` (plan catalogue, state machine, resolver), `application/` (`EntitlementService`, `SubscriptionsFacade`, `Clock`, cache port), `infra/` (Redis cache), `http/` (`EntitlementsController`, `@RequiresEntitlement`, `SALON_ACCESS` placeholder)
- `apps/api/src/modules/subscriptions/application/subscription-admin.service.ts`: admin operations (plan, trial, free year, paid-until, overrides, founding partners), each returning before/after for the audit row
- `apps/api/src/modules/subscriptions/domain/free-year.ts` (free-year end in the salon zone), `domain/subscription-status.ts` (`effectiveStatus`, `effectivePlan`)
- Migrations `20261104170000_x25_basic_free_year` (column, Basic cap 10,000, Basic v2, 99,000 VND price) and `20261104170100_x25_backfill_free_year` (data backfill; replayed in `x25-backfill.int.test.ts`)
- `apps/app/features/salon-crm/pages/settings/PlanSection.tsx`, `apps/app/features/salon-crm/today/PlanNotice.tsx`, `apps/app/features/salon-crm/data/plan.ts`, `apps/app/features/admin/FreePeriodSheet.tsx`, `packages/domain/src/subscriptions/plan-notice.ts`
- `apps/api/src/modules/admin/`: `application/admin-actions.ts` (audited runner, step-up, suspension), `application/admin-salons.queries.ts` (directory/detail), `application/admin-usage.queries.ts` (usage overview), `http/admin.controller.ts`, `admin.int.test.ts`
- `apps/api/scripts/seed-platform-admin.mjs` (local dev)
- `packages/contracts/src/subscriptions/` (keys, read model, start-trial contract, error codes), `packages/contracts/src/admin/admin.ts` (admin API contracts, `ADMIN_ERRORS`)
- `apps/app/features/admin/`, `apps/app/app/[locale]/(admin)/`, `packages/localization/locales/{vi,en}/admin.json`
- Planned: `apps/api/src/modules/{attribution,commission,usage,feature-flags,analytics,trust}/`
- `packages/analytics/`, `packages/domain/{entitlements,usage,metrics}/`

## ADRs
- ADR-0010 platform admin actions (roles on the user, audited runner, step-up, suspension).
- ADR-0011 admin TOTP step-up (supersedes ADR-0010 decision 3).
- ADR-0015 Basic free for the first year (`free_until`, trial ends into free Basic, backfill).
_TODO: attribution model & window · entitlement keys vs plan names · in-house analytics on Postgres · append-only commission ledger (dormant) · hard AI cost cap._
