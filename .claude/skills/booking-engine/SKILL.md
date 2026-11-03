---
name: booking-engine
description: Rules and procedures for GuGu's booking engine — availability/slot generation, holds, booking creation, reschedule/cancel, status state machine, occupancy exclusion constraints, capacity units, buffers, timezones. Use whenever editing apps/api/src/modules/{availability,bookings,booking-engine}, packages/domain/booking, packages/contracts/booking, or migrations touching booking_occupancy.
---

# Booking engine

Spec: `docs/tasks/06-booking-engine.md`. Domain doc: `docs/domains/booking-engine.md`.

## When to use
Any change to slot computation, booking writes, statuses, schedules as consumed by the engine, resources/capacity, booking settings, or booking tools exposed to the AI agent.

## Invariants
- MUST: every staff/resource-unit time occupation is a row in `booking_occupancy` with a half-open `tstzrange` `[start − buffer_before, end + buffer_after)`.
- MUST: exclusion constraints `(staff_id =, range &&) WHERE active` and `(resource_unit_id =, range &&) WHERE active` exist. They are the final guard; never drop, never bypass.
- MUST: capacity N = N `resource_unit` rows; never count-based capacity checks without units. Lock staff and unit targets together via `lockClaims` (one sorted list) before writing occupancy.
- MUST: booking writes run in one transaction: idempotency check → sorted advisory locks (staff-day, then customer) → delete overlapping expired holds → revalidate with `computeSlots` → insert booking + snapshots + occupancy + status history + outbox event.
- MUST: map Postgres `23P01` to `409 SLOT_TAKEN` with alternative slots.
- MUST: all timestamps UTC in DB; schedules are local wall-clock + salon IANA tz, converted via core tz helpers only.
- MUST: status changes only via the state machine in `packages/domain/booking/state-machine.ts`; each writes `booking_status_history` and a `domain_event`.
- MUST: `Idempotency-Key` required on create/reschedule/transition endpoints.
- MUST: draft vs confirmed is decided by `draft-policy.ts` (X9 + X11): AI agent → always draft; salon staff entry (`staff_created`, `walk_in`, `phone`, `zalo_chat`) → `confirmed`; customer self-service → normal booking **without OTP**, `pending` only if `confirmation_mode=manual` or the customer matches `require_confirmation_for` (first-time/unverified). Unverified phones are flagged `identity_verified=false`.
- MUST NOT: require OTP to hold or book.
- MUST: owner defaults (q13–q18, q66): `confirmation_mode` per salon (auto default, manual window 12 h); `require_confirmation_for=none` by default; cancel cutoff 2 h with late cancels recorded as reliability signal; 3 active bookings per phone per salon; no booking on behalf of others; one service per appointment + optional add-ons; `staff_selection` customer_choice|hidden; out-of-schedule bookings only with `booking.override_rules` + audit.
- MUST: on account deletion (q71) bookings are anonymised, never deleted; future ones cancelled with reason `account_deleted`. Confirmation suggestion threshold: 3 no-shows in 30 days (q69).
- MUST: effective length = duration + Σ add-on extra durations; add-ons snapshotted in `booking_service_addon`.
- MUST: multi-service chains (M6.8, ADR-0011) plan every line with `lineTiming` (same staff: gap max(after, before), rows touch; other staff: start at previous end); one occupancy row per staff/unit per line; lock the union of all lines' candidates + units in one sorted `lockClaims`; reschedule moves every line; single service = chain of one.
- MUST: own-calendar staff may read a chain where they do any line but write (cancel, reschedule, transition) only when they do every line (`ownsEveryLine`).
- MUST NOT: accept `nextServices` while `booking.multiService` is off (`422 booking.multi_service_disabled`).
- MUST: guest hold/booking paths run anti-abuse hooks — per-phone active limit under the `(salon_id, phone_hash)` lock, rate limits per device/IP/phone, web bot check (Turnstile).
- MUST NOT: send personal data to any LLM (X10), including staff names; agent tools return tokens (`booking_ref`, `customer_ref`, `staff_ref`) and aggregates only.
- MUST: `booking.source` uses `BookingSource` from `packages/contracts` (owned by topic 12); never add a local source list.
- MUST: pure logic lives in `packages/domain/booking`; schemas, types and error codes in `packages/contracts/booking`.
- MUST NOT: overlap is overridable by any role. Only rule overrides (hours, lead time, horizon, assignment) with `booking.override_rules` + reason + audit.
- MUST NOT: change snapshots (`booking_service` price/duration/name) after creation.
- MUST NOT: import Nest, Prisma, or I/O in `packages/domain/booking`.

