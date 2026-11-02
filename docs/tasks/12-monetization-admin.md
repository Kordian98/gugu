# 12 — Monetization, attribution, platform admin, analytics

Covers master prompt sections 17 (booking attribution & monetization), 18 (platform admin), 27 (analytics & product metrics), plus the extra requirements: subscription plans and entitlements that gate the AI business agent (topic 08) and Zalo features (topic 09), usage metering, and an optional admin-side AI assistant.

Status: spec. No code exists yet.

---

## 1. Scope

### In
- **Attribution:** one `BookingAttribution` per booking, first-visit detection, commission eligibility.
- **Commission foundation:** configurable `CommissionRule`, an append-only `CommissionLedger`, a status machine and disputes. **No automatic charging.**
- **Subscriptions & entitlements:** plans, per-salon subscriptions, an entitlement resolver, feature gating, manual (admin-assigned) plans for MVP.
- **Usage metering:** AI agent tokens and requests, Zalo template messages (ZBS Template Message, channel `zalo_template`), SMS messages **and SMS cost per salon** (international provider), staff seats, promoted-listing impressions, with quotas and soft/hard limits.
- **Promoted listings foundation:** data model plus the ranking hook only, with clear "Sponsored" labeling.
- **Feature flags:** global, per salon, per user, percentage rollout; managed in admin.
- **Platform admin experience** (section 18), including the trust tooling from section 17 (disputes, suspicious-activity detection, salon reliability metrics).
- **Analytics:** event taxonomy, consent-aware client and server tracking, platform metrics (section 27), and salon-facing metric definitions shared with topics 07 and 08.
- **Optional admin AI assistant** for support and moderation (read-mostly).

