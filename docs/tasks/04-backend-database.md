# 04 — Backend core, database schema, media

This spec covers the NestJS modular monolith (`apps/api`), the PostgreSQL + Prisma data model, and the media service. Read it before touching anything under `apps/api/src`, `apps/api/prisma`, or any migration. Master prompt sections: 3.3, 19, 21. Owner subagent: `.claude/agents/backend-database.md`. Skills: `backend-module`, `prisma-migration`.

---

## 1. Scope

### In
- NestJS application skeleton: module layout, layering, cross-cutting concerns (config, validation, errors, logging, request context, tenant context, pagination, idempotency, OpenAPI).
- The complete logical data model (all entities from master §19 plus entities needed by topics 05, 06, 08, 09, 11, 12), keys, relations, constraints, indexes, deletion policy.
- Prisma usage rules, and where raw SQL is mandatory (PostGIS, exclusion constraints, partial/GiST/GIN indexes, RLS, generated columns, views).
- Transactional outbox + BullMQ job infrastructure (the plumbing; job semantics belong to topics 06/11).
- Read-model pattern: typed, OpenAPI-documented query endpoints that the CRM (07) and the AI agent tool layer (08) both reuse.
- Media service: signed uploads, validation, processing to variants, ownership, moderation hooks.

### Out (owned elsewhere — this spec only reserves tables/hooks)
- Slot algorithm, hold semantics, state-machine rules → **06**.
- Auth flows, OTP, sessions, RBAC matrix, RLS policy content → **05**.
- Search ranking, FTS config details, location reform data → **10**.
- Notification orchestration and templates → **11**.
- AI agent behaviour, prompts, model choice → **08**.
- Zalo protocols → **09**.
- Commission rules, plans, pricing → **12**.
- Infra (Docker, CI, backups) → **13**.

---

## 2. Gap analysis

