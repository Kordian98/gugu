# 12 — Monetization, attribution, platform admin, analytics

Covers master prompt sections 17 (booking attribution & monetization), 18 (platform admin), 27 (analytics & product metrics), plus the extra requirements: subscription plans and entitlements that gate the AI business agent (topic 08) and Zalo features (topic 09), usage metering, and a PII-free Admin Copilot.

Product-owner decisions applied (roadmap X13, X14, X17; tracker q21, q31–q37, q42, q43, q63, q64, q70, q73–q75): GuGu is primarily a salon SaaS. Revenue is **monthly/yearly SaaS subscriptions only**, on plans **Basic, Pro and Ultra**. There is **no free plan** (X17). Commissions come later (ledger kept dormant). The AI assistant and the monthly Opus business review are included **from Pro** (Pro and Ultra), with a hard cost cap per salon. AI onboarding import is in all three plans. New salons get a 14-day Pro trial (q75). The final entitlement matrix is R-S2a. GuGu pays for messaging inside the plan and tracks the costs. Analytics is **built in-house** on our Postgres, with no third-party tool. Salons see their reliability score. Promoted listings and star ratings are allowed at launch. The PII-free Admin Copilot ships in v1.

Status: spec. No code exists yet.

---

## 1. Scope

### In
- **Attribution:** one `BookingAttribution` per booking, first-visit detection, commission eligibility.
- **Commission foundation (dormant):** data model, an append-only `CommissionLedger`, a status machine and disputes are specified so attribution data is captured correctly from day one. **Not built for launch** (q34: commissions later). No automatic charging, ever.
- **Subscriptions & entitlements:** Basic, Pro and Ultra plans (no free plan; prices TBD), monthly and yearly intervals, per-salon subscriptions, an entitlement resolver, feature gating, manual (admin-assigned) plans for MVP.
- **Usage metering & cost caps:** AI agent tokens, requests and **cost per salon with a hard monthly cap** (q32), Zalo template messages (ZBS Template Message, channel `zalo_template`), SMS messages **and SMS cost per salon** (international provider). GuGu pays for messaging inside the plan (q33), so costs are tracked per salon for margin analysis. Also staff seats and promoted-listing impressions, with quotas and soft/hard limits.
- **Promoted listings (allowed at launch, q43):** data model, ranking hook, "Sponsored" labeling, impression/click logging and admin management. Placements are granted by admin (manual sale), with no self-serve ad billing.
- **Feature flags:** global, per salon, per user, percentage rollout; managed in admin.
- **Platform admin experience** (section 18), including the trust tooling from section 17 (disputes, suspicious-activity detection, salon reliability metrics).
- **Analytics, built in-house (q36, X14):** event catalog, consent-aware client ingest into our own `/api/v1/events` endpoint, server-side business events, an `analytics_event` table and rollups in our Postgres, platform metrics (section 27), and salon-facing metric definitions shared with topics 07 and 08. **No PostHog or any third-party analytics.**
- **Admin Copilot in v1 (q64),** PII-free: aggregate/tokenised platform analytics only (§3.8).

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
| G10 | "Do not implement billing complexity" vs. "subscription management" in admin. | MVP: subscriptions (monthly or yearly) are **invoiced manually** by the owner's company. Whether that is a Polish or a Vietnamese entity is still to be decided (q35). Payment is by bank transfer, the invoice is issued outside GuGu, and admin activates plans by hand. No processor. `Subscription.billingMode = manual`, `invoicingEntity ∈ {tbd, pl, vn}` (default `tbd`). A future `billingProvider` field exists but stays unused. |
| G11 | Promoted listings have no transparency requirement. | Promoted results MUST be labeled "Được tài trợ / Sponsored", **max 2 per search page** (q74), and never override search filters. Impressions and clicks are logged for billing later. Consumer-protection advertising labeling is flagged for legal review. |
| G12 | Analytics tool not chosen; consent model vague. | **Built in-house** (owner, q36): client events are batched to our own ingest endpoint, stored in a monthly-partitioned `analytics_event` table in Postgres and aggregated into rollups. No third-party analytics SDK or service, so no cross-border transfer to an analytics vendor. Server-side events for business facts (booking_completed etc.) are the source of truth; client events are behavioral and consent-gated. |
| G13 | Platform metrics need definitions (what does "active" mean?). | Metric dictionary in §3.6, shared with the topic 08 semantic layer. A single definition per metric, versioned. |
| G14 | Admin "feature flags" has no model or evaluation location. | Flags are evaluated on the server and exposed to the client via `/api/v1/me/flags` (cached). Flags do not depend on analytics, so they keep working without analytics consent. |
| G15 | Admin actions lack a safety model (impersonation, suspension). | All admin mutations require a reason, are audit logged, and high-risk ones (suspend salon, waive ledger, change plan price, impersonate) require `super_admin`. Impersonation is read-only in MVP, time-boxed and visibly bannered. |
| G16 | Revenue figures from analytics could be mistaken for processed payments. | Every money metric carries `RevenueKind = estimated_from_bookings \| recorded_offline_sale \| reported_by_salon` (roadmap X5). The enum is **owned by topic 07** in `packages/domain/metrics`; this topic imports it. Kinds are never summed without a label, and UI and the AI agent must render the label. |
| G17 | No admin-side AI assistance despite the AI-first goal; product-owner rule says no personal data may go to any LLM. | **Admin Copilot in v1** (q64, §3.8), limited to aggregate/tokenised platform analytics. No PII, no review or dispute text, no write actions. Support, moderation and dispute work stays human. |
| G18 | AI features differ by plan and AI cost could run away. | `ai.onboarding_import` (price-list screenshots → services, marketed as "effortless AI setup") is in **all three plans**: Basic, Pro, Ultra (q42, X17). `ai.agent.enabled` and `ai.monthly_review` (monthly business review on Opus) are included **from Pro** (q31, q63, X17). Every AI call is checked against a **hard monthly cost cap per salon** (`ai.monthly_cost_cap_vnd`, q32). Onboarding import has its own run cap so Basic salons cannot drain cost. |
| G19 | X17 removed the free plan, so what does a newly registered salon get? | **Decided (q75):** a 14-day trial with Pro entitlements and Pro caps (`status = trialing`). After that, the salon must be on a paid plan (Basic, Pro or Ultra). Without one, the subscription becomes `expired`: the workspace is read-only, the public profile stays visible, and new online bookings are paused with a localized message. No data is deleted. One trial per salon (and per owner phone). |

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