## Procedures

### Add a new availability rule (e.g. "max 8 bookings per staff per day")
1. Add the setting to the salon settings schema (Zod in `packages/contracts`, column via the `prisma-migration` skill).
2. Implement as a pure filter in `packages/domain/booking/rules/<rule>.ts` taking loaded inputs, returning removed candidates with a reason code.
3. Register in the rule pipeline order (cheap → expensive).
4. If the rule depends on concurrent writes (counts), ensure the advisory lock in the write path covers the key it reads.
5. Unit tests: rule on/off, boundary values; add a property-test generator for the setting.
6. If overridable, add to the override list and audit reason codes.
7. Document in `docs/domains/booking-engine.md` → "Rules".

### Add a DB-level constraint
1. Write raw SQL migration (Prisma `migrate dev --create-only`, then edit SQL).
2. Prefer partial constraints `WHERE (active)` so history does not block.
3. Add an integration test that violates it and asserts the mapped API error.
4. Write an ADR if the constraint changes guarantees.

### Add a booking status or transition
1. Edit the transition table in `state-machine.ts` (from, to, allowed actor roles, preconditions, side effects on occupancy).
2. Update the transitions table in the spec and domain doc.
3. Add outbox event name and error codes in `packages/contracts/booking`; notify 11 (notifications) and 12 (attribution/commission) owners.
4. Tests: allowed, disallowed per actor, history row, occupancy `active` effect.

### Add a booking source
1. Request the value in topic 12's `BookingSource` enum (`packages/contracts`); do not add it here.
2. Classify it into an X9 actor class (AI agent / salon staff entry / customer self-service) in `draft-policy.ts` and extend test 13.

### Add an AI-agent booking tool
0. Load the `agent-tool` skill.
1. Define Zod input/output in the agent-tools package; permission + tenant scope required.
2. Writes return drafts/holds only; confirmation stays a UI action.
3. Outputs carry tokens and aggregates only — no names, phones, Zalo IDs, notes or review text; the model never supplies customer contact details.
3. Mark customer-supplied text fields as untrusted in the output schema.

## Mandatory test cases (must exist and pass)
1. 100 concurrent creates same staff/time → exactly 1 success.
2. Back-to-back half-open ranges both succeed.
3. Capacity-2 resource → 2 succeed, 3rd fails.
4. Buffers block following starts correctly on a 5-min grid.
5. No slots in breaks, time off, holidays, special closures, before lead time, beyond horizon.
6. Expired hold doesn't block; active hold blocks others, not its owner.
7. Invalid transition → `409 INVALID_TRANSITION`; valid ones write history.
8. Reschedule failure leaves original occupancy untouched.
9. Idempotent replay returns same response, no duplicate.
10. Snapshot unaffected by later price change.
11. DST fixtures (`Europe/Warsaw`, `America/New_York`) for spring-forward and fall-back days.
12. Property test: no overlapping active occupancy per staff/unit; every offered slot is bookable.
13. Draft policy matrix (X9 + X11): AI-agent bookings always drafts; staff entries `confirmed`; customer self-service without OTP succeeds with `identity_verified=false` — `confirmed` by default, `pending` under `confirmation_mode=manual` or each `require_confirmation_for` value (first_time, unverified, both); mismatched actor/source → `422 INVALID_ACTOR_SOURCE`.
13c. Multi-service: chain slot math (same/different staff, buffers, units per line, property test), whole-chain reschedule/cancel, own scope read vs write, race harness chains vs singles (`multi-service.int.test.ts`).
13b. Add-ons extend occupancy and are snapshotted; `staff_selection=hidden` rejects named staff (`422 STAFF_SELECTION_DISABLED`); audited out-of-schedule booking with permission, `403` without; `booking.confirmation_suggested` emitted on threshold, setting unchanged.
13a. Anti-abuse: per-phone active limit → `429 ACTIVE_LIMIT_REACHED` (incl. concurrent requests); rate limits → `429 RATE_LIMITED`; missing bot-check token on web guest path rejected.
14. Agent booking tools never return personal data (snapshot test on tool output schemas).

## Before PR checklist
- [ ] `roadmap-tracker` updated: milestone status/note, log entry, open decisions raised as questions.
- [ ] Core stays pure; no N+1 in loaders (2–4 queries per availability request).
- [ ] Concurrency test run against real Postgres (Testcontainers).
- [ ] OpenAPI + domain doc updated; error codes documented.
- [ ] `availability_version` bumped on every occupancy/schedule-affecting write.
- [ ] No hardcoded user-facing strings in error payloads (use codes; client localizes).
