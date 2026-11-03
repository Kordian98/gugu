# ADR 0013: Multi-service bookings as chains of lines with their own occupancy

- Status: proposed
- Date: 2026-11-04
- Owner: booking-engine (topic 06, milestone M6.8)

## Context

Salons want one appointment with several services in sequence, e.g. gel nails then a pedicure. The services can be done by the same staff member or by different ones, and each can need its own resource units (chair, bed). The launch contract was one service + variant + add-ons (q17, superseded by q91: chains are live for every salon); spec 06 G12 plans phase B (same staff, back-to-back) and phase C (different staff) behind the flag `booking.multiService`. The guarantee must stay the same: the `booking_occupancy` EXCLUDE constraints are the final guard and no staff member or unit is ever double-booked. Existing clients (Zalo bot, single-service CRM, unrouted public page) must keep working unchanged.

## Decision

1. **A booking is a chain of 1–4 lines** (`booking_services.sequence` 1..4; `booking_services_valid` now checks `sequence BETWEEN 1 AND 4`). Each line has its own `staff_id`, `starts_at`/`ends_at` and snapshots (name, variant, price, duration, buffers, add-ons). The booking row keeps the first line's `staff_id`, the first start and the last end, and Σ line prices. Single service is a chain of one, so every path goes through the same code.
2. **Timing between lines** (`lineTiming`, `packages/domain/src/booking/chain.ts`):
   - same staff as the previous line: the next service starts after `max(after_prev, before_next)` (cleanup and prep overlap, G12); its occupancy row begins exactly where the previous row ends, so the two rows touch (half-open) and never overlap;
   - another staff member: the next service starts when the previous one ends; that person's before-buffer runs while the customer is still in the previous service.
3. **Occupancy stays one row per staff member and per unit, per line** — no merged rows, no new columns, no constraint changes. Resource units are claimed per line for the line's own occupancy segment; units taken by earlier lines of the same chain count as busy for later ones, so contiguous same-staff lines may reuse a unit and overlapping different-staff lines need another one.
4. **Planning is a depth-first search per candidate start** (`planStart`/`planFrom`, `packages/domain/src/booking/chain-search.ts`): for each first-line staff option, lines are assigned in order; "any staff" on a later line tries the previous line's staff first, then the usual least-booked → sort order. The first feasible plan wins. Slots list one option per first-line staff member; each option carries `lines` (the plan). The search is bounded (amended 2026-11-04 after security review M1, see "Search budget" below).
5. **Writes lock the union** of every line's candidate staff and every unit of every required type in **one sorted list** (`lockClaims`), then revalidate the whole chain with `findSlot` and insert one occupancy row per line target. Reschedule moves every line together, keeps every snapshot, and may re-plan staff for lines whose staff was the first line's (`staffId` in the request); other lines keep their staff. Cancel/no-show deactivate all rows of the booking.
6. **Own-calendar scope:** staff with `.own` permissions *read* every booking where they do any line, but may *write* (transition, cancel, reschedule) only bookings where they do every line (security review). New chains they create put every line in their own calendar.
7. **Contracts stay backward compatible:** `nextServices` (body array; JSON in query strings) is optional everywhere; responses only gain fields (`services[]`, slot `lines[]`, outbox `staffIds`/`fromStaffIds`/`toStaffIds`). Holds remain single-service (the public page is unrouted, X23).
8. **Flag:** `BOOKING_MULTI_SERVICE` env, **on by default in every environment** (owner q91, 2026-11-04, supersedes q17's "single service at launch"); `BOOKING_MULTI_SERVICE=false` is the off-switch until topic 12's flag service exists. `GET /salons/:id/booking-features` tells the CRM. With the flag off, `nextServices` → `422 booking.multi_service_disabled` on create **and** on the read paths (availability, earliest, booking-check; security review L1).

## Search budget (amendment, 2026-11-04, security review M1)

Plain backtracking costs about O(staff^lines) per start: with 15 staff and an impossible 4th line one 31-day window took 3–14 s and the earliest-slot scan up to ~160 s on the event loop, and varying `limit`/`from`/`addOnIds` bypasses the cache. The search is now bounded without changing any answer it gives within budget:

1. **Pre-checks** (`chain-day.ts`): per day, every line must be placeable on its own (some staff member who does it has a free stretch of duration + after-buffer, and every required type has enough units free that long), else the day is skipped. Per start, each later line must fit somewhere in its possible start window `[start + Σ min durations, start + Σ (max durations + max gaps)]`. Both are necessary conditions, so they never drop a bookable start.
2. **Memoization** per start on (line, previous staff, previous end, previous after-buffer, claims that can still overlap a later line). Every later occupancy starts at or after `previous end − longest remaining before-buffer`, so older claims cannot change the result and are left out of the key. A failing 4-line search drops from ~15⁴ to ~3·15² steps per start.
3. **Budgets** (deterministic step counts, not time): `CHAIN_STEPS_PER_START = 5 000` and `CHAIN_STEPS_PER_REQUEST = 1 000 000` shared by every start, day and window of one request (`searchBudget()`). A step is one staff member tried for a line after the first, so **a single service never spends budget** and its results are unchanged (golden test). When a budget runs out the slots found so far are returned and the response says `truncated: true` (`Availability`, `EarliestSlots`); `unavailableReason` is then null.
4. **Earliest slot for chains** scans at most `MAX_CHAIN_EARLIEST_DAYS = 62` days from its start, with one budget for the whole scan; stopping there with fewer than `limit` results is also `truncated`.
5. **Write path:** `findSlot` plans only the requested start with a fresh budget. Because budgets count steps deterministically, every offered start revalidates to the same plan; a start that exhausted its own budget is refused (never over-offered).

Consequences: worst case ≈ 150–200 ms CPU per request (local, 15 staff, 4 lines); a feasible 4-line chain with 15 staff over 31 days at a 5-minute grid uses ~170k steps (~100 ms), so legitimate salons up to ~40 staff are not truncated. Larger salons may see `truncated` on month views and should query shorter ranges.

## Consequences

- No migration of occupancy data and no new raw objects; the inventory keeps `booking_services_valid` under the same name.
- Calendar queries for a staff member must look at `booking_services.staff_id` (new index `(salon_id, staff_id, starts_at)`), not only `bookings.staff_id`. Other modules that read `bookings.staff_id` as "the" staff member (customers-crm own scope, insights per-staff numbers) still attribute a chain to its first staff member — follow-up for topic 07.
- The CRM availability preview uses today's catalog terms while reschedule uses the booking's snapshot terms (as for single services); the write path revalidates, so a mismatch shows up as `slot_taken`, never as a double booking.
- Greedy first-feasible planning may assign a later line to a busier person than a full optimiser would; acceptable for ≤ 4 lines.
