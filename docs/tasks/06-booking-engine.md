# 06 — Booking engine

**Slug:** `booking-engine` · **Master prompt:** §11 Booking flow, §12 Booking engine · **Owner agent:** `.claude/agents/booking-engine.md` · **Skill:** `.claude/skills/booking-engine/SKILL.md` · **Domain doc:** `docs/domains/booking-engine.md`

The booking engine decides which appointment times are offered and guarantees that no staff member, room, or capacity unit is ever double-booked. It is a backend-only domain. Every booking source (marketplace, CRM manual entry, walk-in, Zalo, product AI agent) goes through the same engine and the same transaction.

---

## 1. Scope

### In
- Availability computation (slot generation) for one or more services, a specific staff member or "any staff", over a date range.
- Temporary holds with TTL while the customer is in the review step.
- Atomic booking creation with in-transaction revalidation and DB-level overlap protection.
- Booking status state machine, transition rules per actor, status history.
- Reschedule and cancellation semantics (customer and salon side), policy windows.
- Multi-service appointments (phased, behind a feature flag).
- Resources (rooms, chairs, beds, equipment) with capacity.
- Buffers, lead time, booking horizon, slot grid.
- Timezone handling (UTC storage, salon-local wall-clock rules, DST-safe).
- Idempotent writes, transactional outbox for domain events.
- Engine-level test suite (unit, property-based, concurrency integration).

