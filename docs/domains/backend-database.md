# Backend core & database — domain reference

Durable reference for the GuGu API's structure and data model. Read this to find where something lives and which invariants protect it. The task spec with rationale is `docs/tasks/04-backend-database.md`; this file records what is actually implemented.

## Status

| Milestone | State | Notes |
|---|---|---|
| 04-S0 spike | done on branch `backend/04-S0-S1` (pending merge) | ADR-0008; `pnpm --filter @gugu/api spike:s0` |
| 04-S1 shell | done on branch `backend/04-S0-S1` (pending merge) | config, Pino, problem+json, RequestContext, health, Swagger, Prisma, Valkey, BullMQ worker |
| 04-S2… | not started | identity & tenancy tables next |

Only the API shell exists: no domain tables yet (the first migration creates extensions only).

## Quick facts
- Runtime: NestJS modular monolith, `apps/api`; workers share the codebase with a separate entrypoint.
- DB: local PostgreSQL 18.6 + PostGIS 3.6.3 (`infra/docker/postgres/Dockerfile`; `postgis/postgis:18-3.6` is amd64-only) — later target RDS PostgreSQL 18 (`ap-southeast-1`). Prisma 7.10.1 (`@prisma/adapter-pg`, `apps/api/prisma.config.ts`).
- Build: NestJS 12 (ESM) bundled by rolldown + SWC → `dist/main.js`, `dist/worker.js` (ADR-0008). Tests: Vitest + SWC.
- Local ports (`docker-compose.yml`, override in `.env`): Postgres 15432, Valkey 16379, MinIO 19000/19001, Mailpit 11025/18025, API 3001. Use `127.0.0.1`, not `localhost`.
- Extensions: postgis, btree_gist, pg_trgm, unaccent, citext, pgcrypto (all on RDS allow-list, checked 2026-11-02). UUID v7 via Prisma / native `uuidv7()`.
- Object storage: S3 (`ap-southeast-1`), MinIO locally; Cloudflare CDN in front.
- Contracts: Zod in `packages/contracts` → validated by Nest's `StandardSchemaValidationPipe` (`@Body({ schema })`) and converted to OpenAPI by `@ApiResponse({ standardSchema })` → Swagger UI `/api/docs`, JSON `/api/docs-json` → `packages/api-client` (generation not wired yet). Pure logic in `packages/domain`.
- Owner agent: `.claude/agents/backend-database.md`. Skills: `backend-module`, `prisma-migration`.

## Invariants
- Tenant row scope is `salon_id` (one salon = one location); organisations group salons for combined reporting and billing.
- Bookings have one service (+ add-ons) in MVP; anonymous walk-ins may have no client profile.
- Account deletion: 30-day grace, then anonymization job.
- Analytics is in-house: `analytics_event` + rollup tables; no third-party analytics.
- Environment: localhost only for now (Docker Compose); AWS is a later milestone.
- Tenant tables: `salon_id NOT NULL`, `UNIQUE (salon_id, id)`, composite FKs.
- Historical rows never deleted (`RESTRICT`); bookings render from snapshots.
- Money `BIGINT` minor + `currency`; instants `timestamptz` UTC; schedules wall-clock + salon timezone.
- Cross-module side effects via transactional outbox.
- Raw SQL only via TypedSQL / tagged `$queryRaw`.

## Modules
| Module | Path | Tables owned | Events emitted | Read models | Status |
|---|---|---|---|---|---|
| health | `apps/api/src/modules/health` | — | — | — (`GET /api/v1/health` readiness: DB + Redis, 200/503; `/health/live`) | implemented |
| zalo (topic 09) | `apps/api/src/modules/zalo` | zalo_oa_connections, zalo_conversations, zalo_messages, zalo_webhook_events, zalo_send_logs, zalo_booking_links, zalo_staff_notifications | — (consumes `booking.*` outbox events with its own cursor until 04-S5) | `/api/v1/salons/:salonId/zalo/*`; see `docs/domains/zalo.md` |
| subscriptions (topic 12) | `apps/api/src/modules/subscriptions` | plans, plan_prices, plan_entitlements, subscriptions, subscription_events, entitlement_overrides | — | `GET /api/v1/salons/:salonId/entitlements` | M12.1 implemented; see `docs/domains/monetization-admin.md` |

Infrastructure (`apps/api/src/infrastructure`): `config` (Zod env, `AppConfig`), `logger` (nestjs-pino, `REDACT_PATHS`), `prisma` (`PrismaService`, lazy connect), `redis` (`RedisService`), `queue` (`QueueService`, `QUEUES`). Common (`apps/api/src/common`): `context` (RequestContext via AsyncLocalStorage, `x-request-id`), `problem` (`ProblemFilter`, `AppError`, `COMMON_ERRORS`), `validation` (global Zod pipe). Entrypoints: `main.ts` (HTTP), `worker.ts` (BullMQ), `bootstrap.ts` (prefix `/api`, URI versioning v1, Swagger).

