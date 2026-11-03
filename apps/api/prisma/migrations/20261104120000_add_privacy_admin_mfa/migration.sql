-- CreateEnum
CREATE TYPE "privacy_export_status" AS ENUM ('queued', 'running', 'ready', 'failed', 'expired');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "step_up_until" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "admin_mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "last_used_step" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_exports" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" "privacy_export_status" NOT NULL DEFAULT 'queued',
    "json_gz" BYTEA,
    "csv_gz" BYTEA,
    "size_bytes" INTEGER,
    "clients" INTEGER,
    "bookings" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "privacy_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_mfa_factors_user_id_key" ON "admin_mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_recovery_codes_code_hash_key" ON "admin_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "admin_recovery_codes_user_id_idx" ON "admin_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "privacy_exports_salon_id_created_at_idx" ON "privacy_exports"("salon_id", "created_at");

-- CreateIndex
CREATE INDEX "privacy_exports_status_expires_at_idx" ON "privacy_exports"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_exports_salon_id_id_key" ON "privacy_exports"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "admin_mfa_factors" ADD CONSTRAINT "admin_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_exports" ADD CONSTRAINT "privacy_exports_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_exports" ADD CONSTRAINT "privacy_exports_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Raw objects (topic 05 step 8/9; listed in prisma/raw-objects.json) ─────────────────────────

-- At most one salon-wide export queued or running per salon (the API answers 409 otherwise).
CREATE UNIQUE INDEX "privacy_exports_one_in_flight" ON "privacy_exports" ("salon_id")
  WHERE "status" IN ('queued', 'running');

-- A ready export has content and an expiry; an expired one has no content left.
ALTER TABLE "privacy_exports" ADD CONSTRAINT "privacy_exports_content_valid" CHECK (
  ("status" <> 'ready' OR ("json_gz" IS NOT NULL AND "csv_gz" IS NOT NULL AND "expires_at" IS NOT NULL))
  AND ("status" <> 'expired' OR ("json_gz" IS NULL AND "csv_gz" IS NULL))
);

-- Recovery-code redemption and TOTP replay protection are single-row updates; codes are HMACs.
ALTER TABLE "admin_mfa_factors" ADD CONSTRAINT "admin_mfa_factors_step_valid" CHECK (
  "last_used_step" IS NULL OR "last_used_step" > 0
);

-- booking_status_history stays append-only, with one narrow exception for privacy erasure
-- (customers.erase): the free-text reason may be blanked. Any other UPDATE, and every DELETE, is
-- still rejected. Same trigger, new function body.
CREATE OR REPLACE FUNCTION booking_status_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."reason_text" IS NOT NULL AND NEW."reason_text" IS NULL
     AND (to_jsonb(NEW) - 'reason_text') = (to_jsonb(OLD) - 'reason_text') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'booking_status_history is append-only' USING ERRCODE = '42501';
END $$;
