-- CreateEnum
CREATE TYPE "confirmation_mode" AS ENUM ('auto', 'manual');

-- CreateTable
CREATE TABLE "salon_settings" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "booking_window_days" INTEGER NOT NULL DEFAULT 60,
    "min_lead_time_minutes" INTEGER NOT NULL DEFAULT 60,
    "cancellation_cutoff_minutes" INTEGER NOT NULL DEFAULT 120,
    "reschedule_cutoff_minutes" INTEGER NOT NULL DEFAULT 120,
    "confirmation_mode" "confirmation_mode" NOT NULL DEFAULT 'auto',
    "manual_confirm_window_hours" INTEGER NOT NULL DEFAULT 12,
    "confirm_new_clients" BOOLEAN NOT NULL DEFAULT false,
    "hide_staff_choice" BOOLEAN NOT NULL DEFAULT false,
    "max_active_bookings_per_phone" INTEGER NOT NULL DEFAULT 3,
    "slot_granularity_minutes" INTEGER NOT NULL DEFAULT 15,
    "hold_ttl_minutes" INTEGER NOT NULL DEFAULT 7,
    "reminder_offsets" INTEGER[] DEFAULT ARRAY[1440, 120]::INTEGER[],
    "description" JSONB,
    "booking_policy" JSONB,
    "cancellation_policy" JSONB,
    "availability_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salon_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_opening_hours" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "opens_at" TIME(0) NOT NULL,
    "closes_at" TIME(0) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salon_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_holidays" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT true,
    "opens_at" TIME(0),
    "closes_at" TIME(0),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salon_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "salon_member_id" UUID,
    "display_name" TEXT NOT NULL,
    "bio" JSONB,
    "color" TEXT NOT NULL DEFAULT 'lilac',
    "is_bookable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedules" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "starts_at" TIME(0) NOT NULL,
    "ends_at" TIME(0) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_breaks" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "weekday" SMALLINT,
    "date" DATE,
    "starts_at" TIME(0) NOT NULL,
    "ends_at" TIME(0) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_time_off" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_services" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "variant_id" UUID,
    "price_override_minor" BIGINT,
    "duration_override_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "category_id" UUID,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "price_amount_minor" BIGINT NOT NULL,
    "price_max_amount_minor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "duration_minutes" INTEGER NOT NULL,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "booking_restrictions" JSONB,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_variants" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "price_amount_minor" BIGINT,
    "price_max_amount_minor" BIGINT,
    "duration_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_addons" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "extra_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "extra_price_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "extra_price_max_amount_minor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "max_quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_invitations" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "role" "salon_role" NOT NULL,
    "email" CITEXT,
    "staff_profile_id" UUID,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salon_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salon_settings_salon_id_key" ON "salon_settings"("salon_id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_settings_salon_id_id_key" ON "salon_settings"("salon_id", "id");

