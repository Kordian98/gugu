# Domain: customer experience, reviews, notifications

Durable reference for customer accounts, favorites, reviews/moderation, privacy requests, and the notification platform. Read this before changing any of these areas. Requirements and acceptance criteria live in `docs/tasks/11-customer-notifications.md`; this file describes what actually exists.

## Status
- **Notifications by email (milestone `11-email`, branch `notify/11-email`)**: built. Customer emails as the fallback after Zalo, staff bell + email, Settings → Notifications, per-booking "messages sent" timeline.
- Not built: push, customer in-app inbox (no customer app/accounts — X23), SMS (X12), marketing/consent/quiet hours (no marketing messages exist yet), reviews, moderation, privacy requests, provider delivery webhooks.

## Glossary
- **Outbox event** — row written in the same transaction as a domain change; the relay turns it into queue jobs.
- **Delivery** — one planned send: recipient × channel × event × variant (`notification_deliveries`).
- **Channel plan** — customer: `zalo_template` (module `zalo`) → `email` → none; team: `in_app` + `email`.
- **Idempotency key** — `sha256(event_type|entity_id|entity_version|recipient_id|channel|variant)`; unique key of the delivery and its BullMQ job id.
- **Zalo gate** — an email that is the fallback of a Zalo send waits until the Zalo send log has a final result: `sent` → email skipped (`sent_via_zalo`); `failed`/`rejected` → email sent; nothing final after 15 minutes → email sent.
- **Transactional vs marketing** — everything here is transactional; marketing needs consent and quiet hours (not built).
- **`zalo_template`** — channel id for ZBS Template Message (formerly ZNS), adapter owned by the zalo domain.
- **SMS (mock)** — no real SMS for now (X12); not wired in this milestone.
- **Messaging cost** — each paid delivery stores salon id, units and estimated cost (`NOTIFY_EMAIL_COST_VND`, default 3 VND per email).

