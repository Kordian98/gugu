# 11 — Customer experience, reviews, notifications

Spec for the customer account lifecycle, reviews and ratings, and the centralized notification system (master prompt §10 customer part, §15, §16). Zalo-specific mechanics (OA, ZNS templates, Mini App) are owned by topic 09; this spec defines the **channel abstraction** they plug into.

## 1. Scope

**In**
- Customer profile, preferences, favorites (salons + services), booking history views, cancel/reschedule entry points (engine rules owned by 06).
- Account deletion and personal data export.
- Reviews: eligibility, create/edit/delete policy, photos, salon response, reporting, moderation (manual + optional AI-assisted), rating aggregation.
- Notification platform: event catalog, orchestration on BullMQ, templates (vi/en), channel providers (push, in-app, email, SMS, ZNS slot), fallback, dedup, reminders, quiet hours, preferences and consent, delivery log.

**Out**
- OTP generation/verification and sessions (05). OTP *delivery* reuses the channel layer but with its own priority queue.
- Booking state machine and slot validity (06).
- Zalo OA inbox, ZNS template approval, Zalo Login (09).
- Admin UI screens beyond moderation queue contract (12).
- Marketing campaigns / promotions engine (future; only consent plumbing here).

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Delete their account" conflicts with "keep historical bookings consistent" and salon CRM records. | Deletion = anonymization of the User + Customer identity (name, phone, email, avatar → tombstone), bookings kept with snapshot fields scrubbed; CustomerSalonProfile keeps salon-entered data only if the salon has an independent legal basis — default: anonymize, keep aggregated visit counts. 30-day grace period with cancel option; active future bookings must be cancelled first (auto-cancel with salon notification). |
| G2 | App store rules: Apple 5.1.1(v) requires in-app deletion; Google Play requires a web deletion URL. Not mentioned. | In-app flow on iOS/Android + public web page `/[locale]/account/delete` (works for logged-out users via OTP). |
| G3 | "Request personal data export" — no format, SLA, delivery. | Async job builds JSON + human-readable HTML zip, stored in private S3 with 7-day signed URL, notified via email/push/in-app. Rate limit 1 per 24h. |
| G4 | Review "editing policy" undefined. | Editable 14 days after posting or until salon responds, whichever first; edits keep history; rating change re-aggregates. Customer may delete own review (soft-delete, kept for moderation audit). Review window: 30 days after `completed`. |
| G5 | Fake/coerced reviews and salons self-reviewing not addressed. | Only booking-linked reviews (`booking_id` unique); booking must be `completed` and not `staff_created` for a phone that is a salon member; flag reviews where completion was set but customer never confirmed (ties to §17 verification). Display "Verified visit" badge. |
| G6 | Rating aggregation unspecified (mean? Bayesian?). | Store `rating_sum`, `rating_count` on salon (and staff) via transactional update; ranking (10) uses Bayesian average; display simple mean with count. Hidden/removed reviews excluded. |
| G7 | "Prevent duplicate notifications" — no mechanism. | Deterministic idempotency key per (event, entity, recipient, channel, variant) used as BullMQ `jobId` + unique index on `notification_delivery.idempotency_key`. |
| G8 | Reminders break on reschedule/cancel. | Reminder jobs keyed by `booking_id + offset + booking.version`; on reschedule/cancel remove scheduled jobs and enqueue new ones; worker re-checks booking state & version at send time (stale → drop). |
| G9 | No quiet hours; Vietnam Decree 91/2020 restricts advertising messages (consent, 7:00–22:00, frequency caps). | Two message classes: **transactional** (booking lifecycle, OTP, security) and **marketing**. Marketing requires explicit opt-in per channel, quiet hours 21:00–08:00 salon-local by default, frequency cap. Transactional respects quiet hours only for non-urgent items (review requests deferred to morning). Legal review required before marketing launch — we don't claim compliance. |
| G10 | Channel fallback order and cost not defined; SMS/ZNS cost money. | Per-event channel policy (see §4.3). Default chain for customer transactional: push → in-app always; ZNS (if enabled) → SMS only for critical events (confirmation, cancellation by salon, 2h reminder) when push undeliverable. Email only if verified email exists. |
| G11 | Salon-side recipients (owner/receptionist/staff) not modelled. | Recipients resolved by role + permission (05) per salon; salon members have their own preferences; "new booking" goes to members with `bookings.read` for that staff/salon. |
| G12 | Push token lifecycle missing. | `PushDevice` table (user, platform, Expo push token, locale, last_seen); prune on `DeviceNotRegistered` receipts; tokens tied to session, removed on logout. |
| G13 | Locale of a notification ambiguous. | Recipient's preferred language; fallback to salon default, then `vi`. Times rendered in the **salon's** timezone with explicit label when recipient tz differs. |
| G14 | Web push not mentioned. | Web gets in-app notifications + email in MVP; Web Push (VAPID) deferred. |
| G15 | Favourite services mentioned but not modelled. | `Favorite` polymorphic-free: separate nullable FKs `salon_id` / `service_id` with check constraint exactly one set; unique per user. |

