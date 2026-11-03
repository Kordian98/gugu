# Booking engine (domain doc)

Durable reference for how GuGu computes availability and creates bookings without double-booking. Read this before touching `packages/domain/src/booking` or `apps/api/src/modules/bookings`. Spec and rationale: `docs/tasks/06-booking-engine.md`. Procedures: `.claude/skills/booking-engine/SKILL.md`.


## Status
M6.1–M6.5 implemented on `booking/06-core` (2026-11-03): pure slot engine, occupancy schema with
EXCLUDE constraint, create/transition/reschedule with idempotency + history + outbox, holds with
TTL + sweeper, CRM APIs. The public salon booking page and guest manage links exist in code
(`http/public-booking.controller.ts`) but are **not routed** (roadmap X23: no customer-facing booking
surface on gugu.vn until a legal review); tests mount the controller to keep customer paths covered. **M6.6 resources** implemented on `booking/06-resources` (2026-11-03). **Not implemented yet:**
~~availability cache (M6.7)~~ (done on `booking/06-cache`), ~~multi-service (M6.8)~~ (done on `booking/06-multi-service`, flagged), AI-agent drafts (M6.9), outbox relay
(04-S5), Turnstile bot check, alternative slots in `409 slot_taken`, account-deletion
anonymisation (q71).

## Glossary
| Term | Meaning |
|---|---|
| Occupancy | A row in `booking_occupancy` reserving a staff member or resource unit for a half-open time range. |
| Hold | Temporary occupancy (`kind='hold'`, `expires_at`) during checkout. |
| Resource unit | One capacity slot of a resource; capacity N → N units. |
| Buffer | Prep/cleanup time before/after a service, included in occupancy. |
| Draft | Unconfirmed booking needing human confirmation — only AI-agent bookings (X9 + X11). Customer self-service needs no OTP; it may start `pending` via `require_confirmation_for`. |
| Chain / line | Multi-service booking (M6.8): 1–4 services in sequence (`booking_services` rows, `sequence` 1..4), each with its own staff, times, snapshots and occupancy rows. A single service is a chain of one. |
| Add-on | Optional per-service extra (extra duration + price) chosen with the service; snapshotted per booking (q17). |
| identity_verified | Whether the booking phone has been verified; `false` does not block a booking (X11). |
| Source | `BookingSource` enum owned by topic 12, imported from `packages/contracts`. |
| ZBS Template Message | Zalo transactional message (formerly ZNS); notification channel id `zalo_template`. |

## Invariants
- Every staff time claim is a `booking_occupancy` row: half-open `tstzrange` `[start − buffer_before, end + buffer_after)`.
- `booking_occupancy_no_staff_overlap` (`EXCLUDE USING gist (staff_id =, period &&) WHERE active`) is the guarantee; never weakened, never overridable.
- Writers take `pg_advisory_xact_lock(hashtextextended(staff_id, 0))` for every candidate staff (sorted) before touching occupancy (ADR-0008 d4); `23P01`/`40P01` → `409 booking.slot_taken`.
- Every write revalidates with `findSlot` inside its transaction; availability responses are never trusted.
- Status changes only through `evaluateTransition`; each writes `booking_status_history` (append-only trigger) and an `outbox_events` row.
- Snapshots (`booking_services`, `booking_service_addons`) never change after creation; reschedule keeps them.
- Draft policy (X9 + X11): staff entries confirmed; customer self-service needs no OTP (pending only in manual mode or with `confirm_new_clients`); AI agent → draft (not reachable yet).
- No personal data in outbox payloads, audit metadata, rate-limit keys or lock keys (hashes via `BOOKING_TOKEN_SECRET`).