### Out (owned elsewhere)
- Schedule/hours/time-off CRUD screens and APIs → 07 (engine only reads them; schema shape agreed with 04).
- Notifications and reminders → 11 (engine emits events via outbox).
- Attribution and commission → 12 (engine writes `source`; 12 derives attribution).
- Zalo message parsing → 09 (calls engine API like any client).
- AI conversation handling → 08 (calls engine tools listed in §9).
- Online payment, deposits → not in MVP (architecture leaves a `deposit_required` policy hook unused).
- Waitlist, recurring appointments, group classes → later (noted in §8).

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Use database-level mechanisms whenever technically appropriate" — not specified. | PostgreSQL `EXCLUDE USING gist` on an occupancy table (`btree_gist` extension), written as raw SQL migration (Prisma cannot express it; coordinate with 04). |
| G2 | Exclusion constraints can only enforce capacity = 1. Prompt asks for "multiple bookings per slot where capacity permits". | Model capacity as **units**: a resource with capacity N has N `resource_unit` rows; each occupancy row targets one unit. Exclusion stays capacity-1 per unit. The engine picks a free unit. |
| G3 | Constraint cannot reference booking status in another table. | Denormalize `active boolean` onto occupancy rows; constraint is partial `WHERE (active)`. Status transitions to cancelled/no_show set `active=false` in the same transaction. |
| G4 | Holds: "pending bookings and temporary holds" undefined. | Holds are occupancy rows (`kind='hold'`, `expires_at`). Expired holds overlapping a new write are deleted inside the write transaction before insert; a BullMQ sweeper removes the rest every minute. Default TTL 7 min, configurable per salon (3–15). |
| G5 | Does `pending` block the slot? | Yes. `pending` and `confirmed`, `checked_in` occupy time. `completed`/`cancelled_*`/`no_show` release future time (completed keeps history but `active=false` once end passes is irrelevant; we keep `active=true` for completed so the past calendar stays truthful — exclusion over past ranges is harmless). |
| G6 | Who confirms? Auto vs manual confirmation unspecified. | Salon setting `confirmation_mode`: `auto` (default; created as `confirmed`) or `manual` (created as `pending`, salon must confirm within `pending_ttl`, default 12 h, else auto-cancel with reason `expired`). |
| G7 | No status for expired pending / reschedule. | No new statuses. Expiry = `cancelled_by_salon` with `reason_code='pending_expired'` and actor `system`. Reschedule is an in-place time change recorded as a `booking_event` (type `rescheduled`), not a status. |
| G8 | Buffers: whether they may cross closing time or overlap breaks. | Occupied range = `[start − buffer_before, end + buffer_after)`. The whole occupied range must fit inside the staff working interval (conservative MVP). Salon setting `allow_buffer_outside_hours` later. |
| G9 | Slot grid not defined. | Salon setting `slot_interval_minutes` ∈ {5,10,15,20,30,60}, default 15. Candidate starts are aligned to the grid in salon-local time. |
| G10 | Lead time / horizon / cancellation window missing. | Settings: `min_lead_minutes` (default 60), `max_horizon_days` (default 60), `customer_cancel_cutoff_minutes` (default 120), `customer_reschedule_cutoff_minutes` (default 120), `max_active_bookings_per_customer` (default 3 per salon). |
| G11 | "Any available staff" assignment rule absent. | Strategy setting: `least_booked_that_day` (default) → `staff sort_order`. Customer never sees which staff before confirmation when choosing "any"; confirmation shows assigned staff. |
| G12 | Multi-service: "only when engine can correctly calculate" — no definition. | Phase A: single service + variant. Phase B: multiple services, same staff, back-to-back (buffers between services = max(after_prev, before_next)). Phase C: different staff per service, still back-to-back, optional gap ≤ 15 min. Each phase behind feature flag `booking.multiService` with its own test suite. |
| G13 | Staff-specific price/duration (§9) not linked to engine. | Effective duration/price resolution order: `staff_service` override → `service_variant` → `service`. Resolution happens server-side; snapshot stored in `booking_service`. |
| G14 | Idempotency not mentioned; mobile networks in VN retry often. | `Idempotency-Key` header mandatory on all booking writes; stored 24 h with request hash and response; same key + different hash → 422. |
| G15 | Manual CRM bookings may need to break rules (walk-in after hours). | Rule overrides (`hours`, `lead_time`, `horizon`, `staff_service_assignment`) allowed with permission `booking.override_rules` + reason, audited. **Overlap is never overridable.** |
| G16 | Timestamps "UTC" but schedules are wall-clock. | Schedules stored as local `time` + weekday + salon IANA tz; converted per concrete date with a tz library (Temporal polyfill or Luxon). DST: non-existent local times skipped, ambiguous times use the earlier offset. VN has no DST; tests use `Europe/Warsaw` and `America/New_York` fixtures. |
| G17 | Concurrency only "use transactions" — insufficient for rules that are not overlap (customer max active, daily limits). | Per-staff-day advisory locks (`pg_advisory_xact_lock`) taken in sorted order before revalidation; exclusion constraint remains the final guard. Customer-level rules locked by `(salon_id, customer_id)` advisory key. |
| G18 | Events to notifications could be lost if published outside transaction. | Transactional outbox table `domain_event`; relay worker publishes to BullMQ. |
| G19 | Availability performance not addressed. | Redis cache per `(salon, local_date, query-hash)` with salon `availability_version` counter bumped on any occupancy/schedule change; TTL 60 s. Cache is advisory — writes always revalidate. |
| G20 | Booking via AI agent / Zalo could create bookings without the customer. | Non-customer-initiated channels create **drafts + holds**; a human (customer via link or staff in CRM) confirms. See §9. |

---

## 3. Refined requirements

### 3.1 Inputs the engine reads (schema owned by 04, CRUD by 07)
- `salon` (timezone, settings above), `salon_opening_hours` (weekday, local open/close, multiple intervals allowed), `salon_special_hours` (date, intervals or closed), `salon_holiday`.
- `staff_profile` (active, bookable), `staff_schedule` (weekday or date-specific intervals, effective_from/to), `staff_break`, `staff_time_off` (UTC range).
- `service`, `service_variant` (duration, buffer_before, buffer_after, price, price_max), `staff_service` (assignment + optional overrides), `service_resource_requirement` (service → resource type, quantity).
- `resource`, `resource_unit`.
- `booking_occupancy` (engine-owned, see 3.4).

### 3.2 Availability query
`GET /api/v1/salons/{salonId}/availability`
- Params: `items[]` (serviceId, variantId?, staffId? | "any"), `from`, `to` (local dates, max 14-day window), `locale`.
- Response: per local date, list of slots `{ startUtc, startLocal, endLocal, staffOptions: [staffId…] | hidden, resourcePlanFeasible: true }`.
- Must exclude: past + lead time, beyond horizon, salon closed/holiday, staff off/break/time-off, existing active occupancy (bookings + unexpired holds) incl. buffers, missing resource units, inactive services/staff, staff not assigned.
- Public endpoint; rate-limited; no PII; staff names only if staff are public.