## 3. Refined requirements

### 3.1 Customer account
- R1 Profile: name, phone (verified, change requires OTP on new number), optional email (verification link), avatar (media 04), preferred language, preferred location (Location id 10), notification preferences.
- R2 Guest browsing everywhere public; booking, favorites, reviews require verified phone.
- R3 Booking history: upcoming (sorted asc) and past (desc), cursor-paginated; each item shows snapshot price/duration, "Pay at the salon", status, actions allowed by 06 transition rules.
- R4 Favorites: toggle salon/service, list with availability teaser; idempotent PUT/DELETE.
- R5 Deletion: request → confirm via OTP → 30-day pending → anonymization job. Cancelling the request restores. Audit-logged.
- R6 Export: request → job → notification with signed link; includes profile, bookings, reviews, favorites, consents, notification log (last 12 months).
- R7 Consent records: per purpose (`marketing_push`, `marketing_sms`, `marketing_zalo`, `marketing_email`, `analytics`) with timestamp, source, policy version; revocable.

### 3.2 Reviews
- R8 Create: 1–5 stars required, text optional (max 2,000 chars), up to 5 photos (media 04, moderated), only for own `completed` booking within 30 days, one per booking (DB unique).
- R9 Edit/delete per G4; full edit history in `ReviewRevision`.
- R10 Salon response: one public response per review by owner/manager (permission `reviews.respond`), editable, audit-logged.
- R11 Report: any logged-in user or salon may report with reason enum (`spam`, `offensive`, `fake`, `personal_info`, `irrelevant`, `other`); 3+ distinct reports auto-hide pending moderation.
- R12 Moderation states: `published`, `pending_review`, `hidden`, `removed`; transitions logged with actor & reason; customer notified on removal.
- R13 AI-assisted moderation (optional, feature-flagged): classifier pass on create/edit for toxicity, PII (phone numbers, addresses), spam; outputs a *suggestion* + confidence. Auto-action only to `pending_review`, never to `removed`. Human moderator decides. Review text treated as untrusted input.
- R14 Review request notification sent after completion (deferred to 10:00–20:00 local), at most one reminder after 3 days.

### 3.3 Notifications
- R15 Event catalog (initial): `booking.created`, `booking.confirmed`, `booking.cancelled_by_customer`, `booking.cancelled_by_salon`, `booking.rescheduled`, `booking.reminder` (variants `24h`, `2h`), `booking.completed`, `booking.no_show`, `review.requested`, `review.responded`, `review.removed`, `salon.booking_received`, `salon.booking_cancelled`, `staff.invited`, `staff.schedule_changed`, `account.deletion_scheduled`, `account.export_ready`.
- R16 Producers publish domain events via an outbox table inside the same DB transaction as the state change (no lost or phantom notifications).
- R17 Channels: `push` (Expo Push Service → APNs/FCM), `in_app` (DB + realtime fetch), `email` (provider adapter, e.g. SES/Resend), `sms` (brandname SMS provider adapter, VN providers), `zns` (adapter supplied by 09). All behind one `ChannelProvider` interface.
- R18 Per-event channel policy, user preferences, consent, and quiet hours decide the channel plan; plan is persisted for traceability.
- R19 Reminder offsets configurable per salon (defaults 24h and 2h), bounded list (max 3, min 30 min).
- R20 Delivery log with status (`queued`, `sent`, `delivered`, `failed`, `skipped` + reason) and provider message id; retained 12 months.
- R21 Templates per event × channel × locale stored in `NotificationTemplate` (seeded from repo files, versioned); variables validated with Zod; missing vi or en template fails CI.
- R22 No marketing messages without consent; every marketing message carries opt-out.

