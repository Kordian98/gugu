-- Runs once on an empty data volume. Extensions are created by Prisma migrations, not here
-- (docs/tasks/04-backend-database.md §3.7), so dev, test and later RDS share one code path.
CREATE DATABASE gugu_test;
-- Prisma shadow database for `migrate dev` and `db:drift`.
CREATE DATABASE gugu_shadow;
