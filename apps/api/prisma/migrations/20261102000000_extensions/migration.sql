-- Extensions used by the data model (docs/tasks/04-backend-database.md §3.7, §3.8).
-- All are on the RDS PostgreSQL 18 allow-list. Created here, not in the Docker init script, so
-- dev, test and the later RDS target share one code path.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