## 4. Proposed technical approach

### 4.1 Modules (NestJS)
`customers`, `favorites`, `reviews`, `moderation`, `notifications` (core), `notification-channels/*` (push, email, sms; zns lives in 09's module implementing the same interface), `privacy` (deletion, export, consent).

### 4.2 Pipeline
```
domain tx → outbox row → outbox relay (poll/LISTEN) → queue "notify.dispatch"
  → Planner: resolve recipients, locale, prefs, consent, quiet hours → ChannelPlan
  → per channel job "notify.send.<channel>" (jobId = idempotency key)
  → Provider adapter → delivery log → receipts job (push receipts, SMS DLR)
  → on failure per policy: retry with backoff, then next channel in fallback chain
```
- Queues: `notify.dispatch`, `notify.send.push|email|sms|zns|in_app`, `notify.receipts`, `notify.reminders` (delayed jobs), `privacy.export`, `privacy.anonymize`, `moderation.ai`. Separate high-priority queue `otp.send` (owned by 05, same adapters).
- Idempotency key: `sha256(event_type|entity_id|entity_version|recipient_id|channel|variant)`.
- Reminders: delayed BullMQ jobs scheduled at booking create/reschedule; plus a nightly reconciliation cron that rebuilds missing reminders for the next 48h (guards against Redis loss).
- Rate limiting per provider via BullMQ limiter; circuit breaker marks provider degraded → fallback.

### 4.3 Default channel policy (customer)
| Event | Primary | Fallback (if primary undeliverable) | Class |
|---|---|---|---|
| booking.confirmed / created | push + in_app | zns → sms | transactional, critical |
| booking.cancelled_by_salon | push + in_app | zns → sms | transactional, critical |
| booking.rescheduled | push + in_app | zns → sms | transactional, critical |
| booking.reminder 24h | push + in_app | zns | transactional |
| booking.reminder 2h | push | zns → sms | transactional, critical |
| review.requested | push + in_app | email | transactional, deferrable |
| account.* | in_app + email | push | transactional |
Salon members: push + in_app; email digest optional. Policies live in config (DB-overridable by admin, 12).

### 4.4 Data (coordinate with 04)
`Notification` (in-app inbox item), `NotificationDelivery`, `NotificationTemplate`, `NotificationPreference` (user × event-category × channel), `PushDevice`, `ConsentRecord`, `OutboxEvent`, `Review`, `ReviewRevision`, `ReviewPhoto`, `ReviewResponse`, `ReviewReport`, `ModerationAction`, `Favorite`, `DataExportRequest`, `AccountDeletionRequest`.

### 4.5 Frontend (apps/app)
Features: `features/account`, `features/favorites`, `features/reviews`, `features/notifications` (inbox, preferences screen). Expo Notifications for token registration (request permission after first booking, not on launch), notification tap → deep link (13). All strings via localization (03).

## 5. Acceptance criteria
1. Booking confirmation creates exactly one push + one in-app item per recipient even if the event is published twice or the worker crashes mid-send (integration test with duplicate outbox replay).
2. Rescheduling a booking removes old reminders; no reminder is sent for the old time (test with fake clock).
3. Cancelled booking → no pending reminder sends (worker version check test).
4. Push token marked `DeviceNotRegistered` is pruned and the critical event falls back to ZNS/SMS when enabled.
5. Marketing send without consent is skipped with reason `no_consent`; quiet-hour send is deferred.
6. Every event × channel × locale in the catalog has vi and en templates; CI test fails otherwise; variable schemas validated.
7. Customer cannot review a booking that is not theirs, not completed, older than 30 days, or already reviewed (API returns 403/409; DB unique enforced).
8. Edit after salon response is rejected; revision history stored.
9. Three distinct reports auto-hide a review; moderator restores it; actions audit-logged.
10. Deletion request → OTP → after grace period PII fields are anonymized, bookings remain with salon, login impossible; web deletion page works logged out.
11. Export job produces a downloadable archive within 15 min (staging) and link expires after 7 days.
12. Internal salon notes never appear in exports, notifications, or review responses (test).
13. All flows pass in vi and en (Playwright for web, notification template snapshot tests).

## 6. Dependencies
- 03 localization (template dictionaries, date/VND formatting).
- 04 schema, outbox, media.
- 05 auth/OTP, roles & permissions, audit log, consent legal basis.
- 06 booking events and versioning, cancellation/reschedule rules.
- 07 CRM shows notification log per booking; salon notification settings UI.
- 08 AI agent tools (below) and AI moderation model access.
- 09 ZNS/OA channel provider implementing `ChannelProvider`.
- 10 rating aggregates for ranking.
- 12 admin moderation queue, feature flags, channel policy overrides, analytics events.
- 13 push credentials (APNs/FCM via EAS), deep links, CI.

## 7. Suggested sub-milestones
1. M11.1 Notification core: outbox, planner, in-app channel, templates + CI coverage test.
2. M11.2 Push channel (Expo), device registry, receipts; booking lifecycle events.
3. M11.3 Reminders with reschedule/cancel correctness + reconciliation cron.
4. M11.4 Email + SMS adapters, fallback chain, provider rate limits; ZNS slot wired for 09.
5. M11.5 Preferences + consent + quiet hours.
6. M11.6 Reviews create/edit/respond/report + aggregation.
7. M11.7 Moderation queue + optional AI-assisted classifier.
8. M11.8 Account deletion, data export, web deletion page.

## 8. AI-first deliverables
- Subagent: `.claude/agents/customer-notifications.md`.
- Skill: `.claude/skills/notification-event/SKILL.md` (add an event end-to-end). Future skills to add when code lands: `review-moderation` (moderation states, AI suggestion handling), `privacy-request` (deletion/export changes).
- Domain doc: `docs/domains/customer-notifications.md` (skeleton now; filled as code lands).
- ADRs to write: outbox vs direct enqueue; review edit policy; deletion = anonymization.

## 9. Product AI-agent surface (for 08)
| Tool | R/W | Input → Output | Permission | Notes |
|---|---|---|---|---|
| `reviews.summary` | R | salonId, period → avg rating, count, distribution, trend | `reviews.read` | tenant-scoped |
| `reviews.list` | R | salonId, filters(rating, unanswered, period), cursor → reviews | `reviews.read` | review text is untrusted input |
| `reviews.draftResponse` | W (draft only) | reviewId, tone, locale → draft text | `reviews.respond` | never auto-posts; human publishes |
| `notifications.deliveryStats` | R | salonId, period → sent/failed by channel, reminder no-show correlation | `analytics.read` | |
| `notifications.bookingLog` | R | bookingId → delivery timeline | `bookings.read` | |
| `reminders.settings.get` / `.update` | R / W | salonId, offsets | `settings.manage` | update requires explicit confirmation |
Customer-facing agent tools are out of scope for MVP.

## 10. Open questions for the product owner
1. SMS provider and budget: brandname SMS needs registration per brand — GuGu brand only, or per-salon brandnames later?
2. Should ZNS (paid per message) be paid by GuGu in MVP or count against salon subscription quota?
3. Review window 30 days and edit window 14 days — acceptable?
4. Should salons be able to dispute/flag reviews with priority, and may verified salons hide reviews? (Recommendation: no hiding, only reporting.)
5. Email provider preference (SES in Singapore region vs Resend/Postmark)?
6. Do we keep CustomerSalonProfile notes after a customer deletes their account (salon's own records) — needs legal review under Decree 13/2023.
7. AI moderation: allowed to send review text to an external LLM provider? Needs privacy notice update.
