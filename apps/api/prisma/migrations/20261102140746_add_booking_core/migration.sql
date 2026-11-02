-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled_by_customer', 'cancelled_by_salon', 'no_show');

-- CreateEnum
CREATE TYPE "booking_source" AS ENUM ('marketplace', 'salon_profile', 'direct_link', 'qr_code', 'social_media', 'repeat_customer', 'staff_created', 'walk_in', 'phone', 'zalo_chat', 'zalo_oa', 'zalo_link', 'zalo_mini_app', 'promoted_listing', 'gugu_campaign', 'ai_agent');

-- CreateEnum
CREATE TYPE "booking_actor_type" AS ENUM ('customer', 'salon_member', 'ai_agent', 'system');

-- CreateEnum
CREATE TYPE "occupancy_kind" AS ENUM ('booking', 'hold');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('pay_at_salon');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "reference_code" TEXT NOT NULL,
    "status" "booking_status" NOT NULL,
    "source" "booking_source" NOT NULL,
    "created_by_actor_type" "booking_actor_type" NOT NULL,
    "created_by_user_id" UUID,
    "customer_user_id" UUID,
    "customer_name" TEXT,
    "customer_phone_e164" TEXT,
    "customer_phone_hash" TEXT,
    "identity_verified" BOOLEAN NOT NULL DEFAULT false,
    "customer_note" TEXT,
    "staff_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "total_price_minor" BIGINT NOT NULL,
    "total_price_max_minor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "payment_method" "payment_method" NOT NULL DEFAULT 'pay_at_salon',
    "late_cancellation" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_reason" TEXT,
    "rule_overrides" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "override_reason" TEXT,
    "manage_token_hash" TEXT,
    "manage_token_expires_at" TIMESTAMPTZ(6),
    "pending_expires_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_services" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "service_id" UUID NOT NULL,
    "variant_id" UUID,
    "staff_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "name" JSONB NOT NULL,
    "variant_name" JSONB,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_before_minutes" INTEGER NOT NULL,
    "buffer_after_minutes" INTEGER NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "price_max_minor" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_service_addons" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "booking_service_id" UUID NOT NULL,
    "add_on_id" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "extra_duration_minutes" INTEGER NOT NULL,
    "extra_price_minor" BIGINT NOT NULL,
    "extra_price_max_minor" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_service_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_holds" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "variant_id" UUID,
    "add_on_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "device_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_occupancy" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "kind" "occupancy_kind" NOT NULL,
    "booking_id" UUID,
    "hold_id" UUID,
    "staff_id" UUID NOT NULL,
    "period" tstzrange NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_occupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "booking_status",
    "to_status" "booking_status" NOT NULL,
    "actor_type" "booking_actor_type" NOT NULL,
    "actor_id" UUID,
    "reason_code" TEXT,
    "reason_text" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "salon_id" UUID,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_manage_token_hash_key" ON "bookings"("manage_token_hash");

-- CreateIndex
CREATE INDEX "bookings_salon_id_starts_at_idx" ON "bookings"("salon_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_salon_id_staff_id_starts_at_idx" ON "bookings"("salon_id", "staff_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_salon_id_customer_phone_hash_idx" ON "bookings"("salon_id", "customer_phone_hash");

-- CreateIndex
CREATE INDEX "bookings_status_pending_expires_at_idx" ON "bookings"("status", "pending_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_salon_id_id_key" ON "bookings"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_salon_id_reference_code_key" ON "bookings"("salon_id", "reference_code");

-- CreateIndex
CREATE UNIQUE INDEX "booking_services_salon_id_id_key" ON "booking_services"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_services_booking_id_sequence_key" ON "booking_services"("booking_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "booking_service_addons_salon_id_id_key" ON "booking_service_addons"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_service_addons_booking_service_id_add_on_id_key" ON "booking_service_addons"("booking_service_id", "add_on_id");

-- CreateIndex
CREATE INDEX "booking_holds_salon_id_device_hash_idx" ON "booking_holds"("salon_id", "device_hash");

-- CreateIndex
CREATE INDEX "booking_holds_expires_at_idx" ON "booking_holds"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_holds_salon_id_id_key" ON "booking_holds"("salon_id", "id");

-- CreateIndex
CREATE INDEX "booking_occupancy_salon_id_staff_id_idx" ON "booking_occupancy"("salon_id", "staff_id");

-- CreateIndex
CREATE INDEX "booking_occupancy_booking_id_idx" ON "booking_occupancy"("booking_id");

-- CreateIndex
CREATE INDEX "booking_occupancy_hold_id_idx" ON "booking_occupancy"("hold_id");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_occurred_at_idx" ON "booking_status_history"("booking_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_route_key_key" ON "idempotency_keys"("scope", "route", "key");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_salon_id_variant_id_fkey" FOREIGN KEY ("salon_id", "variant_id") REFERENCES "service_variants"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_service_addons" ADD CONSTRAINT "booking_service_addons_salon_id_booking_service_id_fkey" FOREIGN KEY ("salon_id", "booking_service_id") REFERENCES "booking_services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_service_addons" ADD CONSTRAINT "booking_service_addons_salon_id_add_on_id_fkey" FOREIGN KEY ("salon_id", "add_on_id") REFERENCES "service_addons"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_salon_id_service_id_fkey" FOREIGN KEY ("salon_id", "service_id") REFERENCES "services"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_salon_id_hold_id_fkey" FOREIGN KEY ("salon_id", "hold_id") REFERENCES "booking_holds"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_salon_id_staff_id_fkey" FOREIGN KEY ("salon_id", "staff_id") REFERENCES "staff_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw SQL objects (ADR-0008; listed in prisma/raw-objects.json) ─────────────────────────────

-- No double booking: one staff member can't hold two overlapping active claims (bookings and
-- holds alike). Half-open ranges, so back-to-back appointments don't conflict. btree_gist is
-- created by 20261102000000_extensions.
ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_no_staff_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, "period" WITH &&) WHERE ("active");

ALTER TABLE "booking_occupancy" ADD CONSTRAINT "booking_occupancy_valid"
  CHECK (
    NOT isempty("period") AND NOT lower_inf("period") AND NOT upper_inf("period")
    AND num_nonnulls("booking_id", "hold_id") = 1
    AND ("kind" = 'hold') = ("hold_id" IS NOT NULL)
    AND ("kind" = 'hold') = ("expires_at" IS NOT NULL)
  );

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_valid"
  CHECK (
    "starts_at" < "ends_at"
    AND "total_price_minor" >= 0
    AND ("total_price_max_minor" IS NULL OR "total_price_max_minor" >= "total_price_minor")
    AND ("customer_name" IS NOT NULL OR "source" = 'walk_in')
  );

ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_valid"
  CHECK (
    "sequence" = 1
    AND "starts_at" < "ends_at"
    AND "duration_minutes" > 0
    AND "buffer_before_minutes" >= 0 AND "buffer_after_minutes" >= 0
    AND "price_minor" >= 0
  );

-- Status history is append-only (like audit_logs).
CREATE FUNCTION booking_status_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'booking_status_history is append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER "booking_status_history_no_update_delete"
  BEFORE UPDATE OR DELETE ON "booking_status_history"
  FOR EACH ROW EXECUTE FUNCTION booking_status_history_append_only();

-- Relay scans only unpublished events.
CREATE INDEX "outbox_events_unpublished" ON "outbox_events" ("occurred_at") WHERE "published_at" IS NULL;
