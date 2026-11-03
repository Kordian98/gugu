# Domain: customer experience, reviews, notifications

Durable reference for customer accounts, favorites, reviews/moderation, privacy requests, and the notification platform. Read this before changing any of these areas. Requirements and acceptance criteria live in `docs/tasks/11-customer-notifications.md`; this file describes what actually exists.

## Status
- **No customer email (X26, owner q85/q86/q87, branch `notify/11-no-customer-email`)**: GuGu never emails a salon's customers. Customers hear only from the salon's Zalo OA (module `zalo`); when the OA cannot reach them, nothing is sent. Built on top of milestone `11-email`: staff bell + "also email me", Settings → Notifications (team switches + read-only Zalo state), per-booking Zalo timeline, client email stored on the CRM profile (never used).
- Not built: push, customer in-app inbox (no customer app/accounts — X23), SMS (X12), marketing/consent/quiet hours (no marketing messages exist yet), reviews, moderation, account-deletion requests, provider delivery webhooks.

## Glossary
- **Outbox event** — row written in the same transaction as a domain change; the relay turns it into queue jobs.
- **Delivery** — one planned team send: member × channel × event (`notification_deliveries`). There are no customer deliveries in this module.
- **Channel plan** — customer: salon's Zalo OA (`zalo_template` or consultation message, sent by module `zalo`) → nothing; team: `in_app` + `email`.
- **Zalo reach** — whether the salon's OA can reach a booking's customer now: `reachable` (connected OA and a linked or uniquely phone-matched conversation), `not_linked`, `not_connected`. Computed at read time by `ZaloDeliveryQueries.route`.
- **Idempotency key** — `sha256(event_type|entity_id|entity_version|recipient_id|channel|variant)`; unique key of the delivery and its BullMQ job id.
- **Transactional vs marketing** — everything here is transactional; marketing needs consent and quiet hours (not built).
- **`zalo_template`** — channel id for ZBS Template Message (formerly ZNS), adapter owned by the zalo domain.
- **SMS (mock)** — no real SMS for now (X12); not wired.
- **Messaging cost** — each paid delivery stores salon id, units and estimated cost (team email: `NOTIFY_EMAIL_COST_VND`, default 3 VND; Zalo sends are costed in `zalo_send_logs` by module `zalo`).

## Invariants
- **No email to a salon's customers, ever (X26).** There is no customer email template, no email fallback, no reply-to and no `.ics`. Enforced three times: the catalog gives customer events only `zalo_template`; the planner writes team rows only and the worker treats anything but a team email as `noop`; the DB check `notification_deliveries_valid` rejects `audience = 'customer'`. Tests: `domain/domain.test.ts`, `templates/template-coverage.test.ts`, `notifications.int.test.ts` ("never emails the customer for any event…", "rejects a customer row…"), web E2E `owner-journey` and `multi-service` (Mailpit stays empty for the customer).
- Client email (q87) is stored on `customer_salon_profiles.email` for the salon's records only; nothing in GuGu reads it to send. Same visibility as the phone (`customers.phone.read`, masked `l•••@domain` otherwise); editing it needs the same permission. Erasure (ADR-0012) deletes the profile with it.
- Notifications are produced only via the outbox (booking events from topic 06, `zalo.handoff_requested` from topic 09). Customer messages for the same booking events are planned and sent by module `zalo` from the same outbox events.
- One delivery per idempotency key (BullMQ jobId + DB unique index); the send worker claims a delivery with a lease (`locked_until`), so a duplicate job or second worker gets `noop`. SMTP has no idempotency: if a worker dies *after* the provider accepted the email but before recording it, the retry after the lease (2 min) sends again — at-least-once in that window only; both copies carry the same `Message-ID` (`<idempotency key>@<mail domain>`).
- Team recipients come from the permission matrix (`MembershipService`): `bookings.read`, or `bookings.read.own` for the member's own staff profile; Zalo hand-off needs `zalo.inbox.use`. The actor never notifies themself. Access is checked again at send time and when the bell is read.
- Salon suspended by GuGu (q89, ADR-0010): team notifications keep going; customer Zalo sends are paused by module `zalo` (`zalo-suspension.int.test.ts`). Test here: `notifications-suspension.int.test.ts`.
- Every team event × channel has vi and en templates (template coverage test); variables are validated with Zod. Customer events have no templates here (their ZBS templates belong to module `zalo`).
- Times are rendered in the salon's timezone; team locale = the member's preferred locale.
- The send log stores ids and codes only — no email address, no message content. Addresses are resolved at send time.
- Reviews (when built): one per completed booking, own booking, within 30 days; editable for 7 days or until the salon responds.
- Account deletion (when built): 30-day grace period, then anonymization; bookings are anonymised, never deleted.
- Moderation is rule-based + manual queue; no personal data goes to any LLM.