### Out (owned elsewhere)
- Salon dashboard UI and salon read models → topic 07. This topic only defines platform-level metrics and shared metric definitions.
- AI agent runtime, prompts and tool execution → topic 08. This topic provides entitlements, quotas and the metering API.
- Zalo / ZBS Template Message transport → topic 09. This topic meters and gates it.
- Auth, RBAC primitives, audit log infrastructure → topic 05. This topic declares the admin permissions it needs.
- Booking state machine → topic 06. This topic subscribes to its status events.
- Online card billing, invoices and payment processor integration → **deferred** until the business model is validated (see §4.3).

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "New to the salon" is undefined: what about walk-ins already in the salon's CRM, imported customers, or the same phone number under different accounts? | A customer is new when **no** `CustomerSalonProfile` with a prior completed visit exists **and** the phone number (normalized E.164) does not match any salon-imported or manually created CRM record created before the attribution timestamp. Imported CRM contacts are never "new". |
| G2 | Attribution source is per booking, but commission depends on "acquired by GuGu". `direct_link`, `qr_code` and `staff_created` are salon-driven, not GuGu-driven. | Every source maps to exactly one **acquisition class**, `gugu_acquired` or `salon_acquired` (table in §3.1a). Only `gugu_acquired` + new customer + completed counts as commission-eligible by default. Configurable per rule. |
| G3 | Source detection mechanism is unspecified. | Last-non-direct-touch within a **30-day window** (configurable). Capture UTM/`ref` parameters, the deep-link `src` parameter and QR codes `?src=qr&s=<salonId>` on the client, persist them in an `attribution_touch` (cookie / SecureStore), and send them with the booking. The server decides the final source. The attribution window also needs a cookie-consent decision → topic 05. |
| G4 | Sources were added independently by 06, 07, 09 and 12 (roadmap X6). | **Topic 12 owns the single `BookingSource` enum** (§3.1a), defined in `packages/contracts` and mirrored as a Postgres enum. Other topics reference it and never redefine it. Extensible via migration only, never free text. |
| G5 | Commission statuses exist, but the transition and trigger rules do not. | State machine in §3.2. Entries are created in `pending` only when the booking reaches `completed` and the dispute window has opened. Cancelled bookings and no-shows produce `not_applicable` records (kept for audit). |
| G6 | "Customer can confirm the appointment" has no UX or rules defined. | After `completed`, the customer gets a "Did your visit happen?" prompt (push / in-app / Zalo template) for 72 h. Possible outcomes: `confirmed_by_customer`, `disputed_by_customer`, `no_response`. Feeds reliability metrics and moves commission `pending → confirmed` after the dispute window (default 7 days). |
| G7 | "Suspicious activity detection" is undefined. | Rule-based MVP signals: bookings completed with zero customer app activity, completion rate far above the salon median, the same device or phone across many "new" customers, customer accounts created by the salon IP, bursts of marketplace bookings cancelled and re-created as `staff_created` (commission evasion), and the reverse (fake marketplace bookings). Signals produce `RiskSignal` rows, which admins review. No automatic penalties in MVP. |
| G8 | Subscriptions entity exists, but no plan, entitlement or quota model. | `Plan`, `PlanEntitlement`, `Subscription`, `EntitlementOverride` and `UsageCounter` (§3.3). Code checks **entitlement keys**, never plan names. |
| G9 | The AI agent and Zalo are gated by subscription with no metering. | Metered keys: `ai.requests`, `ai.tokens.input`, `ai.tokens.output`, `zalo_template.messages`, `sms.messages`, `sms.cost`. Topics 08, 09 and 11 call `UsageService.reserve()` / `commit()` (§3.4). |
| G10 | "Do not implement billing complexity" vs. "subscription management" in admin. | MVP: there is no Vietnamese entity yet. Subscriptions are **invoiced manually by GuGu's foreign entity** (bank transfer / international invoice issued outside GuGu), and admin activates plans by hand. No processor. `Subscription.billingMode = manual`, `invoicingEntity = foreign`. A future `billingProvider` field exists but stays unused. |
| G11 | Promoted listings have no transparency requirement. | Promoted results MUST be labeled "Được tài trợ / Sponsored", capped per page, and never override search filters. Impressions and clicks are logged for billing later. Consumer-protection advertising labeling is flagged for legal review. |
| G12 | Analytics tool not chosen; consent model vague. | Proposal: **PostHog** (self-hosted or EU/US cloud; data residency is an open question), behind an internal `analytics` package abstraction so it can be swapped. Server-side events for business facts (booking_completed etc.) are the source of truth; client events are behavioral and consent-gated. |
| G13 | Platform metrics need definitions (what does "active" mean?). | Metric dictionary in §3.6, shared with the topic 08 semantic layer. A single definition per metric, versioned. |
| G14 | Admin "feature flags" has no model or evaluation location. | Flags are evaluated on the server and exposed to the client via `/api/v1/me/flags` (cached). PostHog flags are not used, so flags keep working without analytics consent. |
| G15 | Admin actions lack a safety model (impersonation, suspension). | All admin mutations require a reason, are audit logged, and high-risk ones (suspend salon, waive ledger, change plan price, impersonate) require `super_admin`. Impersonation is read-only in MVP, time-boxed and visibly bannered. |
| G16 | Revenue figures from analytics could be mistaken for processed payments. | Every money metric carries `RevenueKind = estimated_from_bookings \| recorded_offline_sale \| reported_by_salon` (roadmap X5). The enum is **owned by topic 07** in `packages/domain/metrics`; this topic imports it. Kinds are never summed without a label, and UI and the AI agent must render the label. |
| G17 | No admin-side AI assistance despite the AI-first goal; product-owner rule says no personal data may go to any LLM. | Optional, low-priority **Admin Copilot** (§3.8), limited to aggregate/tokenised platform analytics. No PII, no review or dispute text, no write actions. Support, moderation and dispute work stays human. |

---

## 3. Refined requirements

### 3.1 Attribution
- R-A1: Exactly one `BookingAttribution` per booking, created in the same transaction as the booking (topic 06 calls `AttributionService.attach(tx, booking, touch)`).
- R-A2: Fields: `bookingId`, `salonId`, `customerId`, `source` (enum), `channelDetail` (jsonb: utm, ref, qrId, campaignId, promotedListingId), `isNewCustomerToSalon`, `newCustomerBasis` (enum explaining why), `attributedAt`, `commissionEligible`, `eligibilityReason`, `ruleId` (nullable), `touchFirstSeenAt`.
- R-A3: Attribution is immutable after creation. Corrections happen via admin with an audit entry and a new revision row (`BookingAttributionRevision`).
- R-A4: `isNewCustomerToSalon` is computed server-side per G1 while holding the booking transaction, and its basis is stored.
- R-A5: Attribution metadata is **internal**. It is never returned to customers, and salons see only the `source` label and the `isNew` flag, not the raw UTM data or the eligibility reasoning beyond the status.