| # | Gap / problem in master prompt | Decision |
|---|---|---|
| G1 | "Use Prisma" + "Use PostGIS" + "DB-level overlap protection" — Prisma 7 has no native geometry type (columns must be `Unsupported("geometry(Point,4326)")`) and does not model exclusion constraints, GiST indexes on unsupported columns, RLS, or generated `tstzrange` columns. | Prisma is the schema-of-record for ordinary columns and the client for CRUD. Everything else lives in **hand-edited SQL inside Prisma migrations** (`--create-only`), with a CI check that `prisma migrate diff` against a fresh DB is empty (no drift, nothing silently dropped). Geo and overlap queries go through **TypedSQL** (`prisma/sql/*.sql`) or `$queryRaw` with tagged templates — never string concatenation. |
| G2 | Prisma 7 changed the runtime (Rust-free query compiler, mandatory driver adapter, `prisma.config.ts`, env not auto-loaded, pool settings come from `pg`). | Pin Prisma 7.x with `@prisma/adapter-pg`; configure pool explicitly; load env in `prisma.config.ts`; document in the skill. Spike S0 verifies performance and `Unsupported` writes. |
| G3 | No ID strategy beyond "UUID". Random v4 UUIDs fragment B-tree indexes on the largest tables (bookings, status history, audit). | UUID **v7** (`@default(uuid(7))`) everywhere; public slugs separate from IDs. |
| G4 | No money model. VND has no minor unit, but expansion to SEA (THB, IDR, SGD…) is planned. | `amount_minor BIGINT` + `currency CHAR(3)` on every money field; VND minor = VND. Never floats. |
| G5 | No time model beyond "store UTC". Schedules are wall-clock recurring rules, not instants. | Instants: `timestamptz` (UTC). Recurring rules: `time` + `weekday` + salon `timezone` (IANA). Dates: `date`. Conversion only in `packages/domain` time utilities (owned with 06). |
| G6 | Tenant isolation is described only at app level; IDs could still cross-link tenants (e.g. booking of salon A referencing staff of salon B). | Every tenant-owned table has `salon_id NOT NULL`; child→parent references use **composite FKs `(salon_id, x_id) → (salon_id, id)`** so cross-tenant references are impossible at DB level. RLS added as defense in depth (policy content in 05). |
| G7 | Localized content storage unspecified (service descriptions, category names, templates). | `LocalizedText` = JSONB `{ "vi": string, "en"?: string }`, Zod-validated, `vi` required. Generated `tsvector` columns for search (config in 10). Revisit translation tables only if >3 locales. Coordinate with 03. |
| G8 | "Notify the salon" after booking + BullMQ, but nothing guarantees the job is enqueued if the transaction commits (or not enqueued if it rolls back). | **Transactional outbox**: domain events written to `outbox_event` in the same transaction; a relay publishes to BullMQ; consumers are idempotent via `event_id`. |
| G9 | No idempotency for mutating requests (mobile networks in VN retry; double-tap "Confirm booking"). | `Idempotency-Key` header on POST for bookings, reviews, uploads; `idempotency_key` table scoped by actor, 24 h TTL, stores response hash. |
| G10 | Soft deletion "only where appropriate" — undefined. | Explicit per-entity policy (§3.6). Bookings, status history, attribution, ledger, audit: **never deleted, FK `RESTRICT`**. Account deletion = anonymization, not row deletion. |
| G11 | Snapshots mentioned only for price/duration. | Snapshot everything a historical booking must render without joins to mutable data (§3.5). |
| G12 | Location model assumes city → district → ward; Vietnam's 2025 reform removed the district level and merged provinces. | Self-referencing `location` with `level` enum, validity window, and a `location_succession` mapping table; salons store `ward_id` + denormalized `province_id`. Data/UX details → 10. |
| G13 | Entities required by other topics missing (OTP, sessions, consents, notification deliveries, outbox, idempotency, AI agent, Zalo, entitlements, feature flags). | Added as owned-elsewhere tables (§3.4), flagged with owning topic. |
| G14 | No contract for how the frontend and the AI agent consume data; risk of each inventing its own queries. | **Read-model pattern** (§4.4): each module publishes Zod-defined read models + query services; HTTP controllers and agent tools are thin adapters over the same query service. |
| G15 | Media: no lifecycle, EXIF/PII stripping, virus/abuse scanning, orphan cleanup, or CDN strategy. | Upload-intent → direct PUT to S3 → `finalize` → async processing (sharp: strip EXIF, re-encode WebP/AVIF, variants) → `ready`. Orphans swept after 24 h. Served via Cloudflare with immutable keys. |
| G16 | Analytics on the OLTP DB with millions of bookings. | Pre-aggregated `salon_daily_metrics` table maintained by jobs from outbox events, plus nightly reconciliation. No heavy ad-hoc aggregation on hot tables from the API or agent. |
| G17 | "Errors" unspecified; clients need localizable messages. | RFC 9457 problem+json with stable `code` (e.g. `BOOKING_SLOT_TAKEN`) mapped to translation keys on the client; never leak SQL/stack. |
| G18 | Pagination unspecified. | Keyset (cursor) pagination for lists; offset only for small admin tables. |

---

## 3. Data model

### 3.1 Conventions (MUST)
- Table names `snake_case` plural via `@@map`; Prisma models PascalCase singular.
- PK `id UUID DEFAULT uuid v7`. Natural keys get `UNIQUE` constraints.
- `created_at`, `updated_at` (`timestamptz`) on every table; `deleted_at` only where §3.6 allows.
- Tenant-owned tables: `salon_id UUID NOT NULL` + `UNIQUE (salon_id, id)` to support composite FKs.
- Enums as Postgres enums for closed sets (booking status, roles); lookup tables for admin-managed sets (categories, amenities).
- Money: `*_amount_minor BIGINT` + `currency CHAR(3)`.
- All FKs explicit; default `ON DELETE RESTRICT`. `CASCADE` only for pure child rows with no historical meaning (e.g. `staff_schedule` when its staff profile is hard-deleted — which in practice never happens because staff are soft-deleted).

### 3.2 Core entities (master §19)

Grouped by owning module. **PK** omitted. `→` = FK. `T` = tenant-scoped (has `salon_id`).