### 3.3 Algorithm (per staff candidate)
1. Build salon open intervals for the date (regular ∩ special, − holidays) in UTC.
2. Intersect with staff working intervals; subtract breaks, time off.
3. Subtract staff occupancy ranges (already include buffers).
4. For the requested service chain compute total occupied length `L = before₁ + Σdurations + Σinter-buffers + after_n`.
5. Candidate start `s` on the grid such that `[s − before₁, s − before₁ + L)` ⊂ free interval and `s ≥ now + lead`.
6. For each candidate check resource feasibility: for every required resource type, a free unit exists for the relevant sub-range.
7. "Any staff": union over staff; keep staff list per slot for assignment at write time.
Pure function core: `computeSlots(input: AvailabilityInput): Slot[]` with no I/O — all data loaded by a repository layer in 2–4 batched queries per request (no N+1).

### 3.4 Occupancy model
`booking_occupancy(id, salon_id, booking_id?, hold_id?, kind ['booking','hold'], staff_id?, resource_unit_id?, range tstzrange, active bool, expires_at?)`
- Exactly one of `staff_id`, `resource_unit_id` set per row; a booking service generates one staff row + one row per resource unit.
- Constraints:
  - `EXCLUDE USING gist (staff_id WITH =, range WITH &&) WHERE (active AND staff_id IS NOT NULL)`
  - `EXCLUDE USING gist (resource_unit_id WITH =, range WITH &&) WHERE (active AND resource_unit_id IS NOT NULL)`
  - `CHECK (lower(range) < upper(range))`, `CHECK (kind='hold') = (expires_at IS NOT NULL)`.
- Ranges are half-open `[)` so back-to-back bookings do not conflict.

### 3.5 Holds
- `POST /api/v1/holds` → creates occupancy rows `kind='hold'`, returns `holdId`, `expiresAt`. Max 1 active hold per customer/device per salon (new hold replaces old).
- Created when the customer reaches the review step (step 9); booking creation converts hold rows to booking rows in place (same range, `kind='booking'`, `expires_at=null`).
- If the hold expired, creation falls back to full revalidation; succeeds if still free.

### 3.6 Booking creation transaction (all sources)
1. Validate request (Zod), auth (verified phone for customers), permission for staff actors.
2. Check idempotency key.
3. `BEGIN` (READ COMMITTED).
4. Take advisory locks: sorted `(staff_id, local_date)` keys, then `(salon_id, customer_id)`.
5. Delete expired holds overlapping target ranges.
6. Reload inputs, re-run `computeSlots` for the exact requested start (revalidation), resolve staff for "any", pick resource units.
7. Insert `booking`, `booking_service` (snapshots: name vi/en, price, price_max, duration, buffers, staff_id, variant), occupancy rows (or convert hold).
8. Insert `booking_status_history` (null → initial), `domain_event` (`booking.created`).
9. `COMMIT`. On exclusion violation (`23P01`) → return `409 SLOT_TAKEN` with fresh alternative slots (≤ 5 nearest).

### 3.7 State machine

| From \ To | pending | confirmed | checked_in | completed | cancelled_by_customer | cancelled_by_salon | no_show |
|---|---|---|---|---|---|---|---|
| (new) | system (manual mode) | system (auto mode), staff | staff (walk-in) | — | — | — | — |
| pending | — | salon | — | — | customer | salon, system (expiry) | — |
| confirmed | — | — | salon (from start − 60 min) | salon (after start) | customer (before cutoff) | salon | salon (after start + grace 15 min) |
| checked_in | — | — | — | salon | — | salon (reason required) | — |
| completed | — | — | — | — | — | — | — |
| cancelled_* / no_show | — | — | — | — | — | — | — |

