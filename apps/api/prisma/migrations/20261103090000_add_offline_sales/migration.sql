-- CreateEnum
CREATE TYPE "offline_sale_method" AS ENUM ('cash', 'bank_transfer', 'ewallet', 'card', 'other');

-- CreateTable
CREATE TABLE "offline_sales" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "method" "offline_sale_method" NOT NULL DEFAULT 'cash',
    "note" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "offline_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offline_sales_salon_id_recorded_at_idx" ON "offline_sales"("salon_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "offline_sales_salon_id_id_key" ON "offline_sales"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offline_sales_salon_id_booking_id_key" ON "offline_sales"("salon_id", "booking_id");

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Raw objects (ADR-0008; listed in prisma/raw-objects.json).
ALTER TABLE "offline_sales" ADD CONSTRAINT "offline_sales_amount_valid"
  CHECK (amount_minor >= 0 AND amount_minor <= 1000000000);