**Identity & users** (module `users`, auth details 05)
- `User` — phone_e164 (unique, nullable after anonymization), email (unique nullable), status (active/suspended/deleted), preferred_locale, platform_role (null/support_admin/super_admin), last_login_at, deleted_at.
- `UserProfile` — user_id (unique →User), display_name, avatar_media_id →MediaAsset, birth_year (optional), preferred_location_id →Location.
- `Customer` — user_id (unique →User), marketing_consent_at, notification_prefs (JSONB, schema owned by 11). Exists so customer-specific data is separated from staff identity.

**Salons** (module `salons`)
- `Salon` — slug (unique, citext), canonical_id (= id; slug changes keep redirect rows in `salon_slug_history`), name, status (draft/pending_review/active/suspended/closed), verified_at, timezone (default `Asia/Ho_Chi_Minh`), default_locale, currency, owner_user_id →User, deleted_at.
- `SalonLocation` (T) — address_line, ward_id →Location, province_id →Location (denormalized), `geo geography(Point,4326)` (Unsupported), map_place_id, is_primary. One primary per salon (partial unique index).
- `SalonSettings` (T, 1:1) — booking_window_days, min_lead_time_minutes, cancellation_cutoff_minutes, auto_confirm (bool), slot_granularity_minutes, reminder_offsets (int[]), cancellation_policy (LocalizedText), booking_policy (LocalizedText), amenities (→ `salon_amenity` join).
- `SalonOpeningHours` (T) — weekday, opens_at time, closes_at time (multiple rows per day allowed for split shifts).
- `SalonHoliday` (T) — date or date range, closed bool, special opens/closes, reason.
- `SalonMember` (T) — user_id →User, role (owner/manager/receptionist/staff), permissions_override (JSONB, schema in 05), status (invited/active/removed), invited_by. `UNIQUE (salon_id, user_id)`.

**Staff** (module `staff`)
- `StaffProfile` (T) — salon_member_id (nullable: a staff profile can exist before the person has an account), display_name, bio (LocalizedText), avatar_media_id, is_bookable, sort_order, deleted_at.
- `StaffSchedule` (T) — staff_id, weekday, starts_at time, ends_at time, effective_from date, effective_to date nullable.
- `StaffBreak` (T) — staff_id, weekday or specific date, starts_at, ends_at.
- `StaffTimeOff` (T) — staff_id, `period tstzrange`, reason, approved_by.
- `StaffService` (T) — staff_id, service_id, variant_id nullable, price_override_minor, duration_override_minutes. `UNIQUE (salon_id, staff_id, service_id, variant_id)` (NULLS NOT DISTINCT).

**Catalog** (modules `categories`, `services`)
- `ServiceCategory` (global) — parent_id self-FK, slug unique, name LocalizedText, icon, sort_order, is_active. Admin-managed (master §7).
- `Service` (T) — category_id →ServiceCategory, name LocalizedText, description LocalizedText, price_amount_minor, price_max_amount_minor (range), currency, duration_minutes, buffer_before_minutes, buffer_after_minutes, is_active, sort_order, booking_restrictions JSONB (schema in 06), requires_resource_type nullable, deleted_at.
- `ServiceVariant` (T) — service_id, name LocalizedText, price/duration overrides, sort_order, is_active, deleted_at.
- `Resource` (T) — type (room/chair/bed/device), name, capacity int default 1, is_active.
- `ServiceResourceRequirement` (T) — service_id, resource_type, quantity.

**Bookings** (module `bookings`; engine rules 06)
- `Booking` (T) — reference_code (short human code, unique per salon), customer_id →Customer nullable (walk-in/manual), customer_salon_profile_id →CustomerSalonProfile, status enum, `starts_at`, `ends_at`, source enum (marketplace/salon_profile/direct_link/qr_code/social_media/repeat_customer/staff_created/zalo), created_by_user_id, customer_note, cancellation_reason, total_estimated_amount_minor, currency, payment_method (`pay_at_salon` only in MVP), idempotency_key, version int (optimistic lock).
- `BookingService` (T) — booking_id, sequence, service_id, variant_id, staff_id, `starts_at`, `ends_at`, **snapshot fields** (§3.5), generated `slot tstzrange` incl. buffers.
- `BookingHold` (T) — staff_id, `slot tstzrange`, expires_at, session_key. Participates in the same exclusion constraint domain (§3.7). Owned by 06.
- `BookingStatusHistory` (T, append-only) — booking_id, from_status, to_status, actor_type (customer/salon_member/system/admin/agent), actor_id, reason, created_at.
- `ResourceBooking` (T) — booking_service_id, resource_id, `slot tstzrange`.