### 3.2 Commission (dormant: specified now, built later, q34)
- R-C1: `CommissionRule` holds `scope` (global | plan | salon), `sources[]`, `requiresNewCustomer`, `basis` (`flat_vnd` | `percent_of_estimated_value`), `amount`, `capVnd`, `oncePerCustomerPerSalon` (default true), `disputeWindowDays` (default 7), `activeFrom/To`, `version`. Rules are versioned, and ledger entries reference the rule version.
- R-C2: Commission is **not part of launch**. The tables may be created with the schema so attribution can reference them, but no rule is seeded active, no jobs run and no salon or admin UI is exposed until the owner decides to introduce commissions. When built, the default seed rule is inactive and admin enables it per plan or salon.
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
- R-S1: `Plan` holds `code` (`basic`, `pro`, `ultra`; there is no free plan, X17), localized name and description, `version` and `isPublic`. `PlanPrice(planId, interval ∈ {month, year}, priceVnd, activeFrom)` stores prices for display only, and prices are TBD (q31).
- R-S2: `PlanEntitlement(planId, key, valueType, value)`, where `valueType ∈ {boolean, limit, enum}`. Initial keys:
  - bool: `crm.core`, `calendar.core`, `booking.marketplace_listing`, `ai.onboarding_import`, `ai.agent.enabled`, `ai.monthly_review`, `zalo.oa_connect`, `zalo.inbox`, `analytics.chain_reporting`, `analytics.advanced`
  - limit: `ai.monthly_cost_cap_vnd` (**hard**, covers all AI features of the salon), `zalo_template.monthly_messages`, `notifications.sms.monthly_messages`, `salon.max_locations`, `promotion.weekly_credits_per_month`, `staff.max_seats`
  - GuGu pays for messaging inside the plan (q33); the message limits are fair-use caps, not charges to the salon. AI usage is bounded only by the cost cap (no separate request/token/run limits at launch).
  - Values per plan: R-S2a.