### 3.1a Booking source enum (owned by topic 12, roadmap X6)

Single source of truth: `BookingSource` in `packages/contracts` (Zod enum + Postgres enum `booking_source`) and `acquisitionClassOf(source)` in `packages/domain/attribution`. Topics 06, 07, 09 and 10 import it and never redefine it. Adding a value requires a migration, an i18n label (vi/en), a mapping row below, and an entry in the `entitlements`/`analytics-event` skill tables.

| Source | Meaning | Acquisition class |
|---|---|---|
| `marketplace` | Booked after discovery in GuGu search, home or category pages | `gugu_acquired` |
| `promoted_listing` | Booked from a sponsored placement | `gugu_acquired` |
| `gugu_campaign` | GuGu-run campaign (UTM `gugu_*`, GuGu social, referral) | `gugu_acquired` |
| `zalo_mini_app` | Booked inside GuGu's Zalo Mini App via its discovery | `gugu_acquired` |
| `salon_profile` | Landed directly on the salon's profile with no GuGu discovery touch in the window | `salon_acquired` |
| `direct_link` | Salon's own shared link / booking URL | `salon_acquired` |
| `qr_code` | Salon's QR code (in-store, flyer) | `salon_acquired` |
| `social_media` | Salon's own social posts (Facebook, TikTok, Instagram) | `salon_acquired` |
| `zalo_oa` | Salon's Zalo Official Account (menu, broadcast) | `salon_acquired` |
| `zalo_link` | Salon's zalo.me link or Zalo share | `salon_acquired` |
| `zalo_chat` | Booked by staff from a Zalo conversation in the CRM inbox | `salon_acquired` |
| `phone` | Customer phoned the salon; staff entered it | `salon_acquired` |
| `walk_in` | Walk-in entered at the desk | `salon_acquired` |
| `staff_created` | Other manual staff entry | `salon_acquired` |
| `repeat_customer` | Rebooking by an existing client (rebook button, history) | `salon_acquired` (never "new") |
| `ai_agent` | Created by the salon's AI business agent on staff instruction | `salon_acquired` |

Rules:
- A `zalo_mini_app` booking that entered through a salon-shared Mini App link is classified as `zalo_link` (the server decides from `channelDetail.entry`).
- When both a GuGu discovery touch and a salon touch fall in the window, last non-direct touch wins (G3).
- Commission rules may override the class per source, but the default rule set uses only `gugu_acquired`.

### 3.2 Commission
- R-C1: `CommissionRule` holds `scope` (global | plan | salon), `sources[]`, `requiresNewCustomer`, `basis` (`flat_vnd` | `percent_of_estimated_value`), `amount`, `capVnd`, `oncePerCustomerPerSalon` (default true), `disputeWindowDays` (default 7), `activeFrom/To`, `version`. Rules are versioned, and ledger entries reference the rule version.
- R-C2: The default seed rule is **inactive**, so commission is off at launch. Admin can enable it per plan or salon.
- R-C3: `CommissionLedger` is append-only. Status changes are new rows (`CommissionLedgerEvent`), and the current status lives on `CommissionLedgerEntry`. Amounts are stored in VND as integer `bigint`.
- R-C4: Status machine:
  - `not_applicable` (terminal) when a booking is cancelled, a no-show, ineligible, or a rule is absent.
  - `pending → confirmed` when the dispute window ends with no dispute.
  - `pending → disputed` on a salon or customer dispute.
  - `disputed → confirmed | waived` on an admin decision.
  - `pending | confirmed → waived` on an admin decision (reason required).
  - `confirmed → paid` set manually by admin when the salon pays offline.