## Entities
| Table | Tenant | Deletion policy | Owner module | Notes |
|---|---|---|---|---|
| plans, plan_entitlements, plan_prices | no (reference data) | never deleted; `Restrict` | subscriptions | rows inserted by migration `20261102115055_add_subscriptions_entitlements` |
| subscriptions | yes (`salon_id`, no FK until salons lands) | never deleted; `Restrict` | subscriptions | one current per salon |
| subscription_events | yes | append-only | subscriptions | composite FK `(salon_id, subscription_id)` |
| entitlement_overrides | yes | revoked via `revoked_at`, never deleted | subscriptions | |
| zalo_oa_connections | yes (`salon_id` unique) | kept; disconnect wipes tokens | zalo | tokens AES-256-GCM (`ZALO_TOKEN_KEY`) |
| zalo_conversations, zalo_messages | yes | `Restrict`; customer text = personal data (never to an LLM, X10) | zalo | one conversation per (OA, Zalo user) |
| zalo_webhook_events | salon set when routed | purged after 30 days (daily job) | zalo | idempotent on `event_key` |
| zalo_send_logs | yes | kept (cost/audit trail); `request` cleared once final | zalo | unique `dedup_key` |
| zalo_booking_links | yes | `Restrict` | zalo | composite FK to bookings and conversations |
| zalo_staff_notifications | yes | kept | zalo | |

## Raw SQL objects
Machine-checked list: `apps/api/prisma/raw-objects.json` (`pnpm db:drift` fails if any is missing — Prisma itself is blind to them, ADR-0008).

| Object | Kind | Migration | Test |
|---|---|---|---|
| postgis, btree_gist, pg_trgm, unaccent, citext, pgcrypto | extension | `20261102000000_extensions` | `db:drift` |
| `subscriptions_one_current_per_salon` | partial unique index | `20261102115055_add_subscriptions_entitlements` | `subscriptions.int.test.ts` (one current per salon; concurrent startTrial) |
| `subscriptions_trial_ends_when_trialing` | check | `20261102115055_add_subscriptions_entitlements` | `db:drift` |
| `plan_prices_amount_non_negative` | check | `20261102115055_add_subscriptions_entitlements` | `db:drift` |
| `audit_logs_no_update_delete` (+ function `audit_logs_append_only`) | trigger | `20261102115341_add_identity_tenancy` | `auth.int.test.ts` (audit log is append-only); `db:drift` checks `triggers` |
| `locations_parent_by_level` | check | `20261102115341_add_identity_tenancy` | `db:drift` |
| `salon_members_one_owner` | partial unique index | `20261102115341_add_identity_tenancy` | `db:drift` |
| `magic_link_tokens_attempts_range` | check | `20261102115341_add_identity_tenancy` | `auth.int.test.ts` (code lock after 5 attempts) |
| `zalo_oa_connections_one_live_per_oa` | partial unique index | `20261102143451_add_zalo` | `db:drift`; OAuth callback maps P2002 → `zalo=oa_in_use` |
| `zalo_send_logs_valid`, `zalo_webhook_events_status_valid`, `zalo_oa_connections_tokens_when_connected` | check | `20261102143451_add_zalo` | `db:drift`; `zalo.int.test.ts` |

## Read-model registry
Base layer of the registries (X7): read models here → metric catalogue (07, `packages/domain/metrics`) → agent tools (08).
| Name | Permission | Scope | Untrusted fields | Endpoint |
|---|---|---|---|---|
| _(fill as implemented)_ | | | | |

## Outbox events
| Type | Producer | Consumers | Payload schema |
|---|---|---|---|
| _(fill as implemented)_ | | | |

## Queues
| Queue | Processor | Idempotency key | Retry policy |
|---|---|---|---|
| `maintenance` | `jobs/maintenance.processor.ts` (`heartbeat`) | caller-supplied `jobId` | `DEFAULT_JOB_OPTIONS`: 5 attempts, exponential 1 s |
| `zalo` | `jobs/zalo.processor.ts` (`zalo.inbound`, `zalo.send`, schedulers `zalo.minute`, `zalo.refresh_tokens`, `zalo.purge_events`) | `in-<eventId>`, `send-<firstLogId>`; rows deduped by `event_key` / `dedup_key` | `DEFAULT_JOB_OPTIONS`; last attempt marks rows failed |

## Error codes
Cross-cutting codes: `apps/api/src/common/problem/error-codes.ts` (`common.*`, lowercase dotted per `problemSchema`). To move to `packages/contracts/src/common/errors.ts` (architecture). Domain codes use `<domain>.<reason>`, e.g. `booking.slot_taken`.

## Commands
```bash
pnpm stack:up                      # Postgres+PostGIS, Valkey, MinIO (+bucket), Mailpit
pnpm stack:down | pnpm stack:reset # stop | stop and wipe volumes
pnpm dev:api                       # build + watch, API on API_PORT (default 3001); DEV_WORKER=1 adds the worker
pnpm db:migrate                    # prisma migrate dev (use --create-only for raw SQL, skill prisma-migration)
pnpm db:drift                      # prisma diff + raw-objects.json check
pnpm test:integration              # API against the local stack
pnpm --filter @gugu/api spike:s0   # re-run the 04-S0 spike
pnpm --filter @gugu/api build && pnpm --filter @gugu/api start   # production-style run
```

## ADRs
- [0008 — Prisma 7 + raw SQL boundary; API bundling](../adr/0008-prisma-raw-sql-boundary.md) (proposed)
- `0002-contracts-zod-openapi` from the spec is covered by ADR-0008 decision 7; topic 01's planned 0002/0003 keep their numbers.