## Data model
Migration `20261102140746_add_booking_core` (after topic 07's catalog migration):
`bookings` (status, source = `BookingSource`, contact snapshot + `customer_phone_hash`, `identity_verified`, totals, `late_cancellation`, `rule_overrides`, `manage_token_hash/expires_at`, `pending_expires_at`, `version`), `booking_services` (1–4 lines per booking since M6.8, snapshots, `CHECK sequence BETWEEN 1 AND 4`, index `(salon_id, staff_id, starts_at)`), `booking_service_addons`, `booking_holds` (device hash, TTL), `booking_occupancy` (kind booking|hold, `period tstzrange`, `active`), `booking_status_history`, `idempotency_keys`, `outbox_events`. Raw objects: `booking_occupancy_no_staff_overlap`, `booking_occupancy_valid`, `bookings_valid`, `booking_services_valid`, `booking_status_history_no_update_delete`, `outbox_events_unpublished`.

## Resources (M6.6)
- Tables (migration `20261103180000_add_resources`): `resource_types` (salon-defined kinds), `resources` (type, name, active), `resource_units` (capacity N = N active units, `position` 1..N, managed by the API), `service_resource_requirements` (service → type, quantity 1–3). `booking_occupancy` gains `resource_unit_id`; exactly one of staff/unit per row (`booking_occupancy_one_target`); `booking_occupancy_no_unit_overlap` EXCLUDE guards units like staff.
- Engine: `pickUnits` (`packages/domain/src/booking/resources.ts`) — every staff option needs `quantity` free units of each required type for the same occupancy interval (buffers included); units fill in resource order then unit number. `unavailableReason` → `no_resource` when a required type has too few active units.
- Writes lock staff candidates **and** all units of required types in one sorted list (`lockClaims`), release expired holds on both, and insert one occupancy row per unit; holds, reschedule (re-resolves today's requirements), cancel/no-show (deactivate by booking) cover units.
- CRUD: `GET/POST/PATCH/DELETE /salons/:id/resource-types|resources`, `GET/PUT /salons/:id/services/:serviceId/resource-requirements`; also `resourceRequirements` in the catalog service payload/read model. Lowering capacity, pausing or deleting refuses units with future claims (`409 resource.in_use`); deleting a type in use → `409 resource.type_in_use`.

## Multi-service bookings (M6.8)
ADR: `docs/adr/0013-multi-service-chains.md`. Flag `booking.multiService` = env `BOOKING_MULTI_SERVICE`, **on by default everywhere incl. production** (q91 supersedes q17); `false` is the off-switch. `GET /salons/:id/booking-features` → `{ multiService, maxServices: 4 }`; with the flag off, `nextServices` → `422 booking.multi_service_disabled` on create, availability, earliest and booking-check.
- **Contracts:** `nextServices: [{ serviceId, variantId?, addOnIds, staffId? }]` (≤ 3) on `POST bookings`, and as a JSON-array query param on `availability`, `availability/earliest`, `booking-check`. Slots gain `lines[]` (best plan: service, start, end, staff per line); `durationMinutes` = Σ service lengths. Bookings gain `services[]` (every line with `staffId`, `startsAt`, `endsAt`, snapshots); `service`, `staffId`, `startsAt`/`endsAt` keep their single-service meaning (first line / whole span).
- **Timing** (`lineTiming` in `packages/domain/src/booking/chain.ts`): same staff → next start = previous end + max(after, before), rows touch; other staff → next start = previous end, their prep overlaps the previous service. The whole chain must fit inside each staff member's free time that day; only the first start obeys lead time.
- **Planning:** `planStart` / `planFrom` (DFS, `chain-search.ts`) per start and first-line staff; "any" on later lines prefers the previous line's staff. Units are claimed per line; earlier lines' units are busy for later ones.
- **Search budget (security review M1, ADR-0013 amendment):** per-day and per-start pre-checks (`chain-day.ts`: every line placeable on its own, each later line within its start window), memo per start on (line, previous staff/end/after-buffer, claims that can still overlap), and deterministic step budgets — 5 000 per start, 1 000 000 per request shared across days and windows (`searchBudget()`, `computeSlots(input, budget)`). Single services spend nothing. Out of budget → slots found so far, `truncated: true`, `unavailableReason: null`. Earliest slot for chains scans ≤ 62 days (`MAX_CHAIN_EARLIEST_DAYS`), also `truncated` when it stops there short of `limit`. Worst case (15 staff, impossible 4th line): 31-day window 13.6 s → ~0.18 s; earliest scan ~160 s → ~0.12 s.
- **Writes:** one sorted `lockClaims` over every line's candidates + units → revalidate the chain with `findSlot` → one occupancy row per staff/unit per line. Reschedule moves every line (snapshots kept); request `staffId` re-assigns the lines the first line's staff member was doing. Cancel / no-show release every row. Outbox `booking.created` adds `staffIds`, `serviceCount`; `booking.rescheduled` adds `fromStaffIds`, `toStaffIds`.
- **Scopes:** own-calendar staff read bookings where they do any line (`staffOnBooking`), write only where they do every line (`ownsEveryLine`, security review); their new chains go into their own calendar. CRM `staffId` list filter matches any line.
- **Integrations:** CRM new appointment (add/remove lines, chain earliest slot, per-line plan), calendar (one block per staff part, "part n/m", drag by first block), drawer (lines with time/staff/price; reschedule offers chain times); emails/bell list all services ("A + B") and staff; team notifications reach every line's staff; Zalo bot offers an optional second service (max 2), messages name all services, and hands a reschedule of a 3–4-service booking to the salon (`rescheduleContactSalon` + handoff, security review L3); insights top services use line prices; client lookup counts one visit per booking.
- **Not covered:** holds and the public page stay single-service; customers-crm own scope and insights per-staff figures still attribute a chain to its first staff member.
- Tests: `chain.test.ts`, `chain.property.test.ts`, `chain-budget.test.ts` (same answers as plain backtracking, budgets, truncation, write-path revalidation), `chain-perf.test.ts` (strict time limits) (domain), `multi-service.int.test.ts` (API: create/reschedule/cancel, scopes, flag, cache, race harness chains vs singles incl. a shared unit), `zalo/domain/bot/multi-service.test.ts`.

## Availability cache (M6.7)
`apps/api/src/modules/bookings/infra/availability-cache.ts` — read-through Valkey cache for `BookingQueries.availability` and `.earliest` (CRM, Zalo bot, earliest-slot search). Key: salon + `salon_settings.availability_version` (bumped in-transaction by hours/holidays/schedules/time off/catalog/resources/booking-settings writes) + per-salon occupancy generation `avail:occ:<salonId>` (INCR after every booking/hold/transition/reschedule commit) + current minute + query hash; TTL 90 s; fails open. Staleness is safe: writes always revalidate. Benchmark (`availability-cache.int.test.ts`): month view, 10 staff, 3 resource types, 120 bookings → p95 ≈ 60 ms cold, ≈ 16 ms warm over HTTP (local stack, 2026-11-03).

## Slot computation
`packages/domain/src/booking/availability.ts` → `computeSlots(input)` / `findSlot(input, start, staffId)`.
Per salon-local date: salon hours (or holiday / special hours) ∩ staff schedule (effective-dated) − breaks − time off − busy occupancy; candidate starts on the `slot_granularity_minutes` grid (DST: gap minutes skipped, overlap minutes offered twice); the whole occupancy (buffers included) must fit; `now + min_lead_time` and `booking_window_days` apply unless overridden (`hours`, `lead_time`, `horizon`). "Any staff" order: least booked minutes that day → `sort_order` → id. Window ≤ 31 days, checked in O(1) before any allocation. Time zones via `Intl` only (`tz.ts`).
Inputs are loaded by `apps/api/src/modules/bookings/infra/booking-inputs.ts` in ~6 batched queries.

## Write path
`CreateBookingCommand`: idempotency claim (first statement) → resolve service/variant/add-ons + per-staff terms (staff override → variant → service) → candidate staff (own calendar for `.own` members; `hide_staff_choice` for customers) → staff locks → phone lock + per-phone active limit (customers) → drop expired holds → caller's hold (if valid) → `findSlot` → draft policy → insert booking, line, add-ons, history, occupancy (or convert hold in place), outbox, audit for overrides → store idempotent response. Lifecycle: `BookingLifecycleCommands.transition` (optimistic `version`, deactivate occupancy when released, revoke manage link on cancel) and `.reschedule` (snapshot terms, eligible staff only, delete + reinsert occupancy, rotate the customer's link when they move it).

## State machine
`packages/domain/src/booking/state-machine.ts` (table in spec §3.7): check-in from start − 60 min; complete from start; no-show from start + 15 min; customer cancel until `cancellation_cutoff_minutes`, salon-recorded customer cancel until start (late flag inside cutoff); `checked_in → cancelled_by_salon` needs a reason; owner/manager corrections `no_show ↔ completed` within 48 h with reason (audited). Pending expiry: system → `cancelled_by_salon`, reason code `pending_expired`.

## Rules & settings
Read from topic 07's `salon_settings` (missing row = defaults): `booking_window_days` 60, `min_lead_time_minutes` 60, `cancellation_cutoff_minutes` 120, `reschedule_cutoff_minutes` 120, `confirmation_mode` auto, `manual_confirm_window_hours` 12, `confirm_new_clients` false, `hide_staff_choice` false, `max_active_bookings_per_phone` 3, `slot_granularity_minutes` 15, `hold_ttl_minutes` 7. Rule overrides need `bookings.override_rules` (owner, manager, receptionist) + reason.

## API
CRM (`/api/v1/salons/:salonId`, gate `schedules.read`, then `bookings.read|write` or `.own` scope): `GET availability`, `GET bookings?from&to`, `GET bookings/:id`, `POST bookings`, `POST bookings/:id/transitions`, `POST bookings/:id/reschedule`.
Public — **unrouted (X23)**, kept for later (`/api/v1/public`, live salons only, rate-limited per device/IP/phone): `GET salons/:slug/availability`, `POST salons/:slug/holds`, `POST salons/:slug/bookings` (returns `manageToken`), `GET bookings/:token`, `POST bookings/:token/cancel`, `POST bookings/:token/reschedule`.
All booking POSTs except holds require `Idempotency-Key`. Error codes: `BOOKING_ERRORS` in `packages/contracts/src/booking/errors.ts`.

## Outbox relay (04-S5 part, built with 06)
`infrastructure/outbox/`: `OutboxRelay.publishPending()` claims unpublished `outbox_events` rows (`FOR UPDATE SKIP LOCKED`), enqueues one `outbox.event` job per row on the `outbox` queue (`jobId` = event id) and marks them published. Booking commands call `kick()` right after commit; a scheduler relays every 5 s as the safety net. `jobs/outbox.processor.ts` dispatches each event to the `DOMAIN_EVENT_HANDLERS` registered in `jobs/jobs.module.ts` (today: `zalo.booking_updates`). Delivery is at-least-once and a failure re-runs all handlers of that event — handlers MUST be idempotent.

## Rule overrides in the CRM (q18)
`GET /salons/:id/booking-check?serviceId&staffId&startsAt[&bookingId]` → `{ bookable, requiredOverrides, blocked, canOverride }` (`requiredOverrides()` in the domain: smallest set of `hours` / `lead_time` / `horizon` that makes the start bookable; `blocked` when nothing helps). Create/reschedule by salon members return `409 booking.override_required` with `errors: [{ path: "overrides", code }]` when overrides would help; real conflicts stay `409 booking.slot_taken`. Customers and the Zalo bot only ever see `slot_taken`.

## Account deletion (q71)
`BookingAnonymiser.anonymiseCustomer({ userId, phoneE164 })` (bookings facade, for the privacy job of topic 05): cancels upcoming pending/confirmed bookings as `cancelled_by_customer` (actor `system`, reason code `account_deleted`), then replaces the contact snapshot of every matching booking (account link or phone) with a placeholder and sets `customer_anonymised_at`; the read model exposes `customerAnonymised`. Idempotent. Not covered: free-text reasons in the append-only status history, Zalo conversations, salon client profiles.

## Events (outbox)
`booking.created` {bookingId, status, source, staffId, startsAt}, `booking.status_changed` {bookingId, from, to, lateCancellation, actorType}, `booking.rescheduled` {bookingId, fromStartsAt, toStartsAt, fromStaffId, toStaffId, actorType}. Relay: 04-S5 (not built).

## AI-agent tools
Not implemented (M6.9). Spec §9.

## File map
- `packages/domain/src/booking/` — intervals, tz, availability, terms, state machine, draft policy, policy (+ unit/property tests).
- `packages/contracts/src/booking/` — schemas, `BookingSource`, `BOOKING_ERRORS`.
- `apps/api/src/modules/bookings/` — `infra/` (inputs loader, occupancy SQL, idempotency, secrets), `application/` (create, lifecycle, holds, queries, maintenance, actors), `http/` (CRM + public controllers, rate limits).
- `apps/api/src/jobs/maintenance.processor.ts` — `booking.sweep` every minute.
- Tests: `apps/api/src/modules/bookings/bookings.int.test.ts` (incl. 20-way concurrency harness), `apps/api/test/factories/booking.ts`.

## Re-enabling the public booking surface (preconditions)
The public controller is unrouted (X23). Before it is ever registered again:
1. A Vietnamese legal review allows a customer-facing booking surface (roadmap X23).
2. Manage tokens leave the URL path: send them in an `X-Manage-Token` header (added to
   `REDACT_PATHS`) or in a POST body; `/public/bookings/:token` routes are removed.
3. Every page that carries a token sends `Referrer-Policy: no-referrer`.
4. Turnstile (or equivalent) bot check on guest holds/bookings.
Already in place as defence in depth: the pino `req` serializer redacts `/public/bookings/<token>`
segments from logged URLs (`infrastructure/logger/redaction.ts`, tested).

## Edge-case audit: resources × overrides (2026-11-03)
Covered by `apps/api/src/modules/bookings/edge-cases.int.test.ts` (E1–E7):
- **E1** An after-hours override never lifts resource needs: the unit is still claimed, and a busy unit is a conflict (`slot_taken`, check `blocked`), never `override_required`.
- **E2** Overrides a caller sends but doesn't need are dropped; only the minimal needed set (from the ones sent) is stored in `rule_overrides` and audited. **Fixed in this audit:** before, every sent override was recorded and audited.
- **E3** A reschedule may overlap the booking's own old interval on a single unit (its own claims are excluded and replaced).
- **E4** A reschedule outside hours returns `override_required`; with the override it is stored and audited as `booking.rules_overridden`.
- **E5** A hold claims staff and units; booking from the hold converts both claims in place (no gap for another writer).
- **E6** Recording a walk-in earlier today needs `hours` + `lead_time` (check endpoint lists both).
- **E7** A resource requirement added after a booking applies when that booking is rescheduled (current requirements, snapshot price/duration). Pausing, shrinking or deleting a resource whose units hold future claims (bookings or unexpired holds) returns `409 resource.in_use`.
Known gaps (by design or later): the `staff_service_assignment` override from the spec isn't implemented (staff must be assigned); `hours` override ignores the staff schedule completely (breaks and time off still apply); free-text status-history reasons are not anonymised (append-only).

## Load test (2026-11-03)
`pnpm --filter @gugu/api test:load` (`booking-writes.load.int.test.ts`, in-process HTTP, local stack, pool 10):
| Scenario | Result | Latency (local) |
|---|---|---|
| A — 50 creates, 5 staff × 5 times, each pair contested twice | exactly 25 × 201, 25 × `slot_taken`, 0 × 5xx, no overlaps | p95 ≈ 0.35–0.54 s (all 50 in flight at once) |
| B — 50 any-staff creates at 5 times, 2-unit bed required | 6–8 winners depending on race order through an overlap chain; bed limit never exceeded | p95 ≈ 0.55–0.73 s |
| C — 25 reschedules of 10 bookings racing 25 creates for 3 slots | each booking keeps exactly one active claim; no overlaps, no 5xx, no deadlocks | p95 ≈ 0.2–0.25 s |
Latency is queueing under the per-target advisory locks with the default pool (10); no deadlock (`40P01`) or 5xx was seen in repeated runs.

## Known limitations
- Multi-service chains (M6.8) are on for every salon (q91; `BOOKING_MULTI_SERVICE=false` switches them off); holds and the public page stay single-service. Very large salons (> ~40 staff) may get `truncated` chain results on month-long ranges.
- Resources/capacity units, availability cache, waitlist, recurring, group bookings, deposits not implemented.
- `409 slot_taken` carries no alternative slots yet; clients refetch availability.
- Public page has no bot check yet (Turnstile); rate limits and per-phone limit only.
