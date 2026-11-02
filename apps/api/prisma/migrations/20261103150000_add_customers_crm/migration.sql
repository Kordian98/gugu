-- CreateTable
CREATE TABLE "customer_salon_profiles" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "phone_e164" TEXT,
    "display_name" TEXT NOT NULL,
    "customer_user_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "marketing_consent" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'booking',
    "merged_into_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_salon_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_salon_profiles_salon_id_display_name_idx" ON "customer_salon_profiles"("salon_id", "display_name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_salon_profiles_salon_id_id_key" ON "customer_salon_profiles"("salon_id", "id");

-- CreateIndex
CREATE INDEX "customer_notes_salon_id_profile_id_created_at_idx" ON "customer_notes"("salon_id", "profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_notes_salon_id_id_key" ON "customer_notes"("salon_id", "id");

-- AddForeignKey
ALTER TABLE "customer_salon_profiles" ADD CONSTRAINT "customer_salon_profiles_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_salon_id_profile_id_fkey" FOREIGN KEY ("salon_id", "profile_id") REFERENCES "customer_salon_profiles"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Raw objects (ADR-0008; listed in prisma/raw-objects.json).
-- One live profile per phone and salon (manual clients without a phone are allowed).
CREATE UNIQUE INDEX "customer_salon_profiles_one_per_phone"
  ON "customer_salon_profiles" (salon_id, phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL;
-- Directory search on names without diacritics.
CREATE INDEX "customer_salon_profiles_name_trgm"
  ON "customer_salon_profiles" USING gin (lower(display_name) gin_trgm_ops);
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_body_len" CHECK (char_length(body) BETWEEN 1 AND 2000);
-- Directory statistics read bookings by phone.
CREATE INDEX "bookings_salon_phone_starts" ON "bookings" (salon_id, customer_phone_e164, starts_at);
