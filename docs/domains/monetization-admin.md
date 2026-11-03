# Domain: monetization, attribution, admin, analytics

Durable reference for booking attribution, commission, plans/entitlements, usage metering, feature flags, analytics/metrics, trust signals and the platform admin. Read this before changing any of them. The spec with rationale is `docs/tasks/12-monetization-admin.md`.

Status: **M12.1 implemented** (plans, subscriptions, entitlements, trial). **M12.6 platform admin panel implemented** (platform roles, audited admin API, salon directory/detail, manual plans/trials/paid-until, overrides, founding partners, suspension, usage overview; ADR-0010). Everything else in this doc is still a skeleton.

## Summary
- Customers book for free and pay at the salon. GuGu never processes customer payments.
- Revenue is monthly/yearly SaaS subscriptions only: **Basic, Pro, Ultra**, monthly or yearly (prices TBD). There is **no free plan**. AI onboarding import is in all three. The AI assistant and the monthly Opus review are included from Pro. Basic: CRM, calendar, AI import, marketplace listing. Pro adds the AI assistant, the monthly review, the Zalo inbox and higher message quotas. Ultra adds multi-location chain reporting, the highest AI cap, admin-level analytics and promoted-listing credits. New salons get a 14-day trial with Pro features but Basic limits (AI cap 20,000 VND, 100 Zalo template messages, 30 SMS). Final matrix: spec R-S2a. Every salon has a hard AI cost cap. GuGu pays for messaging inside the plan and tracks its cost. Plans are assigned manually in the MVP.
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
- Trial: `trial` plan (internal), 14 days, Pro features with Basic limits. A trial past `trial_ends_at` reads as `expired` immediately. `SubscriptionsFacade.expireDueTrials()` records the transition; it is not scheduled yet.

## Contract with topic 05 (salon registration)
Inside the registration transaction, right after inserting the salon, call `SubscriptionsFacade.startTrial({ salonId }, tx)` (input schema `startTrialInputSchema`, result `subscriptionSummarySchema` in `@gugu/contracts`). It is idempotent while that trial is current. If the salon already had a subscription, it throws `subscription.trial_unavailable` (409). It joins the caller's transaction, so a failed registration also rolls back the trial. Open items for topic 05:
1. Add FKs `subscriptions.salon_id`, `subscription_events.salon_id`, `entitlement_overrides.salon_id` → `salons(id)` (`Restrict`) in its salons migration or right after.
2. Replace the placeholder `SALON_ACCESS` port (`DenyAllSalonAccess`, which fails closed with 401) with the membership guard and `@RequirePermission('subscription.read')`.
3. Set `RequestContext.salonId` in the membership guard so `@RequiresEntitlement` uses it.

## Events
_TODO: one row per catalog event (name, side, properties, owner, metrics using it)._

| Event | Side | Owner | Feeds metric |
|---|---|---|---|

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
| Assign/change paid plan (+ interval, paid-until, invoicing entity) | `POST /admin/salons/:salonId/subscription/plan` | `platform.subscriptions.write` | no | yes | — |
| Extend trial (≤ 90 days ahead; re-opens an expired trial) | `POST …/subscription/trial` | `platform.subscriptions.write` | no | yes | — |
| Set paid-until (past_due paid into the future → active) | `POST …/subscription/paid-until` | `platform.subscriptions.write` | no | yes | — |
| Entitlement override (mandatory expiry ≤ 366 days) / revoke | `POST …/overrides`, `POST …/overrides/:id/revoke` | `platform.entitlements.write` | no | yes | — |
| Founding partner grant / revoke | `POST …/founding-partner`, `POST …/founding-partner/revoke` | `platform.founding_partner.write` | no | yes | revoke |
| Suspend / unsuspend | `POST …/suspend`, `POST …/unsuspend` | `platform.salons.suspend` | no | yes | yes |

### Invariants
- Every admin mutation body requires `reason` (5–500 chars, no personal data) and goes through `AdminActions.run`: one transaction = domain change + `audit_logs` row (`actor_type = platform_admin`, actor id, `metadata = { reason, platformRole, before, after }`). No audit row → no change (rollback tested). Entitlement cache invalidated after commit.
- Step-up: high-risk actions need a sign-in within `ADMIN_STEP_UP_MINUTES` (15) → else 403 `admin.step_up_required`.
- Suspended salon: `EntitlementService` grants nothing (overrides included, `suspended: true` in the read model); the guard refuses every non-GET salon route with 403 `salon.suspended`; members keep reading.
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
The script refuses production and non-local databases, creates the user if needed and writes an `admin.platform_role_granted` audit row. Sign in at `/vi/sign-in` with that email (magic link in Mailpit), then open `/vi/admin`.

### UI
`apps/app/app/[locale]/(admin)/admin/` → `index.tsx` (overview), `salons/index.tsx` (directory), `salons/[salonId].tsx` (detail + action sheets). Feature code in `apps/app/features/admin/`. Light/dark allowed (X18, shares `CrmThemeProvider`); strings in the `admin` namespace (vi/en). Buttons are hidden by `PLATFORM_ROLE_PERMISSIONS` for display only.

## File map
- `apps/api/src/modules/subscriptions/`: `domain/` (plan catalogue, state machine, resolver), `application/` (`EntitlementService`, `SubscriptionsFacade`, `Clock`, cache port), `infra/` (Redis cache), `http/` (`EntitlementsController`, `@RequiresEntitlement`, `SALON_ACCESS` placeholder)
- `apps/api/src/modules/subscriptions/application/subscription-admin.service.ts`: admin operations (plan, trial, paid-until, overrides, founding partners), each returning before/after for the audit row
- `apps/api/src/modules/admin/`: `application/admin-actions.ts` (audited runner, step-up, suspension), `application/admin-salons.queries.ts` (directory/detail), `application/admin-usage.queries.ts` (usage overview), `http/admin.controller.ts`, `admin.int.test.ts`
- `apps/api/scripts/seed-platform-admin.mjs` (local dev)
- `packages/contracts/src/subscriptions/` (keys, read model, start-trial contract, error codes), `packages/contracts/src/admin/admin.ts` (admin API contracts, `ADMIN_ERRORS`)
- `apps/app/features/admin/`, `apps/app/app/[locale]/(admin)/`, `packages/localization/locales/{vi,en}/admin.json`
- Planned: `apps/api/src/modules/{attribution,commission,usage,feature-flags,analytics,trust}/`
- `packages/analytics/`, `packages/domain/{entitlements,usage,metrics}/`

## ADRs
- ADR-0010 platform admin actions (roles on the user, audited runner, step-up, suspension).
_TODO: attribution model & window · entitlement keys vs plan names · in-house analytics on Postgres · append-only commission ledger (dormant) · hard AI cost cap._