**CRM** (module `customers`)
- `CustomerSalonProfile` (T) — customer_id nullable (offline-only clients have no GuGu account), display_name, phone_e164, zalo_user_link_id nullable (09), tags text[], first_visit_at, last_visit_at, visit_count, no_show_count, preferred_staff_id, source_first. `UNIQUE (salon_id, customer_id)`, `UNIQUE (salon_id, phone_e164)`.
- `CustomerNote` (T) — customer_salon_profile_id, author_member_id, body, visibility = `internal` (constant; there is no customer-visible variant — enforced by never mapping it into customer read models).

**Reviews** (module `reviews`)
- `Review` (T) — booking_id `UNIQUE` (one review per booking), customer_id, rating smallint `CHECK 1..5`, body, status (published/hidden/removed/pending_moderation), edited_at, edit_count.
- `ReviewMedia` — review_id, media_id.
- `ReviewResponse` (T) — review_id `UNIQUE`, author_member_id, body.
- `ReviewReport` — review_id, reporter_user_id, reason, status.

**Engagement**
- `Favorite` — user_id, target_type (salon/service), target_id. `UNIQUE (user_id, target_type, target_id)`. No polymorphic FK → two nullable FKs `salon_id`, `service_id` with `CHECK (num_nonnulls(salon_id, service_id) = 1)`.

**Notifications** (owned by 11; tables here)
- `Notification` (in-app inbox) — user_id, type, payload JSONB, read_at, dedup_key `UNIQUE`.
- `NotificationTemplate` — key, channel, locale, version, body, provider_template_id (e.g. ZNS template id), status.
- `NotificationDelivery` — notification_id or event_id, channel, provider, status, attempts, provider_message_id, error_code, `UNIQUE (dedup_key, channel)`.

**Media** (module `media`, §5)
- `MediaAsset` — owner_type (user/salon), owner_user_id, salon_id nullable, purpose enum (salon_logo/salon_cover/salon_gallery/service_photo/staff_photo/review_photo/avatar), storage_key, mime, bytes, width, height, blurhash, status (pending/processing/ready/rejected/deleted), moderation_status, variants JSONB, sha256, deleted_at.

**Geography** (module `locations`, data 10)
- `Location` — parent_id, level (country/province/legacy_district/ward), code (official GSO code), name LocalizedText, slug, `centroid geography(Point)`, `boundary geography(MultiPolygon)` optional, valid_from, valid_to.
- `LocationSuccession` — old_location_id, new_location_id, effective_date.

**Monetization foundations** (owned by 12)
- `BookingAttribution` (T) — booking_id `UNIQUE`, source, campaign/ref code, is_new_to_salon, attributed_at, commission_eligible, commission_status enum.
- `CommissionRule` — scope (global/salon/plan), rule JSONB, active_from/to.
- `CommissionLedger` (T, append-only) — attribution_id, amount_minor, currency, status, reason, created_by.
- `Subscription` (T) — plan_id, status, period_start/end, trial_ends_at.

**Platform**
- `AuditLog` (append-only, partitioned by month) — actor_type, actor_id, salon_id nullable, action, target_type, target_id, before/after JSONB (redacted), ip, user_agent, request_id.

### 3.3 Infrastructure tables (owned here)
- `OutboxEvent` — id, aggregate_type, aggregate_id, salon_id, type (`booking.created`…), payload JSONB, occurred_at, published_at nullable. Partial index on unpublished.
- `IdempotencyKey` — key, actor_id, route, request_hash, response_status, response_body JSONB, expires_at. `UNIQUE (actor_id, route, key)`.
- `SalonSlugHistory` — salon_id, slug unique, replaced_at (for 301s).
- `SalonDailyMetrics` (T) — salon_id, date, bookings_created, bookings_completed, cancellations_customer, cancellations_salon, no_shows, new_customers, returning_customers, estimated_revenue_minor, reported_revenue_minor, booked_minutes, available_minutes. `UNIQUE (salon_id, date)`. Read model for 07 dashboards and 08 agent.

