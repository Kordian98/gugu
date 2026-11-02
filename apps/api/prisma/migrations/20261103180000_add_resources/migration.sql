-- AlterTable
ALTER TABLE "booking_occupancy" ADD COLUMN     "resource_unit_id" UUID,
ALTER COLUMN "staff_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "resource_types" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "resource_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_units" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resource_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_resource_requirements" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "resource_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_resource_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_types_salon_id_sort_order_idx" ON "resource_types"("salon_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "resource_types_salon_id_id_key" ON "resource_types"("salon_id", "id");

-- CreateIndex
CREATE INDEX "resources_salon_id_resource_type_id_idx" ON "resources"("salon_id", "resource_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "resources_salon_id_id_key" ON "resources"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_units_salon_id_id_key" ON "resource_units"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_units_resource_id_position_key" ON "resource_units"("resource_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "service_resource_requirements_salon_id_id_key" ON "service_resource_requirements"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_resource_requirements_service_id_resource_type_id_key" ON "service_resource_requirements"("service_id", "resource_type_id");

-- CreateIndex
CREATE INDEX "booking_occupancy_salon_id_resource_unit_id_idx" ON "booking_occupancy"("salon_id", "resource_unit_id");

-- AddForeignKey
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_salon_id_resource_unit_id_fkey" FOREIGN KEY ("salon_id", "resource_unit_id") REFERENCES "resource_units"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_types" ADD CONSTRAINT "resource_types_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_salon_id_resource_type_id_fkey" FOREIGN KEY ("salon_id", "resource_type_id") REFERENCES "resource_types"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_units" ADD CONSTRAINT "resource_units_salon_id_resource_id_fkey" FOREIGN KEY ("salon_id", "resource_id") REFERENCES "resources"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resource_requirements" ADD CONSTRAINT "service_resource_requirements_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resource_requirements" ADD CONSTRAINT "service_resource_requirements_salon_id_resource_type_id_fkey" FOREIGN KEY ("salon_id", "resource_type_id") REFERENCES "resource_types"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw SQL objects (ADR-0008; listed in prisma/raw-objects.json) ─────────────────────────────

-- Each claim targets exactly one staff member or one resource unit.
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_one_target"
  CHECK (num_nonnulls("staff_id", "resource_unit_id") = 1);

-- No double booking of a unit (capacity N = N units, so this also enforces capacity, X4).
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_no_unit_overlap"
  EXCLUDE USING gist ("resource_unit_id" WITH =, "period" WITH &&)
  WHERE ("active" AND "resource_unit_id" IS NOT NULL);

ALTER TABLE "resource_types" ADD CONSTRAINT "resource_types_valid"
  CHECK (length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "resources" ADD CONSTRAINT "resources_valid"
  CHECK (length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "resource_units" ADD CONSTRAINT "resource_units_valid" CHECK ("position" >= 1);
ALTER TABLE "service_resource_requirements" ADD CONSTRAINT "service_resource_requirements_valid"
  CHECK ("quantity" BETWEEN 1 AND 3);
