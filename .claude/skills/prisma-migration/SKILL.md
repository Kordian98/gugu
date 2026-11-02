---
name: prisma-migration
description: Procedure for changing the GuGu database schema with Prisma 7 migrations, including raw SQL objects Prisma cannot model (PostGIS geography, exclusion constraints, GiST/GIN/partial indexes, generated columns, RLS, partitions). Use before editing apps/api/prisma/schema.prisma or adding files in apps/api/prisma/migrations or prisma/sql.
---

# Database migration (Prisma + raw SQL)

Spec: `docs/tasks/04-backend-database.md` §3. Raw object inventory: `docs/domains/backend-database.md#raw-sql-objects`.

## When to use
Any new table, column, index, constraint, enum value, extension, view, policy, or data backfill.

## Background: what Prisma 7 can't model
- No native geometry/geography type → columns are `Unsupported("geography(Point,4326)")`; Prisma Client can't read/write them → use TypedSQL (`prisma/sql/*.sql`) or tagged `$queryRaw`.
- No exclusion constraints, GiST/GIN indexes on unsupported columns, generated `tstzrange` columns, RLS policies, or partitions in the schema → write them in the migration SQL.
- Prisma 7 uses a driver adapter (`@prisma/adapter-pg`) and `prisma.config.ts`; env vars are not auto-loaded.

## Target database
Local: PostgreSQL 18.6 + PostGIS 3.6.3 built from `infra/docker/postgres/Dockerfile` (port 15432, use `127.0.0.1`). Later target: Amazon RDS for PostgreSQL 18 in `ap-southeast-1`. Allowed extensions (on the RDS allow-list, verified 2026-11-02): `postgis`, `btree_gist`, `pg_trgm`, `unaccent`, `citext`, `pgcrypto`. Do not add any other extension without checking `SHOW rds.extensions;` and updating the spec. UUID v7: Prisma `@default(uuid(7))`; raw SQL uses native `uuidv7()` (PG 18) — there is no `pg_uuidv7` extension on RDS.

## Invariants
- MUST follow conventions: UUID v7 PK, `snake_case` tables via `@@map`, `created_at/updated_at timestamptz`, money as `BIGINT` minor + `currency CHAR(3)`.
- Tenant tables MUST have `salon_id NOT NULL`, `@@unique([salonId, id])`, and composite FKs `(salon_id, parent_id) → parent(salon_id, id)`.
- Historical tables MUST use `onDelete: Restrict`. No `Cascade` without a written reason.
- MUST NOT edit an applied migration. Fix forward with a new migration.
- MUST NOT drop/rename columns in one step on live data: expand → backfill → switch reads → contract (separate migrations/releases).
- Raw SQL objects MUST be idempotent-safe within the migration and listed in the inventory with a test.
- `prisma migrate diff` (migrations vs schema) MUST stay empty in CI.

## Procedure
1. Edit `schema.prisma` for everything Prisma can express.
2. `pnpm --filter @gugu/api db:migrate --create-only --name <verb_noun>` (e.g. `add_booking_occupancy`).
3. Open the generated `migration.sql` and append raw objects. Patterns:
   ```sql
   -- extensions (first migration only)
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS unaccent;
   CREATE EXTENSION IF NOT EXISTS citext;

   -- overlap protection: only on booking_occupancy (engine-owned, topic 06).
   -- capacity N resource = N resource_unit rows, so one constraint covers capacity too.
   ALTER TABLE booking_occupancy ADD CONSTRAINT booking_occupancy_no_staff_overlap
     EXCLUDE USING gist (staff_id WITH =, "range" WITH &&) WHERE (active AND staff_id IS NOT NULL);
   ALTER TABLE booking_occupancy ADD CONSTRAINT booking_occupancy_no_unit_overlap
     EXCLUDE USING gist (resource_unit_id WITH =, "range" WITH &&) WHERE (active AND resource_unit_id IS NOT NULL);
   ALTER TABLE booking_occupancy ADD CONSTRAINT booking_occupancy_one_target
     CHECK (num_nonnulls(staff_id, resource_unit_id) = 1);

   -- geo index
   CREATE INDEX salon_locations_geo_gix ON salon_locations USING gist (geo);

   -- partial unique
   CREATE UNIQUE INDEX salon_locations_one_primary ON salon_locations (salon_id) WHERE is_primary;

   -- checks
   ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
   ```
   `unaccent()` is not IMMUTABLE — wrap it in an immutable SQL function before using it in an index or generated column.
4. If the change touches PostGIS or overlap queries, add/update TypedSQL files in `apps/api/prisma/sql/` and run `prisma generate --sql`.
5. Add every raw object (constraint/index/extension name) to `apps/api/prisma/raw-objects.json`. Prisma never drops these, but it also never notices when one is missing (ADR-0008) — `db:drift` is the only guard.
6. Apply: `pnpm db:migrate`; then `pnpm db:drift` (Prisma diff migrations→schema + raw-objects check against `DATABASE_URL`). Both must pass.
7. Data backfills: separate migration or a one-off job script in `apps/api/src/jobs/maintenance/`, batched, resumable.
8. Update `docs/domains/backend-database.md`: entity table, raw SQL inventory row (object, migration, test name), ERD notes.

## Tests (required)
- Do not add `SELECT … FOR UPDATE` capacity counting; add resource units instead (load skill `booking-engine`).
- Constraint tests for every new CHECK/UNIQUE/EXCLUDE (expect SQLSTATE `23514`/`23505`/`23P01`).
- Composite-FK test: cross-tenant reference rejected.
- Concurrency test for exclusion constraints (parallel transactions, exactly one wins).
- EXPLAIN-based test for new GiST/GIN indexes on the queries that need them.
- Migration from empty DB against the local stack image `gugu/postgres:18.6-postgis-3.6.3` (`infra/docker/postgres/Dockerfile`; `postgis/postgis` has no arm64 build).

## Checklist before PR
- [ ] `--create-only` used; raw SQL reviewed
- [ ] Drift check green
- [ ] Inventory + domain doc updated
- [ ] No destructive single-step change on live columns
- [ ] Constraint and tenant tests added
- [ ] Seed data (`prisma/seed.ts`) updated if needed — dev-only, never production salon data
