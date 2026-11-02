---
name: analytics-event
description: How to add or change a tracked analytics event in GuGu — typed event catalog, client vs server emission, consent gating, PII rules, and wiring into metrics rollups. Use when adding track() calls, editing packages/analytics, defining product metrics, or touching consent for analytics.
---

# Adding a tracked analytics event

All events are declared once in a typed catalog (`packages/analytics/src/events/`) and sent through a single facade. Analytics is **built in-house** (owner decision): client events are batched to our `POST /api/v1/events`, stored in the monthly-partitioned `analytics_event` table in our Postgres, and aggregated by BullMQ rollup jobs. There is **no PostHog or any third-party analytics**. Never add such an SDK. Business facts are emitted server-side; behavioral events are emitted by the client only with consent. Spec: `docs/tasks/12-monetization-admin.md` §3.6.

## When to use
- You need a new event for a funnel, metric or dashboard.
- You are changing an existing event's properties.
- You are defining a new platform or salon metric.

## Invariants
- MUST declare the event in the catalog with a Zod schema. Untyped `track('foo')` must not compile.
- MUST NOT include PII in properties: phone, email, names, addresses, notes, review or message text, raw IP. Use IDs; `analytics_event` stores only a salted `actor_hash`, never the raw user ID. The CI linter enforces a deny-list of property names.
- Client behavioral events MUST be dropped when analytics consent is not granted. No fingerprinting and no queue-then-send-later without consent.
- Business facts (booking completed or cancelled, review submitted, salon registered…) MUST be emitted server-side from domain events via the outbox, never from the client. They are the source of truth for metrics.
- Metric definitions live only in `packages/domain/metrics`. Dashboards and the AI agent reuse them; never re-derive them ad hoc.
- Money properties MUST carry `revenue_kind` with a `RevenueKind` value (`estimated_from_bookings | recorded_offline_sale | reported_by_salon`), imported from `packages/domain/metrics` (owned by topic 07).
- Booking-related events MUST use the shared `BookingSource` enum for `source` (owned by topic 12, `packages/contracts`) and MAY add `acquisition_class` (`gugu_acquired | salon_acquired`) from `acquisitionClassOf()`. Never declare a local list of booking sources.
- Zalo transactional sends use channel id `zalo_template` (ZBS Template Message). Do not use `zns` in event or property names.

## Naming
`snake_case`, `<object>_<past_tense_verb>` or the established names from the spec: `search_performed`, `salon_viewed`, `booking_started`, `booking_completed`, `favorite_added`, `staff_invited`. Property names are `snake_case`. Enums are lowercase strings.

## Procedure
1. **Decide the side.** Is it a business fact that must be correct regardless of consent or ad blockers? Then emit it on the server. Is it a UI behavior? Then emit it on the client, consent-gated.
2. **Declare** in `packages/analytics/src/events/<domain>.ts`:
   ```ts
   export const salonViewed = defineEvent('salon_viewed', {
     side: 'client',
     schema: z.object({
       salon_id: z.string().uuid(),
       source: z.enum(['search', 'home', 'deeplink', 'favorite', 'zalo']),
       locale: z.enum(['vi', 'en']),
     }),
     description: 'Public salon profile became visible',
     owner: 'topic-10',
   });
   ```
3. **Emit.**
   - Client: `track(salonViewed, { ... })` from a hook or screen effect (once per view, debounced).
   - Server: publish a domain event, and the analytics outbox consumer maps it to the catalog event (`modules/analytics/mappers/<domain>.ts`).
4. **Metric (if any):** add or extend the definition in `packages/domain/metrics/<metric>.ts` with a version bump and a fixture test with a known expected value. Register a rollup in the `metric_daily` job if it needs one.
5. **Docs:** add a row to the event table in `docs/domains/monetization-admin.md#events` (name, side, properties, owner, metric usage).
6. **Tests:**
   - Schema test: invalid props are rejected.
   - Consent test: with consent off, the client adapter makes zero network calls.
   - Server mapping test: the domain event produces exactly one analytics event (idempotent on outbox replay).

## Booking source values (owned by topic 12)
`marketplace`, `promoted_listing`, `gugu_campaign`, `zalo_mini_app` → `gugu_acquired`
`salon_profile`, `direct_link`, `qr_code`, `social_media`, `zalo_oa`, `zalo_link`, `zalo_chat`, `phone`, `walk_in`, `staff_created`, `repeat_customer`, `ai_agent` → `salon_acquired`

Full meanings and rules: `docs/tasks/12-monetization-admin.md` §3.1a. Note that the `salon_viewed.source` example above is a *UI entry point*, not a booking source, so it keeps its own small enum.

## Changing an existing event
Adding an optional property is fine. Renaming or removing a property, or changing its meaning, means creating a new event name (`*_v2`) and keeping the old one until dashboards migrate. Note it in the domain doc.

## Checklist before PR
- [ ] Declared in the catalog with schema, side, description, owner
- [ ] No PII (linter passes)
- [ ] Consent gating verified (client) or emitted via outbox (server)
- [ ] Metric definition + fixture test if it feeds a metric
- [ ] Domain doc event table updated
