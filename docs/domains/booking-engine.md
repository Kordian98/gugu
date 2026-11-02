# Booking engine (domain doc)

Durable reference for how GuGu computes availability and creates bookings without double-booking. Read this before touching `apps/api/src/modules/{availability,bookings,booking-engine}`. Spec and rationale: `docs/tasks/06-booking-engine.md`. Procedures: `.claude/skills/booking-engine/SKILL.md`.

**Status:** not implemented — skeleton. Fill each section as code lands; keep it in sync with the code.

## Glossary
| Term | Meaning |
|---|---|
| Occupancy | A row in `booking_occupancy` reserving a staff member or resource unit for a half-open time range. |
| Hold | Temporary occupancy (`kind='hold'`, `expires_at`) during checkout. |
| Resource unit | One capacity slot of a resource; capacity N → N units. |
| Buffer | Prep/cleanup time before/after a service, included in occupancy. |
| Draft | Unconfirmed booking proposal created by AI agent or Zalo; needs human confirmation. |

## Invariants
See skill → Invariants. (Copy the final list here once implemented.)

## Data model
_TODO: tables, columns, constraints (link migration files)._

## Slot computation
_TODO: pipeline steps, rule order, file paths of `computeSlots` and rules._

## Write path
_TODO: transaction sequence diagram, lock keys, error mapping._

## State machine
_TODO: link `packages/domain/booking/state-machine.ts`; generated transition table._

## Rules & settings
_TODO: each salon setting, default, overridable?, file path._

## API
_TODO: endpoints, error codes (`SLOT_TAKEN`, `INVALID_TRANSITION`, `CANCEL_WINDOW_PASSED`, `HOLD_EXPIRED`, `IDEMPOTENCY_MISMATCH`)._

## Events (outbox)
_TODO: `booking.created`, `booking.confirmed`, `booking.rescheduled`, `booking.cancelled`, `booking.checked_in`, `booking.completed`, `booking.no_show` — payload schemas._

## AI-agent tools
_TODO: link tool definitions; see spec §9._

## File map
_TODO._

## Known limitations
- Multi-service Phase B/C not implemented.
- Waitlist, recurring, group bookings, deposits not implemented.
