# Domain: monetization, attribution, admin, analytics

Durable reference for booking attribution, commission, plans/entitlements, usage metering, feature flags, analytics/metrics, trust signals and the platform admin. Read this before changing any of them. The spec with rationale is `docs/tasks/12-monetization-admin.md`.

Status: **M12.1 implemented** (plans, subscriptions, entitlements, trial). Everything else in this doc is still a skeleton.

## Summary
- Customers book for free and pay at the salon. GuGu never processes customer payments.
- Revenue is monthly/yearly SaaS subscriptions only: **Basic, Pro, Ultra**, monthly or yearly (prices TBD). There is **no free plan**. AI onboarding import is in all three. The AI assistant and the monthly Opus review are included from Pro. Basic: CRM, calendar, AI import, marketplace listing. Pro adds the AI assistant, the monthly review, the Zalo inbox and higher message quotas. Ultra adds multi-location chain reporting, the highest AI cap, admin-level analytics and promoted-listing credits. New salons get a 14-day trial with Pro features but Basic limits (AI cap 20,000 VND, 100 Zalo template messages, 30 SMS). Final matrix: spec R-S2a. Every salon has a hard AI cost cap. GuGu pays for messaging inside the plan and tracks its cost. Plans are assigned manually in the MVP.
- Every booking has one immutable attribution record. Commission is **dormant**: specified (append-only ledger, no automatic charging) but not built for launch.

## Invariants
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
- Admin override → audit → cache invalidation

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

## Admin permissions
_TODO: matrix of support_admin vs super_admin per action._

## File map
- `apps/api/src/modules/subscriptions/`: `domain/` (plan catalogue, state machine, resolver), `application/` (`EntitlementService`, `SubscriptionsFacade`, `Clock`, cache port), `infra/` (Redis cache), `http/` (`EntitlementsController`, `@RequiresEntitlement`, `SALON_ACCESS` placeholder)
- `packages/contracts/src/subscriptions/` (keys, read model, start-trial contract, error codes)
- Planned: `apps/api/src/modules/{attribution,commission,usage,feature-flags,analytics,trust,admin}/`
- `packages/analytics/`, `packages/domain/{entitlements,usage,metrics}/`
- `apps/app/app/[locale]/(admin)/`

## ADRs
_TODO: attribution model & window · entitlement keys vs plan names · in-house analytics on Postgres · append-only commission ledger (dormant) · hard AI cost cap._
