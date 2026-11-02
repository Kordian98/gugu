# Booking engine (domain doc)

Durable reference for how GuGu computes availability and creates bookings without double-booking. Read this before touching `packages/domain/src/booking` or `apps/api/src/modules/bookings`. Spec and rationale: `docs/tasks/06-booking-engine.md`. Procedures: `.claude/skills/booking-engine/SKILL.md`.


## Status
M6.1–M6.5 implemented on `booking/06-core` (2026-11-03): pure slot engine, occupancy schema with
EXCLUDE constraint, create/transition/reschedule with idempotency + history + outbox, holds with
TTL + sweeper, CRM APIs. The public salon booking page and guest manage links exist in code
(`http/public-booking.controller.ts`) but are **not routed** (roadmap X23: no customer-facing booking
surface on gugu.vn until a legal review); tests mount the controller to keep customer paths covered. **Not implemented yet:** resources/capacity units
(M6.6), availability cache (M6.7), multi-service (M6.8), AI-agent drafts (M6.9), outbox relay
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
`bookings` (status, source = `BookingSource`, contact snapshot + `customer_phone_hash`, `identity_verified`, totals, `late_cancellation`, `rule_overrides`, `manage_token_hash/expires_at`, `pending_expires_at`, `version`), `booking_services` (1 per booking, snapshots, `CHECK sequence = 1`), `booking_service_addons`, `booking_holds` (device hash, TTL), `booking_occupancy` (kind booking|hold, `period tstzrange`, `active`), `booking_status_history`, `idempotency_keys`, `outbox_events`. Raw objects: `booking_occupancy_no_staff_overlap`, `booking_occupancy_valid`, `bookings_valid`, `booking_services_valid`, `booking_status_history_no_update_delete`, `outbox_events_unpublished`.

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

## Known limitations
- One service per appointment (+ variant + add-ons); multi-service Phase B/C not implemented.
- Resources/capacity units, availability cache, waitlist, recurring, group bookings, deposits not implemented.
- `409 slot_taken` carries no alternative slots yet; clients refetch availability.
- Public page has no bot check yet (Turnstile); rate limits and per-phone limit only.