- "salon" = roles with `booking.manage` (owner, manager, receptionist; staff only for own bookings if permitted).
- Correction path: `no_show → completed` and `completed → no_show` allowed for owner/manager within 48 h, reason required, audited (real salons mis-click).
- Terminal statuses set `active=false` on future occupancy (cancelled, no_show); completed keeps rows.
- Every transition writes `booking_status_history(booking_id, from, to, actor_type [customer|salon_member|system|ai_agent], actor_id, reason_code, reason_text, at)` and an outbox event.
- Transition definition lives in `packages/domain/booking/state-machine.ts` (shared so UI can show allowed actions); backend is authoritative.
- Customer cancel after cutoff → rejected with `CANCEL_WINDOW_PASSED` (salon can still cancel); flag `late_cancellation` recorded for reliability metrics (12).

### 3.8 Reschedule
- `POST /api/v1/bookings/{id}/reschedule` with new start (and optionally staff). Same booking id.
- One transaction: lock old and new staff-days, deactivate/delete old occupancy, revalidate and insert new occupancy, update times, write `booking_event(rescheduled, old, new, actor)`, outbox `booking.rescheduled`.
- Allowed for statuses pending/confirmed. Customer subject to reschedule cutoff; salon anytime before start.
- Price/duration snapshot unchanged unless services change (service change = cancel + new booking in MVP).

### 3.9 Sources
`booking.source` enum: `marketplace`, `salon_profile`, `direct_link`, `qr_code`, `crm_manual`, `walk_in`, `phone`, `zalo`, `ai_agent`. `created_by_actor_type` separately. Attribution semantics → 12.

### 3.10 Idempotency
Table `idempotency_key(key, actor_id, route, request_hash, response_status, response_body, created_at)`; unique `(actor_id, key)`; TTL 24 h purge job.

---

## 4. Proposed technical approach
- **Module layout** (`apps/api/src/modules/`): `availability` (read side) and `bookings` (write side), sharing `booking-engine/core` — pure TS, no Nest/Prisma imports, 100% unit-testable.
- **Data access:** Prisma for normal CRUD; occupancy inserts/locks via `$queryRaw` inside `$transaction`. Exclusion constraints, `btree_gist`, `tstzrange` columns as raw SQL migrations (Prisma `Unsupported("tstzrange")`).
- **Time:** Temporal API via `@js-temporal/polyfill` (or Luxon if 01 standardizes on it) only inside the core; everything else passes UTC `Date` + tz string.
- **Why exclusion constraint + advisory locks:** constraint gives a hard guarantee regardless of code bugs; advisory locks serialize rule checks that constraints cannot express, without SERIALIZABLE retry storms.
- **Why units for capacity:** keeps every guarantee in the DB; capacity rarely exceeds ~10 so row count is trivial.
- **Cache:** Redis, versioned keys, invalidated through `availability_version` bump in the same transaction (read after commit).
- **Events:** outbox → BullMQ relay (shared infra with 11).

---

## 5. Acceptance criteria
1. 100 concurrent create requests for the same staff/time produce exactly 1 booking and 99 `409 SLOT_TAKEN` (integration test against real Postgres).
2. Two overlapping bookings for different staff in the same salon both succeed; back-to-back `[10:00,10:30)` and `[10:30,11:00)` succeed.
3. Resource with capacity 2 accepts exactly 2 overlapping bookings; the 3rd fails.
4. Buffers: service 30 min + 10 min after-buffer blocks next start until 10:40 on a 5-min grid.
5. Slots never returned inside breaks, time off, holidays, special-closed days, before lead time, beyond horizon.
6. Expired hold does not block a new booking; unexpired hold blocks others but not its owner.
7. Every status change has a history row with actor and timestamp; disallowed transitions return `409 INVALID_TRANSITION`.
8. Reschedule is atomic: on failure the original slot is untouched.
9. Repeating a create with the same `Idempotency-Key` returns the original response and creates no duplicate.
10. Changing a service price after booking does not change the booking snapshot.
11. DST fixtures: in `Europe/Warsaw`, 02:30 on spring-forward day is never offered; fall-back day offers correct number of slots.
12. Availability endpoint p95 < 150 ms for a 10-staff salon, 7-day window, warm cache; < 400 ms cold (local benchmark).
13. Property-based test: for random schedules and booking sequences, no two active occupancy rows of the same staff/unit overlap and every returned slot is bookable.
14. Agent/Zalo sources cannot produce a `confirmed` booking without a human confirmation step.

