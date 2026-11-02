---
name: backend-module
description: Procedure for adding or extending a NestJS module, endpoint, command, or read model in apps/api — Zod contract, OpenAPI, tenant guard, permissions, outbox events, tests. Use whenever you create files under apps/api/src/modules/ or add an /api/v1 route.
---

# Add a backend module, endpoint, or read model

Spec: `docs/tasks/04-backend-database.md` §4. Current state: `docs/domains/backend-database.md`.

## When to use
- New domain module (`apps/api/src/modules/<domain>`).
- New HTTP endpoint, command (write use case), or read model (query).
- Exposing data to the CRM dashboard or the AI agent (both consume read models).

## Invariants
- MUST define request/response schemas in Zod in `packages/contracts/src/<domain>/` — the single source for API, frontend, and agent tools. Pure business logic shared with the app goes in `packages/domain`. (There is no `packages/validation` or `packages/types`.)
- MUST keep controllers thin: parse → call application service → map response. No Prisma in controllers.
- MUST require `salonId` for every tenant-scoped repository method; take it from `RequestContext`, never from the body.
- MUST protect salon routes with the membership guard and a named permission (`@RequirePermission('bookings.read')`; matrix in `docs/tasks/05-*`).
- MUST emit cross-module side effects as outbox events in the same transaction — never call another module's repository or enqueue BullMQ directly from a command.
- MUST return errors as problem+json with a stable `code` registered in `packages/contracts/src/errors.ts`.
- MUST paginate lists with keyset cursors (`{ items, nextCursor }`, max `limit` declared).
- MUST NOT expose internal notes, attribution internals, tokens, or OTP data in customer-facing read models.
- MUST NOT add a hardcoded user-facing string; errors are codes, the client translates.

## Procedure: new module
1. Create `apps/api/src/modules/<domain>/` with `<domain>.module.ts`, `http/`, `application/commands/`, `application/queries/`, `infra/`, `tests/`, `<domain>.read-models.ts`.
2. Register the module in `app.module.ts`; export only its query services (and command services if another module truly needs them).
3. Add tables via skill `prisma-migration`.
4. Add a section for the module in `docs/domains/backend-database.md` (tables owned, events emitted/consumed, read models).

## Procedure: new endpoint (command)
1. Zod: `packages/contracts/src/<domain>/<action>.ts` — `XxxInput`, `XxxResult`.
2. Command service `application/commands/<action>.command.ts`: validate business rules, run in `prisma.$transaction`, write outbox event(s), return result.
3. Controller method: route under `/api/v1/salons/:salonId/...` for tenant data, `/api/v1/me/...` for customer data, `/api/v1/public/...` for unauthenticated reads, `/api/v1/admin/...` for platform admin.
4. Decorators: Zod validation pipe, `@RequirePermission`, OpenAPI `summary` + `operationId` (`<domain>.<action>`), response schema, documented error codes.
5. If POST creates something clients may retry (bookings, reviews, uploads): accept `Idempotency-Key` via the idempotency interceptor.
6. Audit: sensitive actions (role change, suspension, data export, deletion, settings change) write `AuditLog`.

## Procedure: new read model (query)
1. Zod `XxxQuery` + `XxxReadModel` in `packages/contracts`.
2. Query service method in `application/queries/` — scoped by `salonId`, explicit `deleted_at IS NULL` where relevant, no N+1 (use `include`/`select` or TypedSQL), aggregates from `salon_daily_metrics` rather than scanning bookings.
3. Register in `<domain>.read-models.ts`:
   ```ts
   export const readModels = {
     'bookings.summary': {
       description: 'Counts of bookings by status for a salon over a date range (salon timezone).',
       input: BookingsSummaryQuery, output: BookingsSummary,
       permission: 'bookings.read', scope: 'salon', maxRange: { days: 366 },
       untrustedFields: [], handler: 'BookingsQueries.summary',
     },
   } satisfies ReadModelRegistry;
   ```
   The description is reused verbatim as the OpenAPI summary and the AI agent tool description — write it for both.
4. Expose via a GET controller (thin wrapper). Do not write agent-specific code here. Layering: this registry → topic 07 metric catalogue (`packages/domain/metrics`, defined on read models) → topic 08 agent tools generated from both. If a dashboard number is needed, add a read model here and a metric in 07's catalogue — never a query in the metric layer.
5. Mark customer-authored free text in `untrustedFields`.

## Tests (required)
- Unit: business rules in commands, mapping, permission metadata present.
- Integration (Testcontainers Postgres+PostGIS, real Redis): happy path, validation error, permission denied, **cross-tenant access returns 404** (use an ID from another salon), idempotent replay, outbox event written once.
- Contract: registry ↔ OpenAPI consistency test passes; regenerate `packages/api-client` and type-check.

## Checklist before PR
- [ ] Zod schemas in `packages/contracts`, no duplicated types
- [ ] Permission + tenant guard on every salon route; cross-tenant test
- [ ] OpenAPI shows request, response, errors
- [ ] Outbox event instead of direct cross-module call
- [ ] Logs contain no phone/email/notes/OTP
- [ ] Docs updated: `docs/domains/backend-database.md` (+ domain doc of the module owner)