-- CreateIndex
CREATE INDEX "salon_opening_hours_salon_id_weekday_idx" ON "salon_opening_hours"("salon_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "salon_opening_hours_salon_id_id_key" ON "salon_opening_hours"("salon_id", "id");

-- CreateIndex
CREATE INDEX "salon_holidays_salon_id_start_date_idx" ON "salon_holidays"("salon_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "salon_holidays_salon_id_id_key" ON "salon_holidays"("salon_id", "id");

-- CreateIndex
CREATE INDEX "staff_profiles_salon_id_sort_order_idx" ON "staff_profiles"("salon_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_salon_id_id_key" ON "staff_profiles"("salon_id", "id");

-- CreateIndex
CREATE INDEX "staff_schedules_salon_id_staff_id_weekday_idx" ON "staff_schedules"("salon_id", "staff_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedules_salon_id_id_key" ON "staff_schedules"("salon_id", "id");

-- CreateIndex
CREATE INDEX "staff_breaks_salon_id_staff_id_idx" ON "staff_breaks"("salon_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_breaks_salon_id_id_key" ON "staff_breaks"("salon_id", "id");

-- CreateIndex
CREATE INDEX "staff_time_off_salon_id_staff_id_starts_at_idx" ON "staff_time_off"("salon_id", "staff_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_time_off_salon_id_id_key" ON "staff_time_off"("salon_id", "id");

-- CreateIndex
CREATE INDEX "staff_services_salon_id_service_id_idx" ON "staff_services"("salon_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_services_salon_id_id_key" ON "staff_services"("salon_id", "id");

-- CreateIndex
CREATE INDEX "services_salon_id_sort_order_idx" ON "services"("salon_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "services_salon_id_id_key" ON "services"("salon_id", "id");

-- CreateIndex
CREATE INDEX "service_variants_salon_id_service_id_idx" ON "service_variants"("salon_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_variants_salon_id_id_key" ON "service_variants"("salon_id", "id");

-- CreateIndex
CREATE INDEX "service_addons_salon_id_service_id_idx" ON "service_addons"("salon_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_addons_salon_id_id_key" ON "service_addons"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_invitations_token_hash_key" ON "salon_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "salon_invitations_salon_id_created_at_idx" ON "salon_invitations"("salon_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "salon_invitations_salon_id_id_key" ON "salon_invitations"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "salon_settings" ADD CONSTRAINT "salon_settings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_opening_hours" ADD CONSTRAINT "salon_opening_hours_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_holidays" ADD CONSTRAINT "salon_holidays_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_salon_id_salon_member_id_fkey" FOREIGN KEY ("salon_id", "salon_member_id") REFERENCES "salon_members"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_breaks" ADD CONSTRAINT "staff_breaks_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_salon_id_variant_id_fkey" FOREIGN KEY ("salon_id", "variant_id") REFERENCES "service_variants"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_invitations" ADD CONSTRAINT "salon_invitations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_invitations" ADD CONSTRAINT "salon_invitations_salon_id_staff_profile_id_fkey" FOREIGN KEY ("salon_id", "staff_profile_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_invitations" ADD CONSTRAINT "salon_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_invitations" ADD CONSTRAINT "salon_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw objects Prisma cannot model (ADR-0008; listed in prisma/raw-objects.json) ─────────────

-- Wall-clock intervals and weekdays.
ALTER TABLE "salon_opening_hours" ADD CONSTRAINT "salon_opening_hours_valid"
  CHECK (weekday BETWEEN 1 AND 7 AND opens_at < closes_at);
ALTER TABLE "salon_holidays" ADD CONSTRAINT "salon_holidays_valid"
  CHECK (start_date <= end_date
    AND (closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)));
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_valid"
  CHECK (weekday BETWEEN 1 AND 7 AND starts_at < ends_at
    AND (effective_to IS NULL OR effective_from <= effective_to));
ALTER TABLE "staff_breaks" ADD CONSTRAINT "staff_breaks_valid"
  CHECK (num_nonnulls(weekday, date) = 1 AND (weekday IS NULL OR weekday BETWEEN 1 AND 7)
    AND starts_at < ends_at);

-- Time off: GiST expression index for the engine's overlap queries (06), which use
-- `tstzrange(starts_at, ends_at, '[)')`. An expression index is invisible to Prisma (ADR-0008).
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_valid" CHECK (starts_at < ends_at);
CREATE INDEX "staff_time_off_period_gix"
  ON "staff_time_off" USING gist (salon_id, staff_id, tstzrange(starts_at, ends_at, '[)'));

-- Catalog money and durations.
ALTER TABLE "services" ADD CONSTRAINT "services_amounts_valid"
  CHECK (price_amount_minor >= 0
    AND (price_max_amount_minor IS NULL OR price_max_amount_minor >= price_amount_minor)
    AND duration_minutes BETWEEN 5 AND 1440
    AND buffer_before_minutes >= 0 AND buffer_after_minutes >= 0);
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_amounts_valid"
  CHECK ((price_amount_minor IS NULL OR price_amount_minor >= 0)
    AND (price_max_amount_minor IS NULL OR price_amount_minor IS NULL
      OR price_max_amount_minor >= price_amount_minor)
    AND (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440));
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_amounts_valid"
  CHECK (extra_price_amount_minor >= 0 AND extra_duration_minutes BETWEEN 0 AND 600
    AND (extra_price_max_amount_minor IS NULL
      OR extra_price_max_amount_minor >= extra_price_amount_minor)
    AND max_quantity >= 1);

-- One assignment per (staff, service, variant); NULL variant = whole service. Two partial indexes
-- (= NULLS NOT DISTINCT; partial indexes are invisible to Prisma, ADR-0008).
CREATE UNIQUE INDEX "staff_services_unique_service"
  ON "staff_services" (salon_id, staff_id, service_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX "staff_services_unique_variant"
  ON "staff_services" (salon_id, staff_id, service_id, variant_id) WHERE variant_id IS NOT NULL;

-- One staff profile per member (when linked).
CREATE UNIQUE INDEX "staff_profiles_one_per_member"
  ON "staff_profiles" (salon_id, salon_member_id) WHERE salon_member_id IS NOT NULL AND deleted_at IS NULL;

-- Settings row for every existing salon (new salons get one lazily on first read/write).
INSERT INTO "salon_settings" (id, salon_id, updated_at)
SELECT uuidv7(), s.id, now() FROM "salons" s
ON CONFLICT (salon_id) DO NOTHING;
