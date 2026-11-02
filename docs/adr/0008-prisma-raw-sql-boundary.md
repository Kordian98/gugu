# 0008 — Prisma 7 + raw SQL boundary, and how the API is built

- **Status:** proposed
- **Date:** 2026-11-02
- **Owner:** backend-database · **Topic:** 04 (spike 04-S0, shell 04-S1)

## Context
The data model needs PostGIS columns, exclusion constraints for booking overlap (topic 06, X4), partial indexes and later RLS. Prisma 7 (7.10.1) can't model any of these, and Prisma 7 itself changed: no Rust engine, a mandatory driver adapter, `prisma.config.ts`, and env vars that aren't loaded for you. NestJS 12 is ESM-only, and `@gugu/contracts` ships TypeScript source with extensionless imports. Spec: `docs/tasks/04-backend-database.md` §2 (G1, G2), §3.7.

Spike: `pnpm --filter @gugu/api spike:s0`. It uses `apps/api/prisma/spike/` and `apps/api/test/spike/s0.int.test.ts` against the local stack (PostgreSQL 18.6, PostGIS 3.6.3). It passed three runs in a row on 2026-11-02.

| Question | Result |
|---|---|
| `Unsupported("geography(Point,4326)")` + `@@index([geo], type: Gist)` | Works. Prisma generates the column and the GiST index; a raw `ST_DWithin` query uses that index. |
| Prisma Client on models with `Unsupported` columns | Optional column: `create`/`findMany` work, and the geography is written with tagged `$executeRaw`. Required column: `create` is left out of the types (reads still work), so those rows are written with raw SQL. |
| Does `prisma migrate diff` (migrations → schema, and database → schema) drop raw objects (EXCLUDE, CHECK, partial unique index, PostGIS `spatial_ref_sys`)? | **No.** Both diffs are empty (exit 0). A later `migrate dev --create-only` after a schema change produced only `ADD COLUMN`. |
| Does Prisma notice a raw object that is missing? | **No.** After dropping the EXCLUDE constraint from the database, `migrate diff` still exits 0. Prisma is blind to these objects. |
| Exclusion constraint under concurrency (20 parallel overlapping inserts) | Exactly one wins. The losers get `23P01`, **or sometimes `40P01` (deadlock detected)**, and the slow cases took about 17 s while Postgres resolved them. With `pg_advisory_xact_lock(hashtextextended(staff_id, 0))` taken before the insert: one winner, 19 × `23P01`, no deadlocks, about 60 ms. |
| Inactive rows (`WHERE (active)`) | Ignored by the constraint, as intended. |
| UUIDv7 | Prisma `@default(uuid(7))` works with the adapter; PG 18 `uuidv7()` works in raw SQL. |

## Decision
1. Prisma owns ordinary tables and columns. Anything Prisma can't express MUST go into hand-edited SQL inside a Prisma migration (`migrate dev --create-only`). Raw SQL MUST use TypedSQL or tagged `$queryRaw`/`$executeRaw`; never build SQL strings.
2. Every raw object MUST be listed in `apps/api/prisma/raw-objects.json`. `pnpm db:drift` fails if `prisma migrate diff --exit-code` reports drift **or** if a listed extension, constraint or index is missing from the database.
3. Extensions are created by migration `20261102000000_extensions`, not by the Docker init script, so local, CI and RDS share one path.
4. Booking writes (topic 06) MUST map `23P01` **and** `40P01` to `booking.slot_taken` (or retry once). They SHOULD take a per-staff / per-resource-unit `pg_advisory_xact_lock` before writing to `booking_occupancy`, so contention serializes instead of deadlocking. The constraint stays the guarantee; the lock is only for latency and predictability.
5. Prisma 7 runs with `@prisma/adapter-pg`. The pool size is set explicitly (`DATABASE_POOL_MAX`) because adapter pools use node-postgres defaults. `prisma.config.ts` loads the root `.env`.
6. **The API is bundled** with rolldown + `unplugin-swc` (`apps/api/rolldown.config.ts`):
   - SWC emits the decorator metadata Nest DI needs.
   - Workspace packages (`@gugu/*`) are bundled from source; npm packages stay external.
   - `tsconfig` uses `module: Preserve` / `moduleResolution: Bundler`.
   - Tests run through Vitest with the same SWC plugin.
7. Request validation and OpenAPI use NestJS 12's built-in Standard Schema support:
   - Inputs: `@Body({ schema })` with Zod from `@gugu/contracts` and a global `StandardSchemaValidationPipe`.
   - Responses: `@ApiResponse({ standardSchema })`.
   - Zod schemas are converted to OpenAPI automatically. **No `nestjs-zod`:** its peer range stops at Nest 11.
8. Local connection URLs use `127.0.0.1`, not `localhost`. Docker Desktop publishes the ports on IPv4 only, and `localhost` resolving to `::1` made concurrent pg connections stall intermittently during the spike.

## Alternatives considered
- **Drizzle / Kysely instead of Prisma.** These model PostGIS and constraints better, but Prisma is the agreed stack (master prompt §3.3), and the boundary above covers the gaps.
- **Prisma `postgresqlExtensions` to manage extensions.** Not needed: Prisma ignores extensions and PostGIS tables when they aren't declared, and the diff stays empty.
- **PostGIS in a separate `extensions` schema.** Not needed for the same reason. Revisit if a Prisma upgrade starts seeing `spatial_ref_sys`.
- **Building `@gugu/contracts` to `dist`.** That would change topic 01's package model for one consumer. Bundling the API keeps contracts source-only, like the Expo app consumes it.
- **`tsc` + Node's native type stripping.** Neither emits decorator metadata, and Node won't resolve the extensionless imports in contracts.
- **SERIALIZABLE transactions instead of advisory locks.** Contention would then surface as `40001` retries. Advisory locks scoped to the claimed resource are cheaper and more predictable.

## Consequences
- Agents MUST update `raw-objects.json` with every raw migration object (skill `prisma-migration`), or `db:drift` fails.
- `db:drift` needs a database. It runs against the local stack, not inside `pnpm verify`; CI wiring belongs to topic 13.
- Topic 06 adopts decision 4 in its engine and its concurrency harness (13-M13.5b).
- `pnpm build` produces `dist/main.js` and `dist/worker.js`. Source maps are on (`--enable-source-maps`).
- Revisit when Prisma 8 ships stable (it is RC as of 2026-11-02, and npm's `latest` tag currently points at the RC; we pin 7.10.1), or when Prisma adds PostGIS types.