## Data model
Migrations `apps/api/prisma/migrations/20261104090000_add_notifications`, `20261104091000_notification_recipient_key`, `20261105120000_no_customer_email` (X26: moves `bookings.customer_email` to `customer_salon_profiles.email` — latest email per salon + phone, creating the profile if needed — then drops it; deletes the old customer email rows; drops `recipient_key`, `reserved_at`, `notification_settings.reply_to_email`; tightens `notification_deliveries_valid` to team rows).

| Table | Purpose |
|---|---|
| `customer_salon_profiles.email` | Optional client email typed by staff (citext; q87). Stored only, never used for sending. Visibility as the phone. Owned by 07 (customers-crm). |
| `notification_settings` | 1:1 salon. `events` JSON `{ "<team event>": { "email": bool, "in_app": bool } }` (missing = on). |
| `salon_settings.reminder_offsets` | Not read since X26 (kept in 04's model). Customer reminders are the Zalo OA's fixed 24 h / 2 h reminders (`zalo_oa_connections.reminder_24h/2h`). |
| `notification_deliveries` | Team send log: salon, booking/conversation, event, audience (`team` only), recipient user, channel (`email`/`in_app`), idempotency key (unique), status (`queued`, `sent`, `failed`, `skipped`, …), reason, locale, `scheduled_for`, lease, attempts, provider message id, units, `cost_estimate_vnd`, entity version, `meta`. Check constraint `notification_deliveries_valid` (team rows only). `fallback_of` is a legacy column, always null. |
| `notifications` | Team bell item per in-app delivery (`delivery_id` unique). Display data is joined at read time. |
| `notification_member_prefs` | A member's own "also email me" switch per salon. |

Zalo sends stay in `zalo_send_logs` (module `zalo`); the booking timeline reads only those.

**Old customer email rows (decision for the booking timeline):** hidden — the migration deletes them. They existed only in dev data (Mailpit, never a real customer); keeping them would show a channel that no longer exists.

## Event catalog
Source: `apps/api/src/modules/notifications/domain/catalog.ts`, event ids in `packages/contracts/src/notifications/notifications.ts`.

| Event | Trigger (outbox) | Recipients | Channels | Template keys (`notifications` namespace) |
|---|---|---|---|---|
| `booking.confirmed` | `booking.created` (confirmed) or pending→confirmed, by a salon member | customer | salon's Zalo OA only (module `zalo`), else nothing | — (ZBS templates in module `zalo`) |
| `booking.rescheduled` | `booking.rescheduled` by a salon member | customer | salon's Zalo OA only, else nothing | — |
| `booking.cancelled_by_salon` | → cancelled_by_salon by a salon member | customer | salon's Zalo OA only, else nothing | — |
| `booking.reminder` | Zalo reminder scan (24 h / 2 h, switches in Settings → Zalo) | customer | salon's Zalo OA only, else nothing | — |
| `salon.booking_received` | `booking.created` | team except the actor | bell + email | `email.team.salonBookingReceived.*`, `panel.inbox.items.salon_booking_received` |
| `salon.booking_rescheduled` | `booking.rescheduled` (old and new staff) | team except the actor | bell + email | `email.team.salonBookingRescheduled.*` |
| `salon.booking_cancelled` | `booking.status_changed` → cancelled_* | team except the actor | bell + email | `email.team.salonBookingCancelled.*` |
| `salon.zalo_handoff` | `zalo.handoff_requested` (module `zalo`, in the inbound transaction) | members with `zalo.inbox.use` | bell + email | `email.team.salonZaloHandoff.*` |

## Queues and jobs
| Queue | Job | Trigger | Retry/backoff |
|---|---|---|---|
| `outbox` | `outbox.event` → `NotificationEventsHandler` | outbox relay (04-S5) | handler idempotent; job retried by BullMQ |
| `notify` | `notify.send` (`jobId` = idempotency key) | planner, reconciliation | 6 attempts, exponential from 5 s; final attempt → `failed/provider_error`; SMTP 5xx → `failed/smtp_5xx` at once |
| `notify` | `notify.reconcile` | every 10 min (job scheduler) | re-enqueues team emails still pending in the last 7 days (Redis loss) |

## Flows
- **Booking event → team notification**: booking command writes `booking.*` with `version`, `actorType`, `actorId` → relay → `PlannerService.handle` → team delivery rows (+ bell items) in one transaction → `notify.send` jobs → `SenderService.send` (lease, settings + access + own-preference re-check, render, `EmailChannel`, record status/cost).
- **Booking event → customer**: module `zalo` (`BookingUpdatesService`, `RemindersService`) — not this module.
- **Settings change**: `PUT /notifications/settings` → team switches saved + audit `notifications.settings_updated` (codes only).
- Review lifecycle, account deletion, data export by customers: _not built_ (salon-side export/erase: `privacy` module, ADR-0012).

## HTTP API (salon panel only)
| Route | Permission | Notes |
|---|---|---|
| `GET /salons/:salonId/notifications/settings` | `salon.read` | team events with bell/email on/off; read-only `zalo { connected, reminder24h, reminder2h }` |
| `PUT /salons/:salonId/notifications/settings` | `salon.settings.write` | Zod: team events only, no duplicates; audited |
| `GET /salons/:salonId/bookings/:bookingId/messages` | `schedules.read` + booking scope | `notifications.bookingLog`: Zalo sends (channel, status, reason, times) + `zaloReach`; no address/content; own-scope staff → 404 for others' bookings |
| `GET /salons/:salonId/notifications/inbox` | `salon.read` | caller's own items, filtered by current access; `unread` counts only visible items |
| `POST /salons/:salonId/notifications/inbox/read` | `salon.read` | own items only |
| `GET/PUT /salons/:salonId/notifications/me` | `salon.read` | own "also email me" switch |
| `POST/PATCH /salons/:salonId/customers[/:id]` `email` (customers-crm) | `customers.read` + `customers.phone.read` for the email | q87 stored email; 403 without `customers.phone.read` |

## File map
- API module: `apps/api/src/modules/notifications/` — `domain/` (catalog, idempotency), `templates/email-templates.ts` (team only), `channels/channel.ts` (port + `EmailChannel`), `application/` (planner, sender, reconcile, recipients, settings, inbox, timeline, delivery-queue, booking-view), `http/notifications.controller.ts`, `notifications.read-models.ts`, `notifications.module.ts` (HTTP + worker slices), tests `domain/domain.test.ts`, `templates/template-coverage.test.ts`, `notifications.int.test.ts`, `notifications-suspension.int.test.ts`.
- Worker: `apps/api/src/jobs/notify.processor.ts`; handler registered in `apps/api/src/jobs/jobs.module.ts`.
- Zalo read side (owner: zalo): `apps/api/src/modules/zalo/application/delivery.queries.ts` (`route`, `customerMessaging`, `forBooking`); hand-off outbox write in `inbound.service.ts`.
- Client email: `apps/api/src/modules/customers-crm/application/customers.service.ts`, contracts `packages/contracts/src/salon-crm/customers.ts` (`customerEmailSchema`), mask `maskEmail` in `packages/domain/src/phone/vn-phone.ts`, test `customers-crm/customers-email.int.test.ts`.
- Contracts: `packages/contracts/src/notifications/notifications.ts`.
- Templates and panel copy: `packages/localization/locales/{vi,en}/notifications.json`; client email keys `crm:customers.email*`.
- App: `apps/app/features/notifications/` — `NotificationsSection.tsx` (Settings), `BookingMessages.tsx` (drawer timeline), `NotificationBell.tsx` (desktop dropdown, mobile sheet), `data.ts`; wired in `features/salon-crm/pages/SettingsScreen.tsx`, `pages/calendar/BookingSheet.tsx`, `shell/PageHeader.tsx`, `shell/MobileChrome.tsx`. Client email field: `features/salon-crm/pages/customers/CustomerSheet.tsx` (`EmailField`).

## vi copy review
New vi strings awaiting the vi reviewer (owner's wife), label `i18n:vi-review`: `notifications.json` → `panel.settings.*`, `panel.messages.title`, `panel.messages.empty`, `panel.messages.reach.*`, `panel.messages.reasons.paid_messages_off`, `panel.messages.reasons.disconnected`; `crm.json` → `customers.email`, `customers.emailHint` ("Chỉ để lưu thông tin. GuGu không gửi email cho khách."), `customers.emailInvalid`, `customers.emailSaved`, `booking.cancelNotice`; `privacy.json` → `export.intro`. Team copy uses "anh/chị".

## Product AI-agent tools
`notifications.bookingLog` is registered in `notifications.read-models.ts` (`agentExposed: false` for now; it contains no personal data). `notifications.deliveryStats` and `reminders.settings.*` are not built.

## Related
- Agent: `.claude/agents/customer-notifications.md`
- Skill: `.claude/skills/notification-event/SKILL.md`
- ADRs: _TBD_ (outbox vs direct enqueue is decided by 04-S5)
