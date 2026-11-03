-- CreateEnum
CREATE TYPE "notification_delivery_status" AS ENUM ('scheduled', 'queued', 'sent', 'delivered', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "notification_audience" AS ENUM ('customer', 'team');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "customer_email" CITEXT;

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "events" JSONB NOT NULL DEFAULT '{}',
    "reply_to_email" CITEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "booking_id" UUID,
    "conversation_id" UUID,
    "event" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "audience" "notification_audience" NOT NULL,
    "recipient_user_id" UUID,
    "channel" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "notification_delivery_status" NOT NULL,
    "reason" TEXT,
    "fallback_of" TEXT,
    "locale" "locale" NOT NULL DEFAULT 'vi',
    "scheduled_for" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" TEXT,
    "units" INTEGER NOT NULL DEFAULT 0,
    "cost_estimate_vnd" INTEGER NOT NULL DEFAULT 0,
    "entity_version" INTEGER,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "booking_id" UUID,
    "conversation_id" UUID,
    "delivery_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_member_prefs" (
    "salon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_member_prefs_pkey" PRIMARY KEY ("salon_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_salon_id_key" ON "notification_settings"("salon_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_key" ON "notification_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_salon_id_booking_id_created_at_idx" ON "notification_deliveries"("salon_id", "booking_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_scheduled_for_idx" ON "notification_deliveries"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "notification_deliveries_salon_id_created_at_idx" ON "notification_deliveries"("salon_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_delivery_id_key" ON "notifications"("delivery_id");

-- CreateIndex
CREATE INDEX "notifications_salon_id_user_id_created_at_idx" ON "notifications"("salon_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Raw objects (listed in prisma/raw-objects.json).
-- Channels stored here (zalo_template sends live in zalo_send_logs); team rows name a member,
-- customer rows never do (customers have no account, X23).
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_valid CHECK (
  channel IN ('email', 'in_app')
  AND ((audience = 'team') = (recipient_user_id IS NOT NULL))
  AND (audience = 'team' OR channel = 'email')
  AND units >= 0 AND cost_estimate_vnd >= 0
);