- R-C5: No automatic charging, invoicing or dunning. `paid` is a manual bookkeeping flag.
- R-C6: If a booking moves `completed → (reverted)`, which topic 06 must define as an admin-only correction, a `pending` entry becomes `not_applicable` and a `confirmed` entry becomes `disputed`.
- R-C7: Salons see their own ledger (read-only) and can dispute an entry with a reason within the window.

### 3.3 Plans, subscriptions, entitlements
- R-S1: `Plan` holds `code`, localized name and description, `priceVnd` (display only), `interval`, `isPublic`, `version`.
- R-S2: `PlanEntitlement(planId, key, valueType, value)`, where `valueType ∈ {boolean, limit, enum}`. Initial keys:
  - `booking.marketplace_listing` (bool, free: true)
  - `staff.max_seats` (limit)
  - `crm.customer_tags`, `crm.internal_notes` (bool)
  - `analytics.advanced` (bool)
  - `ai.agent.enabled` (bool), `ai.agent.monthly_requests` (limit), `ai.agent.monthly_tokens` (limit), `ai.agent.write_actions` (bool)
  - `zalo.oa_connect` (bool), `zalo.inbox` (bool), `zalo_template.monthly_messages` (limit), `zalo.mini_app` (bool)
  - `notifications.sms.monthly_messages` (limit), `notifications.sms.monthly_cost_cap_vnd` (limit)
  - `promotion.promoted_listing` (bool)
  - `branding.custom_subdomain` (bool, future)
- R-S3: `Subscription(salonId, planId, planVersion, status ∈ {trialing, active, past_due, cancelled, expired}, billingMode = manual, invoicingEntity = foreign, currentPeriodStart/End, trialEndsAt)`. Each salon has exactly one current subscription. The free plan is assigned at salon registration.
- R-S4: `EntitlementOverride(salonId, key, value, expiresAt, reason, createdBy)` supports admin grants and pilots.
- R-S5: The resolver `EntitlementService.get(salonId, key)` returns override if present, otherwise plan, otherwise default. Results are cached in Redis with a 60 s TTL and invalidated on change. A **NestJS guard/decorator** `@RequiresEntitlement('ai.agent.enabled')` exists, and the client gets `/api/v1/salons/:id/entitlements` for UI gating, which is for display only. The backend always enforces.
- R-S6: Downgrades never delete data. Over-limit resources become read-only (for example, extra staff seats are kept but cannot take new bookings until the salon is back within the limit, with a grace period of 14 days).