### 3.4 Placeholder entities for other topics (shape reserved; owning topic finalizes)
| Entity | Owner | Purpose |
|---|---|---|
| `OtpChallenge` (phone_hash, code_hash, attempts, channel sms/zns, expires_at), `Session`/`RefreshToken` (family_id, rotated_from, revoked_at, device), `Consent` (type, version, granted_at, revoked_at) | 05 | Auth & privacy |
| `PermissionGrant` / role matrix (if not static) | 05 | RBAC |
| `AgentConversation` (T: salon_id, member_id, channel in_app/zalo, title, locale), `AgentMessage` (role, content JSONB, tokens_in/out, model), `AgentToolCall` (T: conversation_id, tool_name, input JSONB, output_summary JSONB, status, permission_checked, latency_ms, confirmed_by for writes), `AgentUsage` (T: period, tokens, cost_minor) | 08 | AI agent conversations + mandatory tool-call audit |
| `ZaloOaConnection` (T: oa_id, encrypted access/refresh tokens, scopes, status, connected_by), `ZaloUserLink` (zalo_user_id per OA ↔ CustomerSalonProfile / User), `ZaloThread` (T), `ZaloMessage` (T: direction, type, body, interaction_window_expires_at), `ZnsMessageLog` (template_id, phone_hash, booking_id, status, cost_minor, provider_msg_id) | 09 | Zalo OA inbox, ZNS delivery log |
| `Plan` (code, limits JSONB), `Entitlement` (T: feature key e.g. `ai_agent`, `zalo_inbox`, limit, source), `UsageCounter` (T: feature, period, used), `PromotedListing` (T) , `FeatureFlag` | 12 | Subscriptions, gating (AI agent, Zalo), feature flags |
| `AnalyticsEvent` (only if not sent to an external pipeline) | 12 | Product analytics |

Rule: placeholder tables are **not** created until the owning topic's milestone; this list exists so composite keys, tenant scoping, and audit patterns are designed in from day one.

### 3.5 Booking snapshots (MUST)
`BookingService` stores, at creation and on reschedule: `service_name` (LocalizedText), `variant_name`, `category_id`, `staff_display_name`, `price_amount_minor`, `price_max_amount_minor`, `currency`, `duration_minutes`, `buffer_before_minutes`, `buffer_after_minutes`. `Booking` stores `salon_name`, `salon_address_text`, `salon_timezone`. Historical screens, metrics, commission and the AI agent read **only snapshot fields** for past bookings. Changing a service never mutates existing bookings.

### 3.6 Deletion policy
| Entity | Policy |
|---|---|
| Booking, BookingService, BookingStatusHistory, BookingAttribution, CommissionLedger, AuditLog, OutboxEvent, ReviewReport | Never deleted. FK `RESTRICT`. Retention/archival via partitioning (13). |
| Salon, Service, ServiceVariant, StaffProfile, Resource | Soft delete (`deleted_at`); hidden from public/read models; still referenced by history. |
| User | Account deletion → anonymize PII (phone/email nulled, name → "Deleted user"), keep row for FK integrity; `CustomerSalonProfile` PII anonymized per salon unless legal retention applies (05). |
| Review | Moderation status, not deletion; author deletion → anonymized author. |
| MediaAsset | Soft delete, then object removal job after 30 days; review/avatars of deleted users removed. |
| Favorite, Notification, IdempotencyKey, BookingHold, OtpChallenge | Hard delete / TTL sweep. |

Prisma must not use a global soft-delete extension that silently filters; read models filter `deleted_at IS NULL` explicitly so history queries remain possible.

