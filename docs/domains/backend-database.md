# Backend core & database — domain reference

Durable reference for the GuGu API's structure and data model. Read this to find where something lives and which invariants protect it. The task spec with rationale is `docs/tasks/04-backend-database.md`; this file records what is actually implemented.

**Status:** not implemented — skeleton. Update every section as code lands.

## Quick facts
- Runtime: NestJS modular monolith, `apps/api`; workers share the codebase with a separate entrypoint.
- DB: PostgreSQL + PostGIS, Prisma 7 (`@prisma/adapter-pg`, `prisma.config.ts`).
- Contracts: Zod in `packages/validation` → OpenAPI `/api/v1/docs` → `packages/api-client`.
- Owner agent: `.claude/agents/backend-database.md`. Skills: `backend-module`, `prisma-migration`.

## Invariants
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
| _(e.g. `booking_services_no_staff_overlap`)_ | EXCLUDE | | |

## Read-model registry
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
See `packages/validation/src/errors.ts`; list domain-specific codes here.

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
