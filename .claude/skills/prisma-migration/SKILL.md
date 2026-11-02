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
2. `pnpm --filter api prisma migrate dev --create-only --name <verb_noun>` (e.g. `add_booking_service`).
3. Open the generated `migration.sql` and append raw objects. Patterns:
   ```sql
   -- extensions (first migration only)
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS unaccent;
   CREATE EXTENSION IF NOT EXISTS citext;

   -- generated range incl. buffers
   ALTER TABLE booking_services ADD COLUMN slot tstzrange
     GENERATED ALWAYS AS (tstzrange(starts_at - make_interval(mins => buffer_before_minutes),
                                    ends_at   + make_interval(mins => buffer_after_minutes), '[)')) STORED;

   -- staff overlap protection (final predicate agreed with booking engine, topic 06)
   ALTER TABLE booking_services ADD CONSTRAINT booking_services_no_staff_overlap
     EXCLUDE USING gist (salon_id WITH =, staff_id WITH =, slot WITH &&) WHERE (is_active);

   -- geo index
   CREATE INDEX salon_locations_geo_gix ON salon_locations USING gist (geo);

   -- partial unique
   CREATE UNIQUE INDEX salon_locations_one_primary ON salon_locations (salon_id) WHERE is_primary;

   -- checks
   ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
   ```
   `unaccent()` is not IMMUTABLE — wrap it in an immutable SQL function before using it in an index or generated column.
4. If the change touches PostGIS or overlap queries, add/update TypedSQL files in `apps/api/prisma/sql/` and run `prisma generate --sql`.
5. Apply: `pnpm --filter api prisma migrate dev`; then run the drift check `pnpm --filter api db:drift` (wraps `prisma migrate diff`). If Prisma wants to drop a raw object, record it in the inventory and confirm the check ignores it — never let a later migration silently remove it.
6. Data backfills: separate migration or a one-off job script in `apps/api/src/jobs/maintenance/`, batched, resumable.
7. Update `docs/domains/backend-database.md`: entity table, raw SQL inventory row (object, migration, test name), ERD notes.

## Tests (required)
- Constraint tests for every new CHECK/UNIQUE/EXCLUDE (expect SQLSTATE `23514`/`23505`/`23P01`).
- Composite-FK test: cross-tenant reference rejected.
- Concurrency test for exclusion constraints (parallel transactions, exactly one wins).
- EXPLAIN-based test for new GiST/GIN indexes on the queries that need them.
- Migration from empty DB in CI (Testcontainers `postgis/postgis` image matching prod major version).

## Checklist before PR
- [ ] `--create-only` used; raw SQL reviewed
- [ ] Drift check green
- [ ] Inventory + domain doc updated
- [ ] No destructive single-step change on live columns
- [ ] Constraint and tenant tests added
- [ ] Seed data (`prisma/seed.ts`) updated if needed — dev-only, never production salon data
