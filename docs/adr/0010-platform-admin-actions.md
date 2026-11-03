# ADR 0010: Platform admin: roles on the user, one audited action runner, cheap step-up, suspension

- Status: proposed
- Date: 2026-11-03
- Owner: monetization-admin (topic 12, milestone M12.6 panel)

## Context

GuGu staff need a panel to run the SaaS by hand: assign plans after an offline invoice, extend trials, record paid-until dates, grant entitlement overrides, flag founding partners (X20) and suspend abusive salons. There is no payment processor (G10). The roadmap gate for step 10 is "every admin action has a reason and an audit row". Topic 05 owns auth and the permission matrix; admin TOTP/passkeys and impersonation are its step 9 and are not built yet.

## Decision

1. **Platform roles stay a column on `users`** (`platform_role ∈ {support_admin, super_admin}`), never a salon membership. Routes use `@RequirePlatformPermission(...)`; a salon role grants no `platform.*` permission (matrix test in `packages/domain`). Default deny: `/api/v1/admin/*` answers 401 to anonymous callers and 403 to every salon role (generated integration matrix over all admin routes). New permissions: `platform.usage.read` (both roles), `platform.subscriptions.write`, `platform.entitlements.write`, `platform.founding_partner.write` (super_admin only). `support_admin` also gets `platform.audit.read` (spec R-AD4: support reads everything except money configuration).
2. **One write path: `AdminActions.run`** (`apps/api/src/modules/admin/application/admin-actions.ts`). It re-validates the reason, optionally checks step-up, and in **one transaction** verifies the salon, runs the domain change (which returns before/after snapshots) and writes the `audit_logs` row (`actor_type = platform_admin`, actor id, platform role, reason, before, after, IP prefix, user agent). If the audit insert fails, the change rolls back (tested). The entitlement cache is invalidated after commit. Business rules stay in the owning module (`SubscriptionAdminService` in subscriptions), so the admin module remains a thin BFF (spec §4).
3. **Step-up = recent sign-in.** Suspend, unsuspend and founding-partner revocation need a session created within `ADMIN_STEP_UP_MINUTES` (15). Otherwise the API returns 403 `admin.step_up_required` and the UI offers "sign in again" (magic link). This is a cheap stand-in until topic 05 ships admin TOTP/passkeys.
4. **Suspension** sets `salons.status = suspended`, `suspended_at` and `pre_suspension_status` (check constraint `salons_suspension_consistent`). Effects: `EntitlementService` grants nothing (overrides included), and the auth guard refuses every non-GET salon route with 403 `salon.suspended`, while members keep read access. Unsuspend restores the previous status.
5. **Subscriptions are changed in place.** The salon's one current subscription row gets the new plan, status, interval and paid-until; every change writes a `subscription_events` row (now with `from_plan_code` / `to_plan_code`). Salons without a current subscription get a new row. An expired trial can be re-opened as a new trial row (admin decision, audited).
6. **Founding partners** live in `founding_partners` (one row per organisation; `source ∈ {paid_before_launch, admin_grant}`, `revoked_at`). The first paid activation before `MARKETPLACE_LAUNCH_AT` (env, unset = not launched) sets it in the same transaction; a revoked flag is never re-set automatically. The entitlements read model exposes `foundingPartner { since, waiverEndsAt }` (R-FP7).
7. **Admin list pagination is an opaque offset cursor** (`limit ≤ 100`), because admin lists sort by derived columns (last activity, bookings) where keyset cursors do not fit. Usage reads the AI hard-cap counter (`AiCostMeter.monthlyUsage`, Redis, ~40-day TTL), so only the current and previous month are offered.

## Consequences

- Adding an admin mutation means: Zod body with `reason` in `packages/contracts/src/admin`, a domain method returning `AdminChange`, a controller method calling `AdminActions.run`, an audit action in `AUDIT_ACTIONS`, and a `validBody` entry in `admin.int.test.ts` (the matrix fails until it exists).
- Step-up by fresh sign-in costs admins a magic-link round trip for destructive actions; acceptable at MVP volume.
- Suspension does not yet stop the Zalo bot webhook flow or scheduled reminders for that salon (they do not go through the HTTP guard). Topic 09/11 must check `EntitlementService` or the salon status there (follow-up).
- AI spend history beyond ~40 days needs topic 12 M12.5 (`usage_events` in Postgres).
- Read-only impersonation is not built (topic 05 step 9).
