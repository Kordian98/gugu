---
name: booking-engine
description: Rules and procedures for GuGu's booking engine — availability/slot generation, holds, booking creation, reschedule/cancel, status state machine, occupancy exclusion constraints, capacity units, buffers, timezones. Use whenever editing apps/api/src/modules/{availability,bookings,booking-engine}, packages/domain/booking, or migrations touching booking_occupancy.
---

# Booking engine

Spec: `docs/tasks/06-booking-engine.md`. Domain doc: `docs/domains/booking-engine.md`.

## When to use
Any change to slot computation, booking writes, statuses, schedules as consumed by the engine, resources/capacity, booking settings, or booking tools exposed to the AI agent.

## Invariants
- MUST: every staff/resource-unit time occupation is a row in `booking_occupancy` with a half-open `tstzrange` `[start − buffer_before, end + buffer_after)`.
- MUST: exclusion constraints `(staff_id =, range &&) WHERE active` and `(resource_unit_id =, range &&) WHERE active` exist. They are the final guard; never drop, never bypass.
- MUST: capacity N = N `resource_unit` rows; never count-based capacity checks without units.
- MUST: booking writes run in one transaction: idempotency check → sorted advisory locks (staff-day, then customer) → delete overlapping expired holds → revalidate with `computeSlots` → insert booking + snapshots + occupancy + status history + outbox event.
- MUST: map Postgres `23P01` to `409 SLOT_TAKEN` with alternative slots.
- MUST: all timestamps UTC in DB; schedules are local wall-clock + salon IANA tz, converted via core tz helpers only.
- MUST: status changes only via the state machine in `packages/domain/booking/state-machine.ts`; each writes `booking_status_history` and a `domain_event`.
- MUST: `Idempotency-Key` required on create/reschedule/transition endpoints.
- MUST NOT: let `ai_agent` or `zalo` sources create anything but drafts + holds.
- MUST NOT: overlap is overridable by any role. Only rule overrides (hours, lead time, horizon, assignment) with `booking.override_rules` + reason + audit.
- MUST NOT: change snapshots (`booking_service` price/duration/name) after creation.
- MUST NOT: import Nest, Prisma, or I/O in `booking-engine/core`.

## Procedures

### Add a new availability rule (e.g. "max 8 bookings per staff per day")
1. Add the setting to the salon settings schema (Zod in `packages/validation`, column via 04's migration process).
2. Implement as a pure filter in `booking-engine/core/rules/<rule>.ts` taking loaded inputs, returning removed candidates with a reason code.
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
3. Add outbox event name and notify 11 (notifications) and 12 (attribution/commission) owners.
4. Tests: allowed, disallowed per actor, history row, occupancy `active` effect.

### Add an AI-agent booking tool
1. Define Zod input/output in the agent-tools package; permission + tenant scope required.
2. Writes return drafts/holds only; confirmation stays a UI action.
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
13. `ai_agent`/`zalo` sources cannot create `confirmed` bookings.

## Before PR checklist
- [ ] Core stays pure; no N+1 in loaders (2–4 queries per availability request).
- [ ] Concurrency test run against real Postgres (Testcontainers).
- [ ] OpenAPI + domain doc updated; error codes documented.
- [ ] `availability_version` bumped on every occupancy/schedule-affecting write.
- [ ] No hardcoded user-facing strings in error payloads (use codes; client localizes).