## Invariants
- Notifications are produced only via the outbox (booking events from topic 06, `zalo.handoff_requested` from topic 09, `notifications.settings_updated`).
- One delivery per idempotency key (BullMQ jobId + DB unique index); the send worker claims a delivery with a lease (`locked_until`), so a duplicate job or second worker gets `noop`. SMTP has no idempotency: if a worker dies *after* the provider accepted the email but before recording it, the retry after the lease (2 min) sends again — at-least-once in that window only; both copies carry the same `Message-ID` (`<idempotency key>@<mail domain>`).
- Abuse caps (customer addresses are typed by staff and unverified): at most `NOTIFY_CUSTOMER_EMAILS_PER_SALON_DAY` (500) customer emails per salon and `NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY` (10) per address per salon per 24 h; hits are `skipped/cap`. Bounce/complaint tracking per salon is for topic 13 with the real provider.
- Customers get messages only for changes the salon made (`actorType = salon_member`); changes made in the Zalo chat were already answered there.
- Customer emails speak as the salon (sender name = salon name, reply-to = salon's address), never mention GuGu and contain no link to a booking surface (owner, 2026-11-03) — only `tel:` for the salon phone. No staff-typed cancellation reason, no notes.
- Reminder sends re-check booking status, version and start time in the worker; stale → `skipped/stale`.
- Every event × channel has vi and en templates (template coverage test); variables are validated with Zod.
- Times are rendered in the salon's timezone; customer locale = salon default (customers have no account), team locale = the member's preferred locale.
- Team recipients come from the permission matrix (`MembershipService`): `bookings.read`, or `bookings.read.own` for the member's own staff profile; Zalo hand-off needs `zalo.inbox.use`. The actor never notifies themself. Access is checked again at send time and when the bell is read.
- The send log stores ids and codes only — no email address, no message content. Addresses are resolved at send time.
- Reviews (when built): one per completed booking, own booking, within 30 days; editable for 7 days or until the salon responds.
- Account deletion: 30-day grace period, then anonymization (`BookingAnonymiser` also clears `customer_email`).
- Moderation is rule-based + manual queue; no personal data goes to any LLM.

## Data model
Migration `apps/api/prisma/migrations/20261104090000_add_notifications`.

| Table | Purpose |
|---|---|
| `bookings.customer_email` | Optional customer email entered by staff (citext). Same visibility rule as the phone (`customers.phone.read`, masked otherwise). Cleared by anonymisation. |
| `notification_settings` | 1:1 salon. `events` JSON `{ "<event>": { "email": bool, "in_app": bool } }` (missing = catalog default), `reply_to_email`. |
| `salon_settings.reminder_offsets` | Reminder offsets in minutes (default `[1440, 120]`; max 3, 30 min – 7 days). Written by the notifications settings endpoint. |
| `notification_deliveries` | Send log: salon, booking/conversation, event, variant (`1440m`), audience (`customer`/`team`), recipient user (team), channel (`email`/`in_app`), idempotency key (unique), status (`scheduled`, `queued`, `sent`, `delivered`, `failed`, `skipped`), reason, `fallback_of`, locale, `scheduled_for`, lease, attempts, provider message id, units, `cost_estimate_vnd`, entity version, `meta` (source event id, Zalo dedup key, planned start, offset). Check constraint `notification_deliveries_valid`. |
| `notifications` | Team bell item per in-app delivery (`delivery_id` unique). Display data is joined at read time. |
| `notification_member_prefs` | A member's own "also email me" switch per salon. |

Zalo sends stay in `zalo_send_logs` (module `zalo`); the timeline merges both.

## Event catalog
Source: `apps/api/src/modules/notifications/domain/catalog.ts`, event ids in `packages/contracts/src/notifications/notifications.ts`.

| Event | Trigger (outbox) | Recipients | Channels | Template keys (`notifications` namespace) | Attachment |
|---|---|---|---|---|---|
| `booking.confirmed` | `booking.created` (status confirmed) or `booking.status_changed` pending→confirmed, by a salon member | customer | Zalo → email | `email.bookingConfirmed.*` | `.ics` PUBLISH |
| `booking.rescheduled` | `booking.rescheduled` by a salon member | customer | Zalo → email | `email.bookingRescheduled.*` | `.ics` PUBLISH (same UID, SEQUENCE = version) |
| `booking.cancelled_by_salon` | `booking.status_changed` → cancelled_by_salon by a salon member | customer | Zalo → email | `email.bookingCancelledBySalon.*` | `.ics` CANCEL |
| `booking.reminder` (variants = offsets) | planned on every booking event | customer | Zalo 24 h / 2 h reminder → email | `email.bookingReminder.*` | `.ics` PUBLISH |
| `salon.booking_received` | `booking.created` | team except the actor | bell + email | `email.team.salonBookingReceived.*`, `panel.inbox.items.salon_booking_received` | — |
| `salon.booking_rescheduled` | `booking.rescheduled` (old and new staff) | team except the actor | bell + email | `email.team.salonBookingRescheduled.*` | — |
| `salon.booking_cancelled` | `booking.status_changed` → cancelled_* | team except the actor | bell + email | `email.team.salonBookingCancelled.*` | — |
| `salon.zalo_handoff` | `zalo.handoff_requested` (module `zalo`, in the inbound transaction) | members with `zalo.inbox.use` | bell + email | `email.team.salonZaloHandoff.*` | — |

Customer plan per event (planner): no email and no Zalo route → `skipped/no_contact`; Zalo route → email `queued` as fallback (`fallback_of = zalo_template`, gate on `booking_update:<eventId>`, first check after 90 s); email only → `queued` now; salon turned it off → `skipped/disabled`. Reminders: Zalo covers a reminder when the salon has a usable Zalo route, the matching Zalo reminder (≤ 2 h → `reminder_2h`, else `reminder_24h`) is on and the booking existed at that moment; then the email reminder is gated on `<kind>:<bookingId>`.

## Queues and jobs
| Queue | Job | Trigger | Retry/backoff |
|---|---|---|---|
| `outbox` | `outbox.event` → `NotificationEventsHandler` | outbox relay (04-S5) | handler idempotent; job retried by BullMQ |
| `notify` | `notify.send` (`jobId` = idempotency key, `delay` = until `scheduled_for`) | planner, reminders, reconciliation | 6 attempts, exponential from 5 s; final attempt → `failed/provider_error`; SMTP 5xx → `failed/smtp_5xx` at once; "wait for Zalo" → moved back to delayed (`DelayedError`) |
| `notify` | `notify.reconcile` | every 10 min (job scheduler) | re-plans reminders for bookings in the next 48 h and re-enqueues pending deliveries (Redis loss) |

## Flows
- **Booking event → notification**: booking command writes `booking.*` with `version`, `actorType`, `actorId` → relay → `PlannerService.handle` → delivery rows (+ bell items) in one transaction → `notify.send` jobs → `SenderService.send` (lease, re-checks, Zalo gate, render, `EmailChannel`, record status/cost).
- **Reminder schedule/reschedule/cancel**: `RemindersService.sync(booking)` derives wanted reminders from the booking's current state (offsets from settings, only future moments, booking has an email, event enabled). Rows of other versions/offsets → `skipped/superseded` (or `stale` if the booking is no longer upcoming) and their jobs removed. The worker checks status, version and start again at send time.
- **Settings change**: `PUT /notifications/settings` → audit `notifications.settings_updated` + outbox event → re-plan reminders of bookings in the next 8 days.
- Review lifecycle, account deletion, data export: _not built_.

## HTTP API (salon panel only)
| Route | Permission | Notes |
|---|---|---|
| `GET /salons/:salonId/notifications/settings` | `salon.read` | events with effective on/off, offsets, `zaloConnected`; reply-to only for `salon.settings.write` |
| `PUT /salons/:salonId/notifications/settings` | `salon.settings.write` | Zod: ≤ 3 unique offsets 30–10080 min, valid email; audited |
| `GET /salons/:salonId/bookings/:bookingId/messages` | `schedules.read` + booking scope | `notifications.bookingLog`: channel, status, reason, times; no address/content; own-scope staff → 404 for others' bookings |
| `GET /salons/:salonId/notifications/inbox` | `salon.read` | caller's own items, filtered by current access; `unread` counts only visible items |
| `POST /salons/:salonId/notifications/inbox/read` | `salon.read` | own items only |
| `GET/PUT /salons/:salonId/notifications/me` | `salon.read` | own "also email me" switch |

## File map
- API module: `apps/api/src/modules/notifications/` — `domain/` (catalog, idempotency, reminders, send-checks, ics), `templates/email-templates.ts`, `channels/channel.ts` (port + `EmailChannel`), `application/` (planner, reminders, sender, recipients, settings, inbox, timeline, delivery-queue), `http/notifications.controller.ts`, `notifications.read-models.ts`, `notifications.module.ts` (HTTP + worker slices), tests `domain/*.test.ts`, `templates/template-coverage.test.ts`, `notifications.int.test.ts`.
- Worker: `apps/api/src/jobs/notify.processor.ts`; handler registered in `apps/api/src/jobs/jobs.module.ts`.
- Zalo read side (owner: zalo): `apps/api/src/modules/zalo/application/delivery.queries.ts` (`route`, `outcome`, `forBooking`, `connected`); hand-off outbox write in `inbound.service.ts`.
- Mail: `apps/api/src/infrastructure/mail/mail.service.ts` (sender name, reply-to, attachments, Message-ID).
- Contracts: `packages/contracts/src/notifications/notifications.ts`; `staffCustomerContactSchema` + `customer.email` in `packages/contracts/src/booking/booking.ts`.
- Templates and panel copy: `packages/localization/locales/{vi,en}/notifications.json`; booking-form email field keys `crm:calendar.newClientEmail*`.
- App: `apps/app/features/notifications/` — `NotificationsSection.tsx` (Settings), `BookingMessages.tsx` (drawer timeline), `NotificationBell.tsx` (desktop dropdown, mobile sheet), `data.ts`, `offsets.ts`; wired in `features/salon-crm/pages/SettingsScreen.tsx`, `pages/calendar/BookingSheet.tsx`, `pages/calendar/NewAppointmentSheet.tsx`, `shell/PageHeader.tsx`, `shell/MobileChrome.tsx`.

## vi copy review
New vi strings awaiting the vi reviewer (owner's wife), label `i18n:vi-review`: all of `packages/localization/locales/vi/notifications.json` and `crm.json` → `calendar.newClientEmail`, `calendar.newClientEmailHint`, `calendar.newClientEmailInvalid`. Customer copy uses "bạn" (tone guide), team copy "anh/chị".

## Product AI-agent tools
`notifications.bookingLog` is registered in `notifications.read-models.ts` (`agentExposed: false` for now; it contains no personal data). `notifications.deliveryStats` and `reminders.settings.*` are not built.

## Related
- Agent: `.claude/agents/customer-notifications.md`
- Skill: `.claude/skills/notification-event/SKILL.md`
- ADRs: _TBD_ (outbox vs direct enqueue is decided by 04-S5)
