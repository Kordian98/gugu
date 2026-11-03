---
name: notification-event
description: Add or change a GuGu notification event end-to-end — event catalog entry, outbox publishing, channel policy, vi/en templates, idempotency key, reminders, and tests. Use when touching apps/api/src/modules/notifications, notification templates in packages/localization/*/notifications, or when a domain change must notify customers or salon members.
---

# Add a notification event

Code exists (milestone `11-email`): catalog `apps/api/src/modules/notifications/domain/catalog.ts`, event ids `packages/contracts/src/notifications/notifications.ts`, templates `packages/localization/locales/{vi,en}/notifications.json` (keys use `_` for `.` in event ids), planner `application/planner.service.ts`, worker `application/sender.service.ts`, reminders `application/reminders.service.ts`. The current file map and channel plan are in `docs/domains/customer-notifications.md`; where this skill says "push" or "SMS", those channels are not wired yet.

## When to use
- A new domain change should notify someone (customer, salon member, staff).
- Changing who receives an event, its channels, its wording, or its timing.
- Adding a reminder-like scheduled notification.

## Invariants
- MUST publish through the outbox in the same DB transaction as the state change. Reason: no lost or phantom notifications.
- MUST derive the idempotency key as `sha256(event_type|entity_id|entity_version|recipient_id|channel|variant)` and use it as the BullMQ `jobId`. Reason: replays and retries never double-send.
- MUST ship vi and en templates for every channel the event can use. Reason: CI coverage test fails otherwise.
- MUST classify the event as `transactional` or `marketing`; marketing requires consent and respects quiet hours.
- MUST NOT include verification links or codes, internal salon notes, or other customers' data in templates.
- MUST render times in the salon timezone via the shared formatter, never `toLocaleString` ad hoc.
- Scheduled sends MUST re-check entity state and version in the worker and drop stale jobs.

## Procedure
1. **Catalog** — add the event to the event catalog (`notifications/catalog.ts`): name `<domain>.<past_tense_verb>`, payload Zod schema, class (transactional/marketing), category (for preferences), recipient resolver (customer / salon roles with permission).
2. **Policy** — add the default channel plan and fallback chain to the policy config; mark `critical` only if the paid fallback (`zalo_template`) is justified. Customer channels: push, in-app, email, `zalo_template` (reminders default to Zalo when live). SMS is a mock adapter only (X12) — never put SMS in a default plan.
3. **Publish** — in the producing domain service, write `OutboxEvent` inside the existing transaction. Include `entity_version`.
4. **Templates** — add per channel × locale:
   - `packages/localization/vi/notifications/<event>.json` and `.../en/...`
   - push: `title` ≤ 50 chars, `body` ≤ 150 chars; sms (mock channel, kept ready for a future provider): provide both `vi` and `vi-ascii` (diacritics stripped, still readable) plus `en`; GSM-7 = 160 chars/segment (153 concatenated), UCS-2 = 70 (67) — Vietnamese diacritics force UCS-2; the planner picks `vi-ascii` when `vi` exceeds the event's segment budget (default 1, critical 2). Never reference an SMS provider by name — routing per country is config; email: subject + MJML/HTML body; zalo_template: reference the approved ZBS template id (owned by the zalo domain).
   - Write natural Vietnamese, not literal translation; use only variables declared in the payload schema.
5. **Deep link** — set the tap target route (e.g. `/[locale]/bookings/:id`) for push and in-app.
6. **Scheduled variant (if any)** — enqueue delayed job in `notify.reminders` at the triggering change; on reschedule/cancel remove by key and re-enqueue; extend the nightly reconciliation to cover it.
7. **Agent surface** — if salon owners may ask about it, expose stats via `notifications.deliveryStats` filters; don't add new write tools without confirmation flow.
8. **Docs** — add the event row to `docs/domains/customer-notifications.md` (event table).

## Customer channel plan (owner, 2026-11-03)
Zalo first (module `zalo` sends from the salon's OA), email only as the fallback when the booking has an email and Zalo did not deliver (the worker reads the Zalo send log by dedup key), else nothing — logged as `skipped` with a reason. Customer emails speak as the salon, never advertise GuGu and carry no link to a booking surface. Customers only hear about changes the salon made (`actorType = salon_member`).

## Tests (required)
- Unit: recipient resolution, policy/fallback plan, consent and quiet-hour skips.
- Template: snapshot for vi and en; variable schema validation; length limits; SMS segment count for `vi`, `vi-ascii`, `en` within budget.
- Integration: publish twice → exactly one delivery per recipient/channel; worker crash and retry → no duplicate.
- Scheduled: fake clock — reschedule removes old job, cancel prevents send, stale version dropped.

## Checklist before PR
- [ ] Event in catalog with Zod payload and class
- [ ] Outbox write inside the transaction
- [ ] vi + en templates for all channels; coverage test green
- [ ] Idempotency key includes entity version and variant
- [ ] Preferences category set; marketing → consent check
- [ ] Deep link works on iOS, Android, web
- [ ] Domain doc event table updated
