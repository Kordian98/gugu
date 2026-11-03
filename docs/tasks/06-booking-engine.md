# 06 — Booking engine

**Slug:** `booking-engine` · **Master prompt:** §11 Booking flow, §12 Booking engine · **Owner agent:** `.claude/agents/booking-engine.md` · **Skill:** `.claude/skills/booking-engine/SKILL.md` · **Domain doc:** `docs/domains/booking-engine.md`

The booking engine decides which appointment times are offered and guarantees that no staff member, room, or capacity unit is ever double-booked. It is a backend-only domain. Every booking source (marketplace, CRM manual entry, walk-in, Zalo, product AI agent) goes through the same engine and the same transaction.

> Cross-topic resolutions applied (see `docs/tasks/00-roadmap.md`): **X2** Zalo transactional messages are *ZBS Template Message* (channel id `zalo_template`; "ZNS" only as a historical alias) · **X3** Zod schemas, inferred types and error codes live in `packages/contracts`; pure logic in `packages/domain` · **X4** capacity units · **X6** booking source is the single `BookingSource` enum owned by topic 12 · **X9 + X11** draft status depends on the actor, not the source; booking does **not** require OTP — only AI-agent bookings are always drafts (§3.9a, §3.11) · **X10** no personal data to any LLM, incl. staff names (§9) · **X12** no SMS; phone verification via email link or Zalo · **X13** GuGu is SaaS-first: salon-side (CRM) booking paths are first-class, marketplace is additive.
>
> **Owner answers applied (tracker, 2026-11-02):** q13 per-salon auto/manual, manual window 12 h · q66 instant by default, GuGu *suggests* confirmation after repeated no-shows · q14 2 h cutoff, late cancels are a reliability signal · q15 3 active bookings per phone per salon · q16 no booking on behalf of others · q17 one service per appointment at launch, combos = own services or **add-ons** (§3.12) · q18 reception may book outside the schedule (audited); salons may hide staff choice · q69 suggestion threshold = 3 no-shows from first-time/unverified phones in 30 days · q71 bookings stay, anonymised, after a customer deletes their account (§3.13).

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
- Attribution and commission → 12 (engine writes `source` using 12's `BookingSource` enum; 12 owns the enum and derives attribution).
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
| G6 | Who confirms? Auto vs manual confirmation unspecified. | Per-salon setting `confirmation_mode` (q13): `auto` (default; created as `confirmed`) or `manual` (created as `pending`, salon must confirm within `pending_ttl` = 12 h, else auto-cancel with reason `pending_expired`). Overnight: the 12 h window is wall-clock; CRM (07) surfaces pending items first on open. |
| G7 | No status for expired pending / reschedule. | No new statuses. Expiry = `cancelled_by_salon` with `reason_code='pending_expired'` and actor `system`. Reschedule is an in-place time change recorded as a `booking_event` (type `rescheduled`), not a status. |
| G8 | Buffers: whether they may cross closing time or overlap breaks. | Occupied range = `[start − buffer_before, end + buffer_after)`. The whole occupied range must fit inside the staff working interval (conservative MVP). Salon setting `allow_buffer_outside_hours` later. |
| G9 | Slot grid not defined. | Salon setting `slot_interval_minutes` ∈ {5,10,15,20,30,60}, default 15. Candidate starts are aligned to the grid in salon-local time. |
| G10 | Lead time / horizon / cancellation window missing. | Settings: `min_lead_minutes` (default 60), `max_horizon_days` (default 60), `customer_cancel_cutoff_minutes` (default 120, q14), `customer_reschedule_cutoff_minutes` (default 120), `max_active_bookings_per_phone` (3 per salon, q15, keyed on normalized E.164 phone, not account — X11). |
| G11 | "Any available staff" assignment rule absent. | Strategy setting: `least_booked_that_day` (default) → `staff sort_order`. Customer never sees which staff before confirmation when choosing "any"; confirmation shows assigned staff. Salon setting `staff_selection` (q18): `customer_choice` (default) or `hidden` — hidden means every customer booking is "any staff" and the staff picker is not shown. |
| G12 | Multi-service: "only when engine can correctly calculate" — no definition. | **Launch (q17): one service per appointment**, with optional variant and optional **add-ons** (§3.12). Combos are modelled by salons as their own services or as add-ons. Later: Phase B multiple services, same staff, back-to-back (buffers between services = max(after_prev, before_next)); Phase C different staff per service. Each later phase behind feature flag `booking.multiService` with its own test suite. |
| G13 | Staff-specific price/duration (§9) not linked to engine. | Effective duration/price resolution order: `staff_service` override → `service_variant` → `service`. Resolution happens server-side; snapshot stored in `booking_service`. |
| G14 | Idempotency not mentioned; mobile networks in VN retry often. | `Idempotency-Key` header mandatory on all booking writes; stored 24 h with request hash and response; same key + different hash → 422. |
| G15 | Manual CRM bookings may need to break rules (walk-in after hours). | Confirmed by owner (q18): reception may add bookings **outside the schedule**. Rule overrides (`hours`, `lead_time`, `horizon`, `staff_service_assignment`) allowed with permission `booking.override_rules` (owner, manager, receptionist by default) + reason, audited. **Overlap is never overridable.** |
| G16 | Timestamps "UTC" but schedules are wall-clock. | Schedules stored as local `time` + weekday + salon IANA tz; converted per concrete date with a tz library (Temporal polyfill or Luxon). DST: non-existent local times skipped, ambiguous times use the earlier offset. VN has no DST; tests use `Europe/Warsaw` and `America/New_York` fixtures. |
| G17 | Concurrency only "use transactions" — insufficient for rules that are not overlap (customer max active, daily limits). | Per-staff-day advisory locks (`pg_advisory_xact_lock`) taken in sorted order before revalidation; exclusion constraint remains the final guard. Customer-level rules locked by `(salon_id, phone_hash)` advisory key (phone, because booking needs no account/OTP — X11). |
| G18 | Events to notifications could be lost if published outside transaction. | Transactional outbox table `domain_event`; relay worker publishes to BullMQ. |
| G19 | Availability performance not addressed. | Redis cache per `(salon, local_date, query-hash)` with salon `availability_version` counter bumped on any occupancy/schedule change; TTL 60 s. Cache is advisory — writes always revalidate. |
| G20 | Booking via AI agent / Zalo could create bookings without the customer. | Draft status is decided by the **actor** (X9 + X11, §3.9a): AI agent → always draft; staff entry and customer self-service are normal bookings (no OTP required), flagged `identity_verified=false` when the phone is unverified; abuse handled by §3.11. |

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
4. Compute total occupied length `L = buffer_before + duration(variant) + Σ add-on extra durations + buffer_after` (launch: one service; later phases chain services).
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
- `POST /api/v1/holds` → creates occupancy rows `kind='hold'`, returns `holdId`, `expiresAt`. Max 1 active hold per device and per phone per salon (new hold replaces old). Guests can hold without an account or OTP; hold creation is rate-limited and bot-checked on web (§3.11).
- Created when the customer reaches the review step (step 9); booking creation converts hold rows to booking rows in place (same range, `kind='booking'`, `expires_at=null`).
- If the hold expired, creation falls back to full revalidation; succeeds if still free.

### 3.6 Booking creation transaction (all sources)
1. Validate request (Zod) incl. name + normalized phone (signed-in account optional; **no OTP required** — X11), anti-abuse checks (§3.11), permission for staff actors.
2. Check idempotency key.
3. `BEGIN` (READ COMMITTED).
4. Take advisory locks: sorted `(staff_id, local_date)` keys, then `(salon_id, phone_hash)`.
5. Delete expired holds overlapping target ranges.
6. Reload inputs, re-run `computeSlots` for the exact requested start (revalidation), resolve staff for "any", pick resource units.
7. Insert `booking`, `booking_service` (snapshots: name vi/en, price, price_max, duration, buffers, staff_id, variant), `booking_service_addon` (snapshots: add-on name vi/en, extra duration, extra price), occupancy rows (or convert hold).
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
- Customer cancel after cutoff → rejected with `CANCEL_WINDOW_PASSED` (salon can still cancel); flag `late_cancellation` recorded and counted as a reliability signal (q14) per `(salon, phone)` in CRM (07) and platform trust (12).

### 3.8 Reschedule
- `POST /api/v1/bookings/{id}/reschedule` with new start (and optionally staff). Same booking id.
- One transaction: lock old and new staff-days, deactivate/delete old occupancy, revalidate and insert new occupancy, update times, write `booking_event(rescheduled, old, new, actor)`, outbox `booking.rescheduled`.
- Allowed for statuses pending/confirmed. Customer subject to reschedule cutoff; salon anytime before start.
- Price/duration snapshot unchanged unless the service, variant or add-ons change; changing them re-runs availability for the new total length and re-snapshots (salon actors only; customers cancel + rebook).

### 3.9 Sources (X6)
`booking.source` uses the single `BookingSource` enum **owned by topic 12** and published from `packages/contracts` (the engine never defines its own list): `marketplace, salon_profile, direct_link, qr_code, social_media, repeat_customer, staff_created, walk_in, phone, zalo_chat, zalo_oa, zalo_link, zalo_mini_app, promoted_listing, gugu_campaign, ai_agent`. Mapping to `gugu_acquired` vs `salon_acquired` is 12's job.
- `created_by_actor_type` (`customer | salon_member | system | ai_agent`) is stored separately from `source`.
- CRM manual entry uses `staff_created` (or `walk_in` / `phone` when the receptionist picks the channel).
- Adding a source = change in 12's enum first; then classify it into one of the X9 actor classes below.

### 3.9a Draft vs confirmed (X9 as amended by X11 — see topic 09 table R4a)
The decision is made in `packages/domain/booking/draft-policy.ts` from `(created_by_actor_type, source, identity_verified, is_first_visit, salon.require_confirmation_for, salon.confirmation_mode)`; `source` alone never decides. **Booking never requires OTP.**

| Class | Actor / sources | Result |
|---|---|---|
| 1. AI agent | `created_by_actor_type = ai_agent` (source `ai_agent`) | **Always a draft** + hold. Confirmed only by a salon member (CRM) or the customer (link / ZBS Template Message button). |
| 2. Salon staff entry | `salon_member` with `booking.manage`; sources `staff_created`, `walk_in`, `phone`, `zalo_chat` | The staff entry **is** the confirmation: created `confirmed` regardless of `confirmation_mode`. `identity_verified = false` when the phone is not verified. |
| 3. Customer self-service | `customer`; sources `marketplace`, `salon_profile`, `direct_link`, `qr_code`, `zalo_link`, `zalo_oa` ("Đặt lịch" button), `zalo_mini_app`, … | **Normal booking**, no OTP. `identity_verified = false` unless the phone was already verified (signed-in account / earlier verification). Initial status: `pending` if `confirmation_mode = manual` **or** the customer matches `require_confirmation_for`; otherwise `confirmed`. |

Any combination not matching a class (e.g. `ai_agent` actor with a staff source) is rejected with `422 INVALID_ACTOR_SOURCE`.

Salon setting `require_confirmation_for` ∈ `none` | `first_time` | `unverified` | `first_time_or_unverified` (default `none` — owner answer q66). "First time" = no completed booking for this phone at this salon. The salon confirms such bookings like any manual-mode `pending` (same `pending_ttl`).
`identity_verified` becomes `true` later if the customer verifies the phone (e.g. taps the optional confirm link in the booking message, or signs in); this does not change status by itself.

### 3.11 Anti-abuse hooks (X11 — no OTP wall)
Engine-side hooks; limits configured centrally (05) with salon overrides where noted.
- **Per-phone active limit:** `max_active_bookings_per_phone` per salon (default 3), checked under the `(salon_id, phone_hash)` advisory lock → `429 ACTIVE_LIMIT_REACHED`.
- **Rate limits** (Redis, 05's limiter) on `POST /holds` and `POST /bookings`: per device id, per IP, per phone (e.g. 5 holds / 10 min, 3 bookings / hour per phone, global salon burst cap) → `429 RATE_LIMITED`.
- **Bot check on web** (Cloudflare Turnstile token) required for guest holds/bookings; native apps rely on device attestation later.
- **Reliability history per phone:** no-show and late-cancel counts per `(salon, phone)` exposed **only to that salon** in CRM (07) — cross-salon labels wait for legal sign-off (q68) and usable by `require_confirmation_for` rules later; platform-wide signals belong to 12 (trust).
- **Optional confirm link** in the booking message (email or Zalo — no SMS, X12): sets `customer_confirmed_at` and `identity_verified=true`; never required for the booking to stand.
- **Confirmation suggestion (q66):** `require_confirmation_for` defaults to `none`. When a salon accumulates repeated no-shows from first-time/unverified phones (decided, q69: 3 no-shows within 30 days; constant in central config), the engine emits `booking.confirmation_suggested`; CRM (07) shows a one-tap suggestion to switch to `first_time_or_unverified`. The engine never changes the setting by itself.
- **No booking on behalf of others (q16):** the booking contact (name + phone) is the person attending; no separate "guest name" field at launch. Salon staff entries are exempt (they enter the attending client).
- **Hold abuse:** max 1 active hold per device and per phone; hold TTL unchanged; repeated hold-without-book patterns emit `booking.hold_abuse_suspected` to 12.

### 3.10 Idempotency
Table `idempotency_key(key, actor_id, route, request_hash, response_status, response_body, created_at)`; unique `(actor_id, key)`; TTL 24 h purge job.

### 3.12 Service add-ons (q17)
Launch has one service per appointment; combos are either their own service or add-ons.
- `service_addon(id, salon_id, service_id, name LocalizedText, extra_duration_minutes ≥ 0, extra_price, extra_price_max?, active, sort_order)` — optional extras **per service** (e.g. "gel removal +15 min +50.000đ"). Schema in 04, CRUD UI in 07.
- Customer selects 0..n add-ons (each at most once) of the chosen service; staff can add/remove add-ons in CRM.
- Effective length = variant (or service) duration + Σ add-on extra durations; buffers stay those of the service/variant. Price = base + Σ extra prices (range if any `extra_price_max`).
- Add-ons are performed by the same staff in the same occupancy block; no separate staff or resource requirement at launch (later: optional `resource_requirement` per add-on).
- Snapshot per booking in `booking_service_addon`; later add-on edits never change history.
- Availability queries take `addonIds[]`; slots are computed for the full effective length.

### 3.13 Customer account deletion (q71)
Bookings are never deleted when a customer deletes their account: they stay for the salon's history, occupancy and metrics, **anonymised**. The privacy job (05/11) calls the engine's `anonymiseCustomerBookings(customerId)`: contact snapshot (name, phone, email) replaced by a placeholder, `phone_hash` cleared, `customer_id` detached, notes from the customer removed; times, services, add-on/price snapshots, statuses, status history (actor shown as "deleted customer") and source stay. Future active bookings are cancelled first (`cancelled_by_customer`, reason `account_deleted`) so salons are notified. Per-phone reliability counts for that phone are dropped.

---

## 4. Proposed technical approach
- **Shared packages (X3):** request/response Zod schemas, inferred types and error codes (`SLOT_TAKEN`, `INVALID_TRANSITION`, …) in `packages/contracts/booking`; pure logic (state machine, interval algebra, `computeSlots`) in `packages/domain/booking`. No separate validation or types package.
- **Module layout** (`apps/api/src/modules/`): `availability` (read side) and `bookings` (write side), sharing the pure engine in `packages/domain/booking` (no Nest/Prisma imports, 100% unit-testable); `apps/api/src/modules/booking-engine` holds only loaders/repositories and the write transaction.
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
10. Changing a service or add-on price after booking does not change the booking snapshot.
11. DST fixtures: in `Europe/Warsaw`, 02:30 on spring-forward day is never offered; fall-back day offers correct number of slots.
12. Availability endpoint p95 < 150 ms for a 10-staff salon, 7-day window, warm cache; < 400 ms cold (local benchmark).
13. Property-based test: for random schedules and booking sequences, no two active occupancy rows of the same staff/unit overlap and every returned slot is bookable.
14. Draft policy (X9 + X11): (a) every AI-agent-created booking is a draft until a salon member or the customer confirms; (b) staff-entered bookings are `confirmed` and flag `identity_verified=false` when the phone is unverified; (c) customer self-service bookings succeed **without OTP**, flagged `identity_verified=false`, `confirmed` by default and `pending` when `confirmation_mode=manual` or the customer matches `require_confirmation_for` (first-time / unverified).
15a. Add-ons: a 45-min service with a +15-min add-on blocks a 60-min occupancy (+ buffers); slots are offered only where the full length fits; add-on snapshot stored.
15b. `staff_selection=hidden` rejects customer requests that name a staff member (`422 STAFF_SELECTION_DISABLED`) and assigns via the any-staff strategy.
15c. Salon receptionist can create a booking outside schedule hours with `booking.override_rules` + reason → audit row; without the permission → `403`; overlap still rejected.
15e. Account deletion: future bookings cancelled with `account_deleted`, past bookings remain with contact data anonymised and snapshots/status history intact.
15d. Repeated no-shows from first-time/unverified phones emit `booking.confirmation_suggested` once per threshold crossing; the setting is not changed automatically.
15. Anti-abuse: the 4th active booking for the same phone at a salon returns `429 ACTIVE_LIMIT_REACHED`; exceeding hold/booking rate limits returns `429 RATE_LIMITED`; guest web requests without a valid bot-check token are rejected.

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
3. **M6.3 Create + state machine** — transaction, idempotency, history, outbox, "any staff", `staff_selection`, CRM manual/walk-in paths incl. audited schedule overrides (first-class per X13).
3a. **M6.3a Add-ons** — `service_addon` in availability + snapshots.
4. **M6.4 Holds** — hold API, TTL, sweeper.
5. **M6.5 Reschedule/cancel** — policy windows, corrections.
6. **M6.6 Resources & capacity units.**
7. **M6.7 Availability API + cache + perf benchmark.**
8. **M6.8 Multi-service Phase B** (flagged, post-launch per q17), later Phase C. Built together on `booking/06-multi-service` (same or different staff per line; ADR-0013, domain doc "Multi-service bookings").
9. **M6.9 Agent/Zalo draft flow** (with 08/09).

---

## 8. Later (documented, not implemented)
Waitlist, recurring appointments, group/class bookings, deposits, per-staff slot intervals, buffers outside hours, overbooking tolerance, travel/home-service bookings.

---

## 9. Product AI-agent surface
All tools tenant-scoped to the caller's salon. **No personal data is ever sent to an LLM:** tool outputs contain only opaque tokens (`booking_ref`, `customer_ref`, `staff_ref` — short-lived, per-conversation, resolved server-side), times, service names, statuses, counts and aggregates. Customer names, phone numbers, Zalo IDs, notes and review text are never returned; the CRM UI resolves tokens to real data when rendering the agent's answer for the human. Staff names are personal data too (X10) — always `staff_ref`.

| Tool | Kind | Permission | Notes |
|---|---|---|---|
| `find_available_slots` | read | `booking.view` | Same input as availability API; returns ≤ 20 slots. |
| `get_booking` / `list_bookings` | read | `booking.view` | Filters: date range, `staff_ref`, status, source. Returns `booking_ref`, `customer_ref`, `staff_ref`, start/end, service, status, source — no names, phones, notes. Staff role sees own only. |
| `get_booking_stats` | read | `analytics.view` | Counts by status/source/day; shares read model with 07. |
| `create_booking_draft` | write (draft) | `booking.manage` | Input: slot, service, `customer_ref` (or "new customer" — contact details entered by the human in the preview card, never by the model). Creates hold + draft; **never confirms** (X9 class 1). Returns `draft_ref` for a preview card. |
| `confirm_booking_draft` | write | UI only | Not exposed to the model; button in CRM/customer link. |
| `propose_reschedule` | write (draft) | `booking.manage` | Returns options + draft; human confirms. |
| `propose_status_change` | write (draft) | `booking.manage` | e.g. mark no-show; human confirms. |

When the customer confirms an agent draft, they receive a confirmation link or a ZBS Template Message (channel `zalo_template`) with a confirm button; the message is rendered server-side from the token, not by the LLM.

---

## 10. AI-first deliverables
- `.claude/agents/booking-engine.md` — domain subagent (owns `apps/api/src/modules/{availability,bookings,booking-engine}`, `packages/domain/booking`, `packages/contracts/booking`).
- `.claude/skills/booking-engine/SKILL.md` — invariants, procedures, mandatory test list.
- `docs/domains/booking-engine.md` — durable doc, filled as code lands.
- ADRs to write at implementation: `adr/xxxx-occupancy-exclusion-constraints.md`, `adr/xxxx-capacity-units.md`, `adr/xxxx-holds-as-occupancy.md`.

---

## 11. Open questions for the product owner
Answered by the owner (tracker q13–q18, q66) and applied above. New open items go to the GuGu Roadmap tracker, not here. Decided since: q69 (3 no-shows in 30 days), q71 (anonymise bookings on account deletion).