### 3.7 Raw-SQL-only database features (in migrations)
- `CREATE EXTENSION postgis, btree_gist, pg_trgm, unaccent, citext;`
- **Overlap protection** (final shape agreed with 06): exclusion constraint on staff time for active bookings and live holds, e.g. on `booking_service`: `EXCLUDE USING gist (salon_id WITH =, staff_id WITH =, slot WITH &&) WHERE (status_active)` — `status_active` is a denormalized boolean maintained in the same transaction as status changes (exclusion predicates can't reference other tables). Holds use a parallel constraint plus a check in the booking transaction. Capacity>1 resources cannot use a simple exclusion constraint → engine uses `SELECT … FOR UPDATE` on resource rows inside a serializable/locked transaction (06).
- Generated column `slot tstzrange GENERATED ALWAYS AS (tstzrange(starts_at - buffer_before, ends_at + buffer_after, '[)')) STORED`.
- GiST on `salon_location.geo`; GIN trigram on unaccented names; GIN on generated `tsvector` (config from 10).
- Partial unique indexes (one primary location; one active subscription per salon; unpublished outbox).
- `CHECK` constraints (ratings, money ≥ 0, `ends_at > starts_at`, favorite target).
- RLS policies (content from 05) using `current_setting('app.salon_id', true)`.
- Monthly partitioning for `audit_log` and, later, `booking_status_history`.

Each raw object is listed in `docs/domains/backend-database.md#raw-sql-objects` with the migration that creates it, and covered by an integration test.

---

## 4. Backend architecture

### 4.1 Layout
```
apps/api/
  prisma/schema.prisma, prisma/migrations/, prisma/sql/   (TypedSQL)
  prisma.config.ts
  src/
    main.ts
    common/        guards, interceptors, filters, pagination, problem-json, zod pipe
    infrastructure/ prisma (adapter-pg), redis, bullmq, s3, outbox relay, logger (pino), config
    modules/<domain>/
      <domain>.module.ts
      http/        controllers (thin), request/response mapping
      application/ commands (use cases) + queries (read-model services)
      domain/      policies; pure logic lives in packages/domain when shared with the app
      infra/       repositories (Prisma / TypedSQL)
      <domain>.read-models.ts  → re-exports Zod schemas from packages/validation
      tests/
    jobs/          BullMQ processors (one file per queue)
```
Modules (master §3.3): auth, users, customers, salons, staff, services, categories, availability, bookings, reviews, favorites, notifications, media, search, subscriptions, attribution, analytics, administration, locations, plus `agent` (08) and `zalo` (09) later.

### 4.2 Rules
- Modules own their tables. Cross-module reads go through the other module's exported **query service**, not its repository. Cross-module side effects go through outbox events.
- Controllers contain no business logic and no Prisma calls.
- Every request runs in a `RequestContext` (AsyncLocalStorage): request_id, actor, locale, salon_id (from route `/salons/:salonId/...` validated against membership — 05). Repositories for tenant tables **require** a `salonId` argument; there is no un-scoped finder.
- Transactions: interactive `prisma.$transaction` with explicit isolation for booking writes; outbox insert in the same transaction.

### 4.3 Validation & contracts
- **Single source of truth: Zod schemas in `packages/validation`** (request bodies, query params, read models, error codes). Backend uses `nestjs-zod` (or equivalent — verify current maintained option in S0) to validate and to emit OpenAPI 3.1. `packages/api-client` is generated from the OpenAPI document (e.g. `openapi-typescript` + TanStack Query hooks). The frontend and the agent tool layer import the same Zod types.
- Responses are validated against read-model schemas in dev/test (output validation, master §24) and stripped of non-declared fields in prod.

### 4.4 Read-model pattern (CRM + AI agent reuse)
Every module that holds business data exposes named read models, e.g.:
- `bookings.list` (filters: date range, status, staff, customer; keyset paginated)
- `bookings.summary` (counts by status for a period)
- `metrics.salonDaily` / `metrics.salonPeriodSummary` (from `salon_daily_metrics`; fields labelled `estimated` vs `reported` revenue per master §13)
- `customers.list`, `customers.profile` (internal notes included only for permitted salon roles)
- `services.list`, `staff.list`, `staff.utilization`, `reviews.list`, `reviews.summary`

Each read model has: Zod input + output schema, required permission, tenant scope, max page size, and a stable description string (used both for OpenAPI `summary` and as the agent tool description). It is implemented once as a query service method; the HTTP controller and the agent tool adapter (08) are both thin wrappers. A registry file per module (`<domain>.read-models.ts`) exports this metadata so 08 can generate tool definitions automatically.

### 4.5 Cross-cutting
- Errors: RFC 9457 `application/problem+json` with `code`, `title` (English, for logs), `params`; client maps `code` → translation key (03).
- Logging: pino JSON, request_id, salon_id, actor_id; PII redaction list (phone, email, notes, OTP).
- Rate limiting: Redis-backed throttler; route classes defined in 05.
- API versioning: URI `/api/v1`. Breaking changes → `/v2` per module.
- Pagination: `?cursor=&limit=` returning `{ items, nextCursor }`.
- Caching: Redis for public salon profile and category trees, invalidated by outbox events.
- Health: `/health/live`, `/health/ready` (DB, Redis, S3).

### 4.6 Jobs
- BullMQ queues: `outbox-relay` (or a polling worker), `notifications`, `media-processing`, `metrics-aggregation`, `holds-sweeper`, `maintenance`. Workers run in a separate process from the HTTP server (same codebase, different entrypoint).
- Every job is idempotent, keyed by `event_id` or deterministic job id; retries with backoff; dead-letter queue surfaced in admin (18).

---

## 5. Media service
1. `POST /api/v1/media/upload-intents` {purpose, mime, bytes, salonId?} → checks permission for purpose/owner, allowed MIME (jpeg/png/webp/heic) and size limits per purpose, creates `MediaAsset(pending)`, returns presigned PUT URL (5 min) with content-type/length conditions.
2. Client uploads directly to S3-compatible storage (R2/S3/MinIO locally).
3. `POST /media/:id/finalize` → verifies object exists, sniffs magic bytes, computes sha256, enqueues processing.
4. Worker (sharp): decode, reject if dimensions/frames abnormal, strip EXIF/GPS, auto-rotate, generate variants (e.g. 64/256/768/1600 px) as WebP + AVIF, blurhash; status `ready`. Optional moderation hook (admin queue; automated classifier later).
5. Attach endpoints (e.g. set salon logo) accept only `ready` assets owned by the same user/salon.
6. Public delivery through Cloudflare CDN with immutable versioned keys; private media (none in MVP) via signed GET.
7. Sweeper deletes `pending` > 24 h and soft-deleted > 30 days.

---

## 6. Acceptance criteria
1. `docker compose up` + `pnpm db:migrate` creates the schema with PostGIS, btree_gist, pg_trgm, unaccent, citext enabled; `prisma migrate diff --from-migrations --to-schema` reports no drift in CI.
2. Inserting two overlapping active `booking_service` rows for the same staff in concurrent transactions → exactly one succeeds; the other fails with SQLSTATE `23P01`, mapped to `BOOKING_SLOT_TAKEN`. (Integration test, 50 parallel attempts.)
3. A booking in salon A cannot reference staff/service/customer profile of salon B — DB rejects via composite FK (integration test).
4. Changing a service's price/duration/name does not change any existing booking's displayed values (test).
5. Deleting (soft) a service/staff/salon never deletes bookings; attempting a hard delete of a referenced row fails (test).
6. Radius query "salons within 3 km of point, ordered by distance" uses the GiST index (EXPLAIN check in test) and returns correct ordering.
7. Every endpoint appears in `/api/v1/docs` (Swagger) with request/response schemas generated from Zod; generated `api-client` compiles with `strict`.
8. Every read model listed in §4.4 has metadata (permission, scope, description, schemas) in its module registry; a test asserts registry ↔ OpenAPI consistency.
9. A booking creation commits exactly one `booking.created` outbox event; rolling back the transaction leaves none; the relay delivers it to BullMQ at-least-once and consumers dedupe.
10. Replaying a POST with the same `Idempotency-Key` returns the original response without side effects.
11. Media: uploading a non-image disguised as `.jpg` is rejected at finalize; EXIF GPS is absent from all variants; a user cannot attach another salon's asset.
12. Problem+json errors never contain stack traces or SQL in production mode.
13. Logs redact phone, email, OTP and notes (test on logger serializer).

---

## 7. Dependencies
- **01** monorepo, package boundaries (`packages/validation`, `packages/api-client`, `packages/domain`).
- **05** RBAC matrix, membership guard, RLS policy content, OTP/session tables.
- **06** final overlap-constraint shape, hold model, state transition table, booking restrictions schema.
- **03** `LocalizedText` rules and error-code translation keys.
- **10** FTS configuration, location dataset and succession mapping.
- **08 / 09 / 12** finalize placeholder tables.
- **13** Docker images (postgis), Testcontainers in CI, backups, partition maintenance.

Provides to: 06, 07, 08, 10, 11, 12 (schema, read-model registry, outbox, media).

---

## 8. Sub-milestones
- **S0 Spike (1–2 d):** Prisma 7 + adapter-pg + `Unsupported` geography + TypedSQL + exclusion constraint + `migrate diff` drift check; choose Zod↔OpenAPI library. Output: ADR `0001-prisma-raw-sql-boundary`, ADR `0002-contracts-zod-openapi`.
- **S1 Skeleton:** NestJS app, config, logger, problem+json, RequestContext, health, Swagger, Prisma module, Redis, BullMQ worker entrypoint.
- **S2 Identity & tenancy tables:** User, UserProfile, Customer, Salon, SalonMember, SalonSettings, Location (+ placeholders from 05 as they are specified).
- **S3 Catalog & staff:** categories, services, variants, staff, schedules, breaks, time off, resources.
- **S4 Bookings schema:** booking, booking_service with snapshots, holds, history, raw-SQL constraints + concurrency tests (with 06).
- **S5 Outbox + idempotency + metrics table** and aggregation job.
- **S6 Media service** end to end with MinIO locally.
- **S7 Read-model registry** + OpenAPI generation + api-client generation in CI.
- **S8 Reviews, favorites, CRM profile/notes, attribution, audit log partitioning.**

---

## 9. AI-first deliverables
- `.claude/agents/backend-database.md` — domain subagent (owns `apps/api/src/{common,infrastructure}`, `apps/api/prisma`, module scaffolding conventions).
- `.claude/skills/backend-module/SKILL.md` — procedure to add a module/endpoint/read model.
- `.claude/skills/prisma-migration/SKILL.md` — procedure for migrations incl. raw SQL objects.
- `docs/domains/backend-database.md` — durable reference (skeleton now, filled as code lands).
- ADRs listed in S0.
- Later: a `pnpm api:new-module <name>` generator so agents scaffold consistent modules instead of hand-writing boilerplate.

## 10. Product AI-agent surface
This topic provides the **mechanism**, not the tools themselves: the read-model registry (§4.4) is the only source from which 08 builds agent tools. Rules:
- Agent tools call query services in-process with the same `RequestContext` (actor = salon member, `actor_type = agent`), so tenant scope and RBAC are identical to HTTP.
- Read-only tools first; any future write tool maps to an existing command with idempotency key and requires human confirmation (08).
- Read models never expose: OTP data, tokens, internal attribution metadata, other tenants' data. Internal notes and customer phone numbers only for roles that can see them in the CRM.
- Aggregates come from `salon_daily_metrics`, with explicit `revenue_kind: estimated | reported | offline_sale` so the agent cannot present booking values as verified payments.
- Customer-authored text (notes, reviews, Zalo messages) is returned in clearly delimited fields marked `untrusted: true` in the schema metadata.
- Every agent tool invocation is persisted in `AgentToolCall` (owned by 08) and summarized in `AuditLog`.

## 11. Open questions for the product owner
1. Hosting region: Vietnam (Viettel/VNG/FPT cloud) vs Singapore (AWS/GCP)? Affects data-localization obligations under Decree 13/2023 and latency.
2. Object storage choice: Cloudflare R2 (cheap egress, fits Cloudflare plan) vs AWS S3?
3. Retention period for bookings/audit data after salon closure or account deletion (legal input needed).
4. Should offline-only salon clients (no GuGu account, added from CRM or Zalo) be allowed in MVP? (Model supports it; affects privacy notices.)
5. Is multi-location per salon (chains) needed in MVP, or one physical location per salon tenant with chains later as an "organization" layer?
6. Image moderation: manual admin queue only at launch, or an automated classifier from day one?
