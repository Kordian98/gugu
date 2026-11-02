# Domain: customer experience, reviews, notifications

Durable reference for customer accounts, favorites, reviews/moderation, privacy requests, and the notification platform. Read this before changing any of these areas. Requirements and acceptance criteria live in `docs/tasks/11-customer-notifications.md`; this file describes what actually exists.

Status: skeleton — no code yet. Fill each section as code lands.

## Glossary
- **Outbox event** — row written in the same transaction as a domain change; the relay turns it into queue jobs.
- **Channel plan** — the resolved list of channels (with fallbacks) for one recipient of one event.
- **Idempotency key** — `sha256(event_type|entity_id|entity_version|recipient_id|channel|variant)`.
- **Transactional vs marketing** — marketing needs consent and respects quiet hours.

## Invariants
- Notifications are produced only via the outbox.
- One delivery per idempotency key (BullMQ jobId + DB unique index).
- Every event × channel has vi and en templates.
- Reviews: one per completed booking, own booking, within 30 days.
- Account deletion anonymizes; bookings are never hard-deleted.
- AI moderation can only suggest or move to `pending_review`.

## Data model
_TBD — link Prisma models and migrations._

## Event catalog
| Event | Recipients | Channels (primary → fallback) | Class | Template keys |
|---|---|---|---|---|
| _TBD_ | | | | |

## Queues and jobs
| Queue | Job | Trigger | Retry/backoff |
|---|---|---|---|
| _TBD_ | | | |

## Flows
- Booking event → notification: _TBD_
- Reminder schedule/reschedule/cancel: _TBD_
- Review lifecycle and moderation: _TBD_
- Account deletion: _TBD_
- Data export: _TBD_

## File map
_TBD — API modules, app features, templates, tests._

## Product AI-agent tools
See `docs/tasks/11-customer-notifications.md` §9; record the implemented tool names and schemas here.

## Related
- Agent: `.claude/agents/customer-notifications.md`
- Skill: `.claude/skills/notification-event/SKILL.md`
- ADRs: _TBD_
