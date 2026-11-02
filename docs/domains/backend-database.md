# Backend core & database — domain reference

Durable reference for the GuGu API's structure and data model. Read this to find where something lives and which invariants protect it. The task spec with rationale is `docs/tasks/04-backend-database.md`; this file records what is actually implemented.

**Status:** not implemented — skeleton. Update every section as code lands.

## Quick facts
- Runtime: NestJS modular monolith, `apps/api`; workers share the codebase with a separate entrypoint.
- DB: Amazon RDS for PostgreSQL 18 (`ap-southeast-1`) + PostGIS 3.6; local `postgis/postgis:18-3.6`. Prisma 7 (`@prisma/adapter-pg`, `prisma.config.ts`).
- Extensions: postgis, btree_gist, pg_trgm, unaccent, citext, pgcrypto (all on RDS allow-list, checked 2026-11-02). UUID v7 via Prisma / native `uuidv7()`.
- Object storage: S3 (`ap-southeast-1`), MinIO locally; Cloudflare CDN in front.
- Contracts: Zod in `packages/contracts` → OpenAPI `/api/v1/docs` → `packages/api-client`. Pure logic in `packages/domain`.
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
| _(fill as implemented)_ | | | | | |

## Entities
| Table | Tenant | Deletion policy | Owner module | Notes |
|---|---|---|---|---|
| _(fill as implemented)_ | | | | |

## Raw SQL objects
| Object | Kind | Migration | Test |
|---|---|---|---|
| _(e.g. `booking_occupancy_no_staff_overlap`, `booking_occupancy_no_unit_overlap`)_ | EXCLUDE | | |

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

## Error codes
See `packages/contracts/src/errors.ts`; list domain-specific codes here.

## Commands
```bash
pnpm --filter api prisma migrate dev --create-only --name <name>
pnpm --filter api prisma migrate dev
pnpm --filter api db:drift
pnpm --filter api prisma generate --sql
pnpm --filter api test:integration
```
_(verify and update once scripts exist)_

## ADRs
- `docs/adr/0001-prisma-raw-sql-boundary.md` _(planned)_
- `docs/adr/0002-contracts-zod-openapi.md` _(planned)_