- R-S2a: **Final** entitlement matrix (seeded as `PlanEntitlement` rows):

| Entitlement key | Basic | Pro | Ultra |
|---|---|---|---|
| `crm.core` (CRM, clients, tags, internal notes) | yes | yes | yes |
| `calendar.core` (calendar, booking management) | yes | yes | yes |
| `booking.marketplace_listing` | yes | yes | yes |
| `ai.onboarding_import` (price-list screenshots → services) | yes | yes | yes |
| `ai.agent.enabled` (AI assistant) | no | yes | yes |
| `ai.monthly_review` (monthly business review on Opus) | no | yes | yes |
| `ai.monthly_cost_cap_vnd` (**hard**, all AI features) | 20,000 | 250,000 | 600,000 |
| `zalo.oa_connect` + `zalo.inbox` (salon's own OA in the CRM inbox) | no | yes | yes |
| `zalo_template.monthly_messages` (GuGu-paid, sent **only from the central GuGu OA**, q70) | 100 | 300 | 1,000 |
| `notifications.sms.monthly_messages` (GuGu-paid; provider **mocked** for now) | 30 | 80 | 200 |
| `salon.max_locations` | 1 | 1 | unlimited |
| `analytics.chain_reporting` (combined reporting across locations) | no | no | yes |
| `analytics.advanced` (admin-level analytics: cohorts, funnels, acquisition, exports) | no | no | yes |
| `promotion.weekly_credits_per_month` (promoted-listing credits) | 0 | 0 | 1 (admin-tunable) |
| `staff.max_seats` | unlimited | unlimited | unlimited (not a plan differentiator at launch; key kept) |

Owner-approved (X13, X17, q73, q74, q75), 2026-11-02. Caps are VND or messages per salon per calendar month and are reviewed after the first 20 salons. Any plan may buy extra promoted-listing weeks (flat weekly fee, invoiced manually, q74).

**Later (not in any plan at launch; no seed rows):** `ai.agent.write_actions` (assistant phase B), `branding.custom_subdomain`, `zalo.mini_app` (not planned, q41), `notifications.sms.monthly_cost_cap_vnd` (only once a real SMS provider replaces the mock).

- R-S3: `Subscription(salonId, planId, planVersion, status ∈ {trialing, active, past_due, cancelled, expired}, billingMode = manual, invoicingEntity ∈ {tbd, pl, vn}, interval ∈ {month, year}, currentPeriodStart/End, trialEndsAt)`. Each salon has exactly one current subscription. At registration it gets the 14-day Pro trial (G19). There is no free plan.
- R-S4: `EntitlementOverride(salonId, key, value, expiresAt, reason, createdBy)` supports admin grants and pilots.
- R-S5: The resolver `EntitlementService.get(salonId, key)` returns override if present, otherwise plan, otherwise default. Results are cached in Redis with a 60 s TTL and invalidated on change. A **NestJS guard/decorator** `@RequiresEntitlement('ai.agent.enabled')` exists, and the client gets `/api/v1/salons/:id/entitlements` for UI gating, which is for display only. The backend always enforces.
- R-S6: Downgrades never delete data. Over-limit resources become read-only (for example, extra staff seats are kept but cannot take new bookings until the salon is back within the limit, with a grace period of 14 days).

### 3.4 Usage metering
- R-U1: `UsageCounter(salonId, key, periodStart, used)` holds the aggregate, and `UsageEvent` (append-only, partitioned monthly) holds the raw entries with `idempotencyKey`.
- R-U2: API: `reserve(salonId, key, amount, idemKey)` returns allow or deny along with the remaining amount, `commit(reservationId, actualAmount)` and `release(reservationId)`. AI tokens are reserved by estimate and committed with the actual usage reported by the Claude API. Counters are kept atomically in Redis and flushed to Postgres by a BullMQ job. Postgres is authoritative for reporting.
- R-U3: Soft limit at 80% triggers a notification to the owner. Hard limit means deny with error `ENTITLEMENT_QUOTA_EXCEEDED` (localized). Transactional booking messages (Zalo template, SMS) may fall back to push/email instead of failing the booking (topic 11 fallback order).
- R-U2a: Paid Zalo template messages are sent **only from the central GuGu OA** (q70), never from a salon's own OA. Metering and the `zalo_template.monthly_messages` cap apply to these sends. A salon's connected OA (Pro+) is used for the inbox only.
- R-U3a: **Hard AI cost cap:** before every LLM call (assistant, monthly review, onboarding import), reserve the estimated cost against `ai.cost` within `ai.monthly_cost_cap_vnd`, then commit the actual cost computed from the reported token usage and the model price table. At the cap, AI features stop for that salon until the next period (localized message). Admin can raise the cap via override. Overshoot is impossible by design (reservation is atomic).
- R-U4: Cost tracking per unit (`unitCost` + `costCurrency` snapshot, converted to VND with a stored FX rate) enables margin reporting in admin. **SMS will go through an international provider and is mocked for now (provider-sink)**. Metering still runs on every send against a configured mock unit cost, so SMS cost is metered per salon per message (`sms.cost`, using the provider's per-message price and segment count). Zalo template sends are metered the same way (`zalo_template.messages` + cost). Because GuGu pays for messaging inside the plan, admin shows messaging cost per salon and per plan against the subscription price.

### 3.5 Feature flags
- R-F1: `FeatureFlag(key, description, defaultValue, rules jsonb)`. Rules target environment, salonId, userId, role, plan, locale, platform (ios/android/web), app version, and percentage (sticky hash).
- R-F2: Flags are evaluated on the server, and a flag bundle is served to the client and cached with an ETag. Every flag change is audit logged.
- R-F3: Flags are for rollout, entitlements are for commercial gating. Code must not use one for the other.

### 3.6 Analytics & metrics
- R-AN1: `packages/analytics` holds a typed event catalog (Zod schemas). A single `track(event, props)` API is used by client and server, and unknown events fail type-checking. The client transport batches events (max 50 / 10 s, persisted queue only after consent) to `POST /api/v1/events`. The API validates each event against the catalog and inserts it into `analytics_event` (monthly partitions, retention 13 months raw, rollups kept).
- R-AN2: Client events (`app_opened`, `search_performed`, `salon_viewed`, `service_viewed`, `booking_started`, `favorite_added`) are sent only after analytics consent. Consent state lives in topic 05/11 preferences. Without consent, the client sends nothing (no fingerprinting).
- R-AN3: Business events (`booking_completed`, `booking_cancelled`, `review_submitted`, `salon_registered`, `salon_verified`, `service_created`, `staff_invited`, `booking_received`) are emitted **server-side** from domain events through an outbox. They also feed the internal metrics tables. They are written to the same `analytics_event` table with pseudonymous IDs.
- R-AN4: PII rules: no phone, email, names, notes or review text in event properties. `analytics_event` stores a salted hash of the user ID (`actor_hash`) and an anonymous device/session ID, never the raw user ID, and it is not joined to identity tables in analytics queries. A deny-list linter runs in CI. No data leaves our infrastructure.
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
- R-AD5: Salon reliability score (0–100): customer confirmation rate, dispute rate, cancellation-by-salon rate, no-show handling and response time. **Salons see their own score** (q37) with a breakdown and tips to improve it, in the salon workspace (topic 07 renders it). Admins see it for all salons. Raw risk signals and fraud heuristics stay admin-only. Never shown publicly to customers in MVP.
- R-AD6: Lists are server-paginated, filterable and exportable (CSV). Export of PII requires super_admin and is audit logged.

### 3.8 Admin Copilot (v1, q64; behind flag `admin.copilot` for rollout)
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
- `modules/commission` → rules, ledger, dispute window job (BullMQ repeatable `commission.close-dispute-windows`). **Dormant, built later.**
- `modules/subscriptions` → plans, subscriptions, `EntitlementService`, guard and decorator.
- `modules/usage` → metering, Redis counters, flush job.
- `modules/feature-flags` → evaluator, admin CRUD.
- `modules/analytics` → ingest endpoint, outbox consumer, partition maintenance, rollup jobs.
- `modules/trust` → customer confirmation, risk signals, reliability score.
- `modules/admin` → thin BFF over the above. It holds no business logic of its own.

Domain events flow through a transactional outbox table (owned by topic 04) to BullMQ. This avoids losing analytics or commission events on crash.

### 4.2 Data (additions to topic 04 schema; names indicative)
`BookingAttribution`, `BookingAttributionRevision`, `AttributionTouch` (optional server copy), `CommissionRule`, `CommissionLedgerEntry`, `CommissionLedgerEvent`, `CommissionDispute`, `Plan`, `PlanEntitlement`, `Subscription`, `SubscriptionEvent`, `EntitlementOverride`, `UsageEvent` (partitioned), `UsageCounter`, `FeatureFlag`, `RiskSignal`, `SalonReliabilitySnapshot`, `CustomerVisitConfirmation`, `AnalyticsEvent` (partitioned), `MetricDaily`, `FunnelDaily`, `CohortMonthly`, `PlanPrice`, `PromotedListing`, `PromotedImpression` (partitioned). All tenant-owned rows carry `salonId`. Money is VND `bigint`. All tables use UUID PKs.

### 4.3 Billing deferral
There is no payment processor in MVP. Monthly/yearly subscriptions are invoiced manually by the owner's company. Whether that is a Polish or a Vietnamese entity is to be decided (q35). Once that is decided and the model is validated, add a `BillingProvider` port: an international processor if the Polish entity invoices, or local VN gateways such as VNPay/MoMo/PayOS plus a licensed e-invoice provider if the Vietnamese entity does. The tax consequences differ by entity (Polish: cross-border B2B services and Vietnamese foreign contractor tax; Vietnamese: VAT and mandatory e-invoicing), so legal and tax review is needed before charging the first salon.

### 4.4 Analytics stack
In-house, Postgres only (X14): `packages/analytics` provides the typed catalog, a client transport (batched HTTP to our API, consent-gated, no-op when consent is missing) and a server emitter (outbox → `analytics_event`). `modules/analytics` holds the ingest endpoint (rate-limited, schema-validated, bot-filtered), partition maintenance, and BullMQ rollup jobs into `metric_daily` / `funnel_daily` / `cohort_monthly`. Admin dashboards and salon Insights (07) read only rollups. Funnels and retention are SQL over partitions. If volume outgrows Postgres later, partitions can be offloaded to a columnar store without changing the catalog or the client.

### 4.5 Why this shape
- Entitlement keys (not plan names) let pricing change without code changes.
- An append-only ledger + revisions gives the audit trail the trust model needs, given that GuGu cannot verify offline payments.
- Server-side business events keep metrics correct regardless of client consent and ad blockers.

---

## 5. Acceptance criteria

Attribution & commission
- [ ] Creating a booking always creates exactly one attribution row in the same transaction (integration test: forced failure after booking insert rolls back both).
- [ ] (When commission is built) A marketplace booking by a customer with no prior visit at a salon with an active rule ends `completed` → ledger `pending` → after the dispute window, `confirmed` (time-travel test).
- [ ] Cancelled and no-show bookings never produce `pending`/`confirmed` entries.
- [ ] A second completed marketplace booking by the same customer at the same salon produces no second commission (`oncePerCustomerPerSalon`).
- [ ] A customer imported into the salon CRM before booking is not "new".
- [ ] The customer API never returns attribution fields (contract test on serializer).
- [ ] With the default seed, no ledger entry is ever created (rule inactive).

Entitlements & metering
- [ ] `@RequiresEntitlement` returns 403 `ENTITLEMENT_REQUIRED` with a localized message (vi/en) when the key is false.
- [ ] A Zalo template send beyond `zalo_template.monthly_messages` is denied (booking messages fall back per R-U3) with `ENTITLEMENT_QUOTA_EXCEEDED`, and concurrent reservations never overshoot the limit (concurrency test, 50 parallel reserves).
- [ ] Usage commits are idempotent (the same idempotencyKey twice equals one count).
- [ ] AI calls stop exactly at `ai.monthly_cost_cap_vnd`: 50 parallel AI requests near the cap never push committed cost above it. A Basic salon can run onboarding import but gets `ENTITLEMENT_REQUIRED` for the assistant and the monthly review. Pro and Ultra get both.
- [ ] Seed contains exactly the plans `basic`, `pro`, `ultra` (each with month and year prices) and no `free` plan. An expired subscription makes the workspace read-only and pauses online bookings without deleting data.
- [ ] An admin override takes effect within 60 s (cache invalidation test).
- [ ] A downgrade keeps all data, and over-limit staff cannot take new bookings after the grace period.

Flags
- [ ] Percentage rollout is sticky per user across sessions. The flag bundle works with analytics consent denied.

Analytics
- [ ] With consent off, zero calls to `/api/v1/events` (Playwright network assertion on web; unit test on native transport).
- [ ] No third-party analytics domain is contacted by the web app or the native apps (network allow-list test), and no third-party analytics SDK is in the dependency tree (CI check).
- [ ] The ingest endpoint rejects events not in the catalog or failing schema, and is rate-limited per device.
- [ ] The CI linter fails if an event schema contains a property named like phone/email/name/note/text.
- [ ] Each metric in the dictionary has a unit test against a fixture dataset with a known expected value.

Admin
- [ ] Every admin mutation without `reason` is rejected. Every successful one writes an AuditLog with a before/after diff.
- [ ] `support_admin` cannot change plans, rules, prices or flags, and cannot impersonate (authorization tests).
- [ ] A salon user calling any `/admin/*` endpoint gets 403 (tenant/role test).
- [ ] Both locales render all admin screens with no missing keys (i18n coverage test, topic 03).
- [ ] A salon owner sees their own reliability score and breakdown, never another salon's, and never raw risk signals.

Admin Copilot (v1)
- [ ] Copilot tools return only aggregates and opaque tokens. A fixture test with seeded PII (names, phones, emails, review/dispute text) shows none of it in any prompt or tool result sent to the LLM. The PII guard blocks and audit-logs a deliberately leaky tool. Cells under 5 are suppressed.

---

## 6. Dependencies

| Topic | Needed from it |
|---|---|
| 04 | Outbox table, partitioning approach, migration conventions, the entities above added to the schema |
| 05 | Platform roles and permissions, audit log service, consent storage, impersonation primitive |
| 06 | `booking.created` in-transaction hook, status-change events, admin correction semantics (completed → reverted) |
| 07 | Salon-facing dashboards consume entitlements and the shared metric definitions; renders the salon's reliability score; AI onboarding import UX; owns `RevenueKind` |
| 08 | Calls `UsageService` (incl. AI cost cap) and `EntitlementService` for the assistant, monthly Opus review and onboarding import; reuses metric definitions; provides the agent runtime and PII guard for the Admin Copilot |
| 09 | OA / Zalo template features gated by `zalo.*` / `zalo_template.*` keys; Zalo template sends metered (`zalo_template.messages`) |
| 10 | `PromotedListing` ranking hook and Sponsored label in search; location model for admin |
| 11 | Customer visit confirmation prompt, quota notifications, fallback channels |
| 03 | Localized plan names, error codes, admin UI strings |
| 13 | Rollup job scheduling, partition maintenance, CI linter for event PII, CI check banning third-party analytics SDKs |

---

## 7. Suggested sub-milestones

1. **M12.1 Entitlements core:** Plan, PlanEntitlement, Subscription (Basic/Pro/Ultra seeded, trial per G19), overrides, resolver, guard, client endpoint. Unblocks gating in 07/08/09.
2. **M12.2 Attribution:** touch capture on client, `AttributionService` inside the booking transaction, new-customer logic, serializer protection.
3. **M12.3 Analytics foundation (in-house):** event catalog, consent-aware client transport, `/api/v1/events` ingest, `analytics_event` partitions, server outbox emitter, PII linter.
4. **M12.4 Feature flags:** model, evaluator, client bundle.
5. **M12.5 Usage metering + AI cost cap:** reserve/commit/release, Redis counters, flush job, hard AI cost cap, messaging cost tracking, quota notifications. Needed before AI onboarding import ships, since that is in every plan.
6. **M12.6 Admin shell:** layout, salon/customer directories, verification, suspension, audit viewer.
7. **M12.7 Trust:** customer visit confirmation, risk signals, reliability score (salon-visible), dispute flow.
8. **M12.8 Commission foundation:** **moved to the roadmap `later` bucket** (q34). Spec kept; attribution (M12.2) already captures what it needs.
9. **M12.9 Metrics rollups + platform analytics dashboard.**
10. **M12.10 Moderation, taxonomy, locations, notification admin.**
11. **M12.11 Promoted listings (launch scope, q43, q74):** data, ranking hook, Sponsored label, max 2 per page, impression/click logging. Placements are sold as a flat weekly fee invoiced manually; admin switches them on, or the salon spends Ultra credits. No self-serve ad billing.
12. **M12.12 Admin Copilot (v1, q64):** aggregate/tokenised platform analytics, PII guard, PII-canary tests. Depends on M12.9 rollups and the topic 08 runtime.

---

## 8. AI-first deliverables

| Artifact | Path | Status |
|---|---|---|
| Task spec | `docs/tasks/12-monetization-admin.md` | this file |
| Domain doc | `docs/domains/monetization-admin.md` | skeleton |
| Subagent | `.claude/agents/monetization-admin.md` | created |
| Skill: gate a feature by plan | `.claude/skills/entitlements/SKILL.md` | created |
| Skill: add a tracked event | `.claude/skills/analytics-event/SKILL.md` | created |
| ADRs to write at implementation | `docs/adr/`: attribution window & model, entitlement keys vs plans, in-house analytics on Postgres (no third-party), append-only commission ledger (dormant), AI cost cap | pending |

---

## 9. Product AI-agent surface

Tools exposed to the salon AI agent (topic 08). All are tenant-scoped to the caller's salon, Zod-typed and audit logged.

| Tool | R/W | Permission | Notes |
|---|---|---|---|
| `subscription.getCurrentPlan` | R | owner, manager | plan name, period, entitlements summary |
| `usage.getQuotaStatus` | R | owner, manager | AI requests and AI cost vs the hard cap, Zalo template / SMS used vs fair-use limit, this period |
| `attribution.getAcquisitionBreakdown` | R | owner, manager | bookings by source, new vs returning, date range. No raw UTM |
| `trust.getMyReliabilityScore` | R | owner, manager | score, breakdown components and improvement tips (no raw risk signals) |
| `commission.listLedgerEntries` | R | owner | **later** (dormant): status + amount, only once commission exists |
| `commission.openDispute` | W, **confirm** | owner | **later** (dormant): requires explicit user confirmation in UI |
| `metrics.get` | R | role-scoped | shared metric dictionary (repeat rate, no-show rate, cancellation rate, utilization) with `RevenueKind` labels (enum owned by 07) |

Admin Copilot tools (platform roles only): see §3.8. They are aggregate/tokenised only and never exposed to salon agents.

**No-PII rule (product owner, applies to every tool above):** tools return counts, rates, amounts, statuses and opaque tokens only. No customer, staff or owner names, phone numbers, emails, notes, review or dispute text are ever placed in LLM context. `commission.listLedgerEntries` returns booking tokens, dates and amounts, not customer identities.

The agent MUST label all revenue figures by `RevenueKind` and MUST NOT describe them as payments processed by GuGu.

---

## 10. Open questions for the product owner

Answered and applied: q21/q34 (subscriptions only, commission later), q31 (AI assistant from Pro, pricing later), q32 (hard AI cost cap), q33 (GuGu pays messaging in plan, track costs), q36 (in-house analytics), q37 (salons see reliability score), q42 (AI onboarding import in every plan), X17 (no free plan; Basic/Pro/Ultra), q43 (promoted listings at launch), q63 (monthly Opus review from Pro), q64 (Admin Copilot in v1, PII-free), q70 (paid Zalo messages only from the central GuGu OA), q73 (cap values), q74 (promoted listings: flat weekly fee, max 2 per page), q75 (plan contents, 14-day Pro trial).

Still open:
1. Basic, Pro and Ultra prices (monthly and yearly), the yearly discount and the promoted-listing weekly fee (q31: later).
2. Invoicing entity: Polish or Vietnamese company (q35). Tax and e-invoice obligations depend on it, and legal and tax review is needed before charging the first salon.
3. Subscription payment before a processor: is bank transfer + manual activation acceptable? (assumed yes)
4. Attribution window length (30 days proposed), relevant once commissions are introduced.
5. Real SMS provider choice (mocked until then); add `notifications.sms.monthly_cost_cap_vnd` when it lands.
