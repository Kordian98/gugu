-- Raw SQL: extensions (Prisma does not manage them; postgresqlExtensions is not used).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "spike_locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "geo" geography(Point,4326),

    CONSTRAINT "spike_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spike_occupancy" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "range" tstzrange NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "spike_occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spike_locations_geo_idx" ON "spike_locations" USING GIST ("geo");


-- Raw SQL: objects Prisma cannot model.
ALTER TABLE "spike_occupancy" ADD CONSTRAINT "spike_occupancy_no_staff_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, "range" WITH &&) WHERE ("active");
ALTER TABLE "spike_occupancy" ADD CONSTRAINT "spike_occupancy_range_not_empty"
  CHECK (NOT isempty("range"));
CREATE UNIQUE INDEX "spike_locations_name_unplaced_uq" ON "spike_locations" ("name") WHERE "geo" IS NULL;
