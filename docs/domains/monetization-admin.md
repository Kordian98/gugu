# Domain: monetization, attribution, admin, analytics

Durable reference for booking attribution, commission, plans/entitlements, usage metering, feature flags, analytics/metrics, trust signals and the platform admin. Read this before changing any of them. The spec with rationale is `docs/tasks/12-monetization-admin.md`.

Status: **skeleton.** Nothing is implemented yet. Fill in each section as code lands.

## Summary
- Customers book for free and pay at the salon. GuGu never processes customer payments.
- Salons get a free plan by default. Paid plans unlock entitlements (AI agent, Zalo inbox, quotas…). Plans are assigned manually in the MVP.
- Every booking has one immutable attribution record. Commission is a configurable, inactive-by-default foundation with an append-only ledger and no automatic charging.

## Invariants
- No automatic charging. `paid` is a manual flag.
- No commission for cancelled or no-show bookings. One-time per new customer per salon by default.
- Gate by entitlement key, enforced on the backend.
- Quotas are idempotent and never overshoot.
- Flags ≠ entitlements.
- No client analytics without consent. No PII in events.
- Money figures always carry `revenueKind`.
- Admin mutations require a reason and are audit logged.

## Model
_TODO: entity list with key fields and relations once the Prisma schema exists (see topic 04)._

| Entity | Purpose | Tenant-scoped |
|---|---|---|
| BookingAttribution | source + new-customer + eligibility per booking | yes |
| CommissionRule | versioned commission configuration | global/plan/salon |
| CommissionLedgerEntry / Event | append-only commission bookkeeping | yes |
| Plan / PlanEntitlement | commercial packaging | no |
| Subscription / EntitlementOverride | salon's current plan and grants | yes |
| UsageEvent / UsageCounter | metering | yes |
| FeatureFlag | rollout control | no |
| RiskSignal / SalonReliabilitySnapshot | trust | yes |
| MetricDaily | rollups | yes/platform |

## Flows
_TODO: sequence descriptions._
- Booking created → attribution attached (in-transaction)
- Booking completed → customer confirmation prompt → dispute window → commission confirmed
- AI request → entitlement check → usage reserve → model call → commit actual tokens
- Admin override → audit → cache invalidation

## Entitlement keys
_TODO: generated table from `packages/domain/entitlements/keys.ts`._

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
_TODO: paths once created._
- `apps/api/src/modules/{attribution,commission,subscriptions,usage,feature-flags,analytics,trust,admin}/`
- `packages/analytics/`, `packages/domain/{entitlements,usage,metrics}/`
- `apps/app/app/[locale]/(admin)/`

## ADRs
_TODO: attribution model & window · entitlement keys vs plan names · analytics vendor & data residency · append-only commission ledger._
