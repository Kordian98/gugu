# ADR 0011: Multi-service bookings as chains of lines with their own occupancy

- Status: proposed
- Date: 2026-11-04
- Owner: booking-engine (topic 06, milestone M6.8)

## Context

Salons want one appointment with several services in sequence, e.g. gel nails then a pedicure. The services can be done by the same staff member or by different ones, and each can need its own resource units (chair, bed). The launch contract is one service + variant + add-ons (q17); spec 06 G12 plans phase B (same staff, back-to-back) and phase C (different staff) behind the flag `booking.multiService`. The guarantee must stay the same: the `booking_occupancy` EXCLUDE constraints are the final guard and no staff member or unit is ever double-booked. Existing clients (Zalo bot, single-service CRM, unrouted public page) must keep working unchanged.

## Decision

1. **A booking is a chain of 1–4 lines** (`booking_services.sequence` 1..4; `booking_services_valid` now checks `sequence BETWEEN 1 AND 4`). Each line has its own `staff_id`, `starts_at`/`ends_at` and snapshots (name, variant, price, duration, buffers, add-ons). The booking row keeps the first line's `staff_id`, the first start and the last end, and Σ line prices. Single service is a chain of one, so every path goes through the same code.
2. **Timing between lines** (`lineTiming`, `packages/domain/src/booking/chain.ts`):
   - same staff as the previous line: the next service starts after `max(after_prev, before_next)` (cleanup and prep overlap, G12); its occupancy row begins exactly where the previous row ends, so the two rows touch (half-open) and never overlap;
   - another staff member: the next service starts when the previous one ends; that person's before-buffer runs while the customer is still in the previous service.
3. **Occupancy stays one row per staff member and per unit, per line** — no merged rows, no new columns, no constraint changes. Resource units are claimed per line for the line's own occupancy segment; units taken by earlier lines of the same chain count as busy for later ones, so contiguous same-staff lines may reuse a unit and overlapping different-staff lines need another one.
4. **Planning is a depth-first search per candidate start** (`planLines`): for each first-line staff option, lines are assigned in order; "any staff" on a later line tries the previous line's staff first, then the usual least-booked → sort order. The first feasible plan wins. Slots list one option per first-line staff member; each option carries `lines` (the plan). Search space is bounded by 4 lines and the salon's staff count; infeasible branches are pruned on the first `covers` check.
5. **Writes lock the union** of every line's candidate staff and every unit of every required type in **one sorted list** (`lockClaims`), then revalidate the whole chain with `findSlot` and insert one occupancy row per line target. Reschedule moves every line together, keeps every snapshot, and may re-plan staff for lines whose staff was the first line's (`staffId` in the request); other lines keep their staff. Cancel/no-show deactivate all rows of the booking.
6. **Own-calendar scope:** staff with `.own` permissions *read* every booking where they do any line, but may *write* (transition, cancel, reschedule) only bookings where they do every line (security review). New chains they create put every line in their own calendar.
7. **Contracts stay backward compatible:** `nextServices` (body array; JSON in query strings) is optional everywhere; responses only gain fields (`services[]`, slot `lines[]`, outbox `staffIds`/`fromStaffIds`/`toStaffIds`). Holds remain single-service (the public page is unrouted, X23).
8. **Flag:** `BOOKING_MULTI_SERVICE` env (unset = on outside production, off in production) until topic 12's flag service exists; `GET /salons/:id/booking-features` tells the CRM. Chains with the flag off → `422 booking.multi_service_disabled`.

## Consequences

- No migration of occupancy data and no new raw objects; the inventory keeps `booking_services_valid` under the same name.
- Calendar queries for a staff member must look at `booking_services.staff_id` (new index `(salon_id, staff_id, starts_at)`), not only `bookings.staff_id`. Other modules that read `bookings.staff_id` as "the" staff member (customers-crm own scope, insights per-staff numbers) still attribute a chain to its first staff member — follow-up for topic 07.
- The CRM availability preview uses today's catalog terms while reschedule uses the booking's snapshot terms (as for single services); the write path revalidates, so a mismatch shows up as `slot_taken`, never as a double booking.
- Greedy first-feasible planning may assign a later line to a busier person than a full optimiser would; acceptable for ≤ 4 lines.
