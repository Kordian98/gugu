-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "recipient_key" TEXT,
ADD COLUMN     "reserved_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "notification_deliveries_recipient_key_reserved_at_idx" ON "notification_deliveries"("recipient_key", "reserved_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_salon_id_reserved_at_idx" ON "notification_deliveries"("salon_id", "reserved_at");