---

## 6. Dependencies
- **01** monorepo, `packages/domain`, time library choice.
- **04** schema (occupancy table, raw SQL migrations, outbox, idempotency tables).
- **05** actor identity, permissions (`booking.manage`, `booking.override_rules`), tenant scoping.
- **07** schedule/hours/resource CRUD, calendar UI consuming engine APIs.
- **10** customer booking flow UI; **11** notifications consuming outbox events.
- **08**, **09** consume engine via tools/API; **12** reads `source`, statuses, late-cancel/no-show flags.
- **13** Testcontainers Postgres in CI for concurrency tests.

---

## 7. Suggested sub-milestones
1. **M6.1 Core math** — interval algebra, tz conversion, `computeSlots` single service/single staff; unit + property tests.
2. **M6.2 Occupancy schema** — raw SQL migration, exclusion constraints, concurrency integration test harness.
3. **M6.3 Create + state machine** — transaction, idempotency, history, outbox, "any staff".
4. **M6.4 Holds** — hold API, TTL, sweeper.
5. **M6.5 Reschedule/cancel** — policy windows, corrections.
6. **M6.6 Resources & capacity units.**
7. **M6.7 Availability API + cache + perf benchmark.**
8. **M6.8 Multi-service Phase B** (flagged), later Phase C.
9. **M6.9 Agent/Zalo draft flow** (with 08/09).

---

## 8. Later (documented, not implemented)
Waitlist, recurring appointments, group/class bookings, deposits, per-staff slot intervals, buffers outside hours, overbooking tolerance, travel/home-service bookings.

---

## 9. Product AI-agent surface
All tools tenant-scoped to the caller's salon; customer-supplied text in results is marked untrusted.

| Tool | Kind | Permission | Notes |
|---|---|---|---|
| `find_available_slots` | read | `booking.view` | Same input as availability API; returns ≤ 20 slots. |
| `get_booking` / `list_bookings` | read | `booking.view` | Filters: date range, staff, status, source. Staff role sees own only. |
| `get_booking_stats` | read | `analytics.view` | Counts by status/source/day; shares read model with 07. |
| `create_booking_draft` | write (draft) | `booking.manage` | Creates hold + draft; **never confirms**. Returns preview card for human confirmation in CRM (or link to customer). |
| `confirm_booking_draft` | write | UI only | Not exposed to the model; button in CRM/customer link. |
| `propose_reschedule` | write (draft) | `booking.manage` | Returns options + draft; human confirms. |
| `propose_status_change` | write (draft) | `booking.manage` | e.g. mark no-show; human confirms. |

Zalo (09) uses the same draft pattern: customer receives a confirmation link / ZNS button.

---

## 10. AI-first deliverables
- `.claude/agents/booking-engine.md` — domain subagent (owns `apps/api/src/modules/{availability,bookings,booking-engine}`, `packages/domain/booking`).
- `.claude/skills/booking-engine/SKILL.md` — invariants, procedures, mandatory test list.
- `docs/domains/booking-engine.md` — durable doc, filled as code lands.
- ADRs to write at implementation: `adr/xxxx-occupancy-exclusion-constraints.md`, `adr/xxxx-capacity-units.md`, `adr/xxxx-holds-as-occupancy.md`.

---

## 11. Open questions for the product owner
1. Default confirmation mode: auto-confirm (recommended for conversion) or manual?
2. Pending TTL for manual mode — 12 h ok? What happens overnight?
3. Default customer cancellation cutoff (2 h?) and should late cancels be visible to salons as a customer reliability signal?
4. Max active bookings per customer per salon (3?) — anti-abuse vs. families booking for others.
5. Should customers book for someone else (name override) in MVP?
6. Is multi-service (Phase B) required for launch, or single service + variant enough?
7. Allow walk-in bookings that skip schedules entirely (receptionist override) — yes with audit?
8. "Any staff" — should salons be able to hide individual staff selection completely?
