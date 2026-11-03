# 0014 — Basic free for the first year: `free_until` on the subscription, trial ends into free Basic

- **Status:** proposed
- **Date:** 2026-11-03
- **Owner:** monetization-admin · **Topic:** 12 (owner decision X25, amends X17; q96)

## Context
X25: every salon gets Basic free for 12 months from registration, then Basic costs 99,000 VND/month. Basic has no AI assistant (it keeps the AI price-list import). The 14-day Pro trial stays as an upgrade taster (q96, answered yes: Pro features including the assistant, AI budget 20,000 VND; when it ends the salon drops to the free Basic year with no lock-out; Basic AI budget 10,000 VND/month for the import only). There is no payment processor: an admin records "paid until" after an offline invoice, and `past_due` is set by hand.

Before X25 a trial ended into `expired` (read-only workspace). With X25 an ended trial has to keep the salon working, on Basic.

## Decision
1. **`subscriptions.free_until` (timestamptz, nullable)** stores the end of the free Basic year. It is the local midnight after (registration date + 12 months) in the salon's own time zone, so the free year covers the whole anniversary day (`domain/free-year.ts`; 29 Feb clamps to 28 Feb, like Postgres `date + interval '12 months'`). It is set by `startTrial` and on every new subscription row an admin creates (trial re-open, plan assignment), always from `salons.created_at`.
2. **A free period is not a plan and not a promo.** Basic stays one plan with one price. "Free" only means no invoice before `free_until`. Plan changes update the current row in place, so `free_until` survives a Pro upgrade and applies again after a downgrade to Basic inside the year.
3. **Trial end → free Basic, in place.** `SubscriptionsFacade.endDueTrials()` moves an ended trial whose free year still runs to `active` on `basic` (`trialing → active`, plan `trial → basic`, `interval = month`, `current_period_end = free_until`, history reason `trial_ended_free_basic`). Outside the free year it writes `expired` as before. Reads never wait for the job: `effectiveStatus` and `effectivePlan` already treat an ended trial in the free year as active Basic, and `EntitlementService` loads Basic's entitlements for it. The admin directory SQL mirrors the same rule.
4. **After the free year Basic is simply paid.** `current_period_end` (paid until) equals `free_until` until an admin records a later paid-until. Lapses follow the existing manual state machine (`active → past_due` by an admin). No automatic charging and no automatic `past_due`.
5. **Founding partner (X20) unchanged in meaning:** a free Basic year is not a paid subscription. The trial → Basic fall never qualifies, and an admin assigning Basic while `free_until` is still ahead does not qualify either. Pro or Ultra, or Basic after the free year, qualifies as before.
6. **Admin can extend the free year** (`POST /admin/salons/:salonId/subscription/free-until`, `platform.subscriptions.write`, reason + audit, **step-up** like plan assignment because it gives away paid months). Only later, at most 366 days beyond the current end, only on a current trial or Basic subscription. On Basic the covered period moves with it and `past_due` becomes `active`.
7. **Entitlement cache:** the TTL is capped by the trial end and the free-year end when they are still ahead. Boundaries already passed no longer disable caching, because an ended trial now resolves to a stable state (free Basic or expired).
8. **Backfill** (migration `20261104170100_x25_backfill_free_year`, re-runnable): current trial and Basic subscriptions get `free_until` from registration. Basic inside its free year is covered until it ends (a `past_due` one becomes active). Salons whose trial had already expired and that are still inside their first year get a new active Basic row, since under X25 their trial would have ended into free Basic. Every change writes a `subscription_events` row (`x25_free_year_backfill`).

## Alternatives considered
- **A separate `free` plan or a `basic_free_year` promo row.** Rejected: X17 forbids a free plan, and a promo table adds a second source of truth for what a salon pays.
- **`free_until` on the salon.** It is a commercial fact about the subscription, it is edited through the same audited admin runner, and it is read together with paid-until.
- **Ending the trial into `expired` and creating a new Basic row.** That breaks the "one row per continuous relationship" history and would lock the salon out between the trial end and the job run.

## Consequences
- Basic's AI cap drops to 10,000 VND (plan version 2), and the trial keeps 20,000 VND explicitly (`TRIAL_AI_CAP_VND`), so the trial is no longer "Pro features with exactly Basic limits".
- `endDueTrials()` replaces `expireDueTrials()` and is still not scheduled (topic 13 worker scheduling). Reads are correct without it.
- Owners see the plan, the trial end, the free-year end and paid-until in Settings → Plan, and a Today notice in the last 14 days before the trial or the free year ends.