### 3.4 Usage metering
- R-U1: `UsageCounter(salonId, key, periodStart, used)` holds the aggregate, and `UsageEvent` (append-only, partitioned monthly) holds the raw entries with `idempotencyKey`.
- R-U2: API: `reserve(salonId, key, amount, idemKey)` returns allow or deny along with the remaining amount, `commit(reservationId, actualAmount)` and `release(reservationId)`. AI tokens are reserved by estimate and committed with the actual usage reported by the Claude API. Counters are kept atomically in Redis and flushed to Postgres by a BullMQ job. Postgres is authoritative for reporting.
- R-U3: Soft limit at 80% triggers a notification to the owner. Hard limit means deny with error `ENTITLEMENT_QUOTA_EXCEEDED` (localized). Transactional booking messages (Zalo template, SMS) may fall back to push/email instead of failing the booking (topic 11 fallback order).
- R-U4: Cost tracking per unit (`unitCost` + `costCurrency` snapshot, converted to VND with a stored FX rate) enables margin reporting in admin. **SMS goes through an international provider, so SMS cost is metered per salon per message** (`sms.cost`, using the provider's per-message price and segment count). Zalo template sends are metered the same way (`zalo_template.messages` + cost).

### 3.5 Feature flags
- R-F1: `FeatureFlag(key, description, defaultValue, rules jsonb)`. Rules target environment, salonId, userId, role, plan, locale, platform (ios/android/web), app version, and percentage (sticky hash).
- R-F2: Flags are evaluated on the server, and a flag bundle is served to the client and cached with an ETag. Every flag change is audit logged.
- R-F3: Flags are for rollout, entitlements are for commercial gating. Code must not use one for the other.

### 3.6 Analytics & metrics
- R-AN1: `packages/analytics` holds a typed event catalog (Zod schemas). A single `track(event, props)` API is used by client and server, and unknown events fail type-checking.
- R-AN2: Client events (`app_opened`, `search_performed`, `salon_viewed`, `service_viewed`, `booking_started`, `favorite_added`) are sent only after analytics consent. Consent state lives in topic 05/11 preferences. Without consent, the client sends nothing (no fingerprinting).
- R-AN3: Business events (`booking_completed`, `booking_cancelled`, `review_submitted`, `salon_registered`, `salon_verified`, `service_created`, `staff_invited`, `booking_received`) are emitted **server-side** from domain events through an outbox. They also feed the internal metrics tables. Product-analytics forwarding of these events uses pseudonymous IDs only.
- R-AN4: PII rules: no phone, email, names, notes or review text in event properties. `userId` is a salted hash in the external tool. A deny-list linter runs in CI.
- R-AN5: Metric dictionary (versioned, `docs/domains/monetization-admin.md#metrics` + code in `packages/domain/metrics`):
  - Active customer: ≥1 app session **or** booking in the last 30 days.
  - Active salon: ≥1 booking (any source) in 30 days **and** an active profile.
  - Activated salon: profile + ≥1 service + ≥1 staff schedule + first booking received.
  - Booking conversion: `booking_completed_flow / booking_started`.
  - Search-to-booking: sessions with search → booking within the same session or 24 h.
  - Repeat booking rate: customers with ≥2 completed at the same salon within 90 days ÷ customers with ≥1.
  - Cancellation rate and no-show rate: by booking count, split by who cancelled.
  - Retention: monthly cohorts by first completed booking.
  - Supply/demand: searches with zero available results by area and category; available slots vs. booked slots by area.
- R-AN6: Platform metrics are computed by nightly + hourly BullMQ jobs into `metric_daily` rollup tables (Postgres), not by querying raw events at request time.

### 3.7 Platform admin (section 18)
- R-AD1: Routes under `app/[locale]/(admin)/` on web. They are not exposed in the native app navigation. The API is under `/api/v1/admin/*` with `platform:*` permissions (topic 05).
- R-AD2: Modules: salons (list, detail, verify, suspend/unsuspend, plan and overrides, reliability score), customers, staff directory, bookings overview (read-only + admin correction with reason), review & photo moderation queues, categories and taxonomy, locations (topic 10 model), disputes, risk signals, commission rules and ledger, plans and subscriptions, usage and costs, notifications (templates, delivery logs), audit log viewer, feature flags.
- R-AD3: Every mutation requires `reason`, writes `AuditLog` (actor, action, target, before/after diff, ip, userAgent) and is idempotent.
- R-AD4: Permission split: `support_admin` can read everything except money configuration and can moderate content and handle disputes up to a recommendation. `super_admin` can do everything, including plan/price/rule changes, suspensions, waivers and impersonation.
- R-AD5: Salon reliability score (internal, 0–100): customer confirmation rate, dispute rate, risk signals, cancellation-by-salon rate and response time. Shown only to admins. Never shown publicly in MVP.
- R-AD6: Lists are server-paginated, filterable and exportable (CSV). Export of PII requires super_admin and is audit logged.

### 3.8 Admin Copilot (optional, low priority, behind flag `admin.copilot`)
Product-owner rule: **no personal data may be sent to any LLM** for now. The copilot is therefore restricted to aggregate and tokenised platform data. It answers platform-analytics questions ("active salons by province this month", "no-show rate trend for nails", "which plans are hitting the AI quota") and does nothing else.
- R-CP1: Same agent runtime as topic 08, with a separate tool set and system prompt. Allowed tools, all read-only and returning aggregates only: `admin.getPlatformMetric` (metric dictionary §3.6), `admin.getSupplyDemand` (by area/category), `admin.getUsageAndCost` (by plan/key), `admin.getQueueCounts` (moderation, dispute and risk-signal counts by type/age, no content).
- R-CP2: Entities appear only as opaque tokens (`salon_7f3a…`, a per-session HMAC of the ID). Names, phone numbers, emails, addresses, staff and owner details, review text, dispute text, customer messages and salon descriptions are **never** included. The admin UI resolves tokens back to records locally, outside the LLM.
- R-CP3: Small groups are suppressed: any aggregate cell with fewer than 5 underlying customers or bookings is returned as `<5` so individuals cannot be re-identified.
- R-CP4: There are no write actions and no proposals that name individuals. The copilot can never change permissions, flags, plans or rules.
- R-CP5: An outbound PII guard (shared with topic 08) scans every prompt and tool result before it is sent to the LLM and blocks the call on detection of phone/email/name patterns or of fields not on the allow-list. Blocks are audit logged.
- Removed from scope (they need personal data or free text): salon search by name, salon-health lookups by name, dispute summaries and moderation-content triage. These stay human workflows in the admin UI until the LLM data policy changes.

---

## 4. Proposed technical approach

### 4.1 Modules (NestJS, inside the modular monolith)
- `modules/attribution` → `AttributionService`, subscribes to `booking.created` (in-transaction hook) and `booking.status_changed`.
- `modules/commission` → rules, ledger, dispute window job (BullMQ repeatable `commission.close-dispute-windows`).
- `modules/subscriptions` → plans, subscriptions, `EntitlementService`, guard and decorator.
- `modules/usage` → metering, Redis counters, flush job.
- `modules/feature-flags` → evaluator, admin CRUD.
- `modules/analytics` → outbox consumer, forwarder, rollup jobs.
- `modules/trust` → customer confirmation, risk signals, reliability score.
- `modules/admin` → thin BFF over the above. It holds no business logic of its own.

Domain events flow through a transactional outbox table (owned by topic 04) to BullMQ. This avoids losing analytics or commission events on crash.

### 4.2 Data (additions to topic 04 schema; names indicative)
`BookingAttribution`, `BookingAttributionRevision`, `AttributionTouch` (optional server copy), `CommissionRule`, `CommissionLedgerEntry`, `CommissionLedgerEvent`, `CommissionDispute`, `Plan`, `PlanEntitlement`, `Subscription`, `SubscriptionEvent`, `EntitlementOverride`, `UsageEvent` (partitioned), `UsageCounter`, `FeatureFlag`, `RiskSignal`, `SalonReliabilitySnapshot`, `CustomerVisitConfirmation`, `MetricDaily`, `PromotedListing`, `PromotedImpression` (partitioned). All tenant-owned rows carry `salonId`. Money is VND `bigint`. All tables use UUID PKs.

### 4.3 Billing deferral
There is no payment processor and no Vietnamese legal entity in MVP. Subscriptions are invoiced manually by GuGu's foreign entity. When the model is validated, add a `BillingProvider` port (candidates: an international processor billing from the foreign entity, or local VN gateways such as VNPay/MoMo/PayOS once a VN entity exists). Tax treatment of a foreign entity selling to Vietnamese salons (foreign contractor tax, VAT, e-invoicing) needs legal and tax review, which is listed as an open question.

### 4.4 Analytics stack
A `packages/analytics` facade with adapters: PostHog (client: `posthog-react-native` / `posthog-js`; server: `posthog-node`), plus a no-op adapter for tests and no-consent users. Exact SDK versions are to be verified at implementation time (topic 01). Internal metrics are always computed from Postgres, so the product works if the external tool is removed.

### 4.5 Why this shape
- Entitlement keys (not plan names) let pricing change without code changes.
- An append-only ledger + revisions gives the audit trail the trust model needs, given that GuGu cannot verify offline payments.
- Server-side business events keep metrics correct regardless of client consent and ad blockers.

---

## 5. Acceptance criteria

Attribution & commission
- [ ] Creating a booking always creates exactly one attribution row in the same transaction (integration test: forced failure after booking insert rolls back both).
- [ ] A marketplace booking by a customer with no prior visit at a salon with an active rule ends `completed` → ledger `pending` → after the dispute window, `confirmed` (time-travel test).
- [ ] Cancelled and no-show bookings never produce `pending`/`confirmed` entries.
- [ ] A second completed marketplace booking by the same customer at the same salon produces no second commission (`oncePerCustomerPerSalon`).
- [ ] A customer imported into the salon CRM before booking is not "new".
- [ ] The customer API never returns attribution fields (contract test on serializer).
- [ ] With the default seed, no ledger entry is ever created (rule inactive).

Entitlements & metering
- [ ] `@RequiresEntitlement` returns 403 `ENTITLEMENT_REQUIRED` with a localized message (vi/en) when the key is false.
- [ ] An AI request beyond `ai.agent.monthly_requests` is denied with `ENTITLEMENT_QUOTA_EXCEEDED`, and concurrent reservations never overshoot the limit (concurrency test, 50 parallel reserves).
- [ ] Usage commits are idempotent (the same idempotencyKey twice equals one count).
- [ ] An admin override takes effect within 60 s (cache invalidation test).
- [ ] A downgrade keeps all data, and over-limit staff cannot take new bookings after the grace period.

Flags
- [ ] Percentage rollout is sticky per user across sessions. The flag bundle works with analytics consent denied.

Analytics
- [ ] With consent off, zero network calls to the analytics endpoint (Playwright network assertion on web; unit test on native adapter).
- [ ] The CI linter fails if an event schema contains a property named like phone/email/name/note/text.
- [ ] Each metric in the dictionary has a unit test against a fixture dataset with a known expected value.

Admin
- [ ] Every admin mutation without `reason` is rejected. Every successful one writes an AuditLog with a before/after diff.
- [ ] `support_admin` cannot change plans, rules, prices or flags, and cannot impersonate (authorization tests).
- [ ] A salon user calling any `/admin/*` endpoint gets 403 (tenant/role test).
- [ ] Both locales render all admin screens with no missing keys (i18n coverage test, topic 03).

Admin Copilot (when enabled)
- [ ] Copilot tools return only aggregates and opaque tokens. A fixture test with seeded PII (names, phones, emails, review/dispute text) shows none of it in any prompt or tool result sent to the LLM. The PII guard blocks and audit-logs a deliberately leaky tool. Cells under 5 are suppressed.

---

## 6. Dependencies

| Topic | Needed from it |
|---|---|
| 04 | Outbox table, partitioning approach, migration conventions, the entities above added to the schema |
| 05 | Platform roles and permissions, audit log service, consent storage, impersonation primitive |
| 06 | `booking.created` in-transaction hook, status-change events, admin correction semantics (completed → reverted) |
| 07 | Salon-facing dashboards consume entitlements and the shared metric definitions; ledger view in salon settings |
| 08 | Calls `UsageService` and `EntitlementService`, reuses metric definitions and the agent runtime for the Admin Copilot |
| 09 | OA / Zalo template features gated by `zalo.*` / `zalo_template.*` keys; Zalo template sends metered (`zalo_template.messages`) |
| 10 | `PromotedListing` ranking hook and Sponsored label in search; location model for admin |
| 11 | Customer visit confirmation prompt, quota notifications, fallback channels |
| 03 | Localized plan names, error codes, admin UI strings |
| 13 | Rollup jobs scheduling, PostHog hosting decision, CI linter for event PII |

---

## 7. Suggested sub-milestones

1. **M12.1 Entitlements core:** Plan, PlanEntitlement, Subscription (free plan seeded), overrides, resolver, guard, client endpoint. Unblocks gating in 07/08/09.
2. **M12.2 Attribution:** touch capture on client, `AttributionService` inside the booking transaction, new-customer logic, serializer protection.
3. **M12.3 Analytics foundation:** event catalog, consent-aware facade, server outbox forwarding, PII linter.
4. **M12.4 Feature flags:** model, evaluator, client bundle.
5. **M12.5 Usage metering:** reserve/commit/release, Redis counters, flush job, quota notifications (needed before the AI agent beta).
6. **M12.6 Admin shell:** layout, salon/customer directories, verification, suspension, audit viewer.
7. **M12.7 Trust:** customer visit confirmation, risk signals, reliability score, dispute flow.
8. **M12.8 Commission foundation:** rules, ledger, dispute-window job, salon ledger view, admin ledger. Shipped inactive.
9. **M12.9 Metrics rollups + platform analytics dashboard.**
10. **M12.10 Moderation, taxonomy, locations, notification admin.**
11. **M12.11 Promoted listings foundation** (data + ranking hook + labeling, no billing).
12. **M12.12 Admin Copilot** (optional, behind flag, aggregate/tokenised data only; lowest priority).

---

## 8. AI-first deliverables

| Artifact | Path | Status |
|---|---|---|
| Task spec | `docs/tasks/12-monetization-admin.md` | this file |
| Domain doc | `docs/domains/monetization-admin.md` | skeleton |
| Subagent | `.claude/agents/monetization-admin.md` | created |
| Skill: gate a feature by plan | `.claude/skills/entitlements/SKILL.md` | created |
| Skill: add a tracked event | `.claude/skills/analytics-event/SKILL.md` | created |
| ADRs to write at implementation | `docs/adr/`: attribution window & model, entitlement keys vs plans, analytics vendor (PostHog) and data residency, append-only commission ledger | pending |

---

## 9. Product AI-agent surface

Tools exposed to the salon AI agent (topic 08). All are tenant-scoped to the caller's salon, Zod-typed and audit logged.

| Tool | R/W | Permission | Notes |
|---|---|---|---|
| `subscription.getCurrentPlan` | R | owner, manager | plan name, period, entitlements summary |
| `usage.getQuotaStatus` | R | owner, manager | AI / Zalo template / SMS used vs limit, plus SMS cost, this period |
| `attribution.getAcquisitionBreakdown` | R | owner, manager | bookings by source, new vs returning, date range. No raw UTM |
| `commission.listLedgerEntries` | R | owner | status + amount. Only if commission is active for the salon |
| `commission.openDispute` | W, **confirm** | owner | requires explicit user confirmation in UI |
| `metrics.get` | R | role-scoped | shared metric dictionary (repeat rate, no-show rate, cancellation rate, utilization) with `RevenueKind` labels (enum owned by 07) |

Admin Copilot tools (platform roles only): see §3.8. They are aggregate/tokenised only and never exposed to salon agents.

**No-PII rule (product owner, applies to every tool above):** tools return counts, rates, amounts, statuses and opaque tokens only. No customer, staff or owner names, phone numbers, emails, notes, review or dispute text are ever placed in LLM context. `commission.listLedgerEntries` returns booking tokens, dates and amounts, not customer identities.

The agent MUST label all revenue figures by `RevenueKind` and MUST NOT describe them as payments processed by GuGu.

---

## 10. Open questions for the product owner

1. Are commissions planned at all in year 1, or only subscriptions? This affects whether M12.8 is in the MVP roadmap.
2. Initial plan lineup and prices (Free / Pro / Business?). Is the AI agent Pro+ only? Is there a free AI trial quota?
3. Is the Zalo template (ZBS Template Message) and SMS cost passed through to salons (metered add-on) or bundled into plans? SMS is via an international provider, so the per-salon cost is metered either way.
4. Subscription payment collection before a processor: bank transfer + manual activation acceptable?
5. With no Vietnamese entity, subscriptions are invoiced by a foreign entity. What are the obligations for VAT, foreign contractor tax and Vietnamese e-invoicing for B2B sales to Vietnamese salons, and can salons deduct the expense without a Vietnamese e-invoice? Needs legal and tax review before charging the first salon.
6. Analytics data residency: is self-hosted PostHog in our own region acceptable, or is a cloud region fine? Affects Decree 13 cross-border transfer assessment (topic 05).
7. Attribution window length (30 days proposed) and whether salon-owned links count as GuGu-acquired once a commission is introduced.
8. Should salons see their internal reliability score, or should it stay admin-only?
9. Is an aggregate-only Admin Copilot (platform metrics Q&A, no PII) worth building at all, or should it be dropped until the LLM data policy allows more?
10. Promoted listings: pricing model (CPM / CPC / flat weekly) to shape the impression/click data captured now.
