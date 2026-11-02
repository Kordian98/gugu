-- CreateEnum
CREATE TYPE "zalo_connection_status" AS ENUM ('connected', 'needs_reauth', 'disconnected');

-- CreateEnum
CREATE TYPE "zalo_conversation_mode" AS ENUM ('bot', 'staff');

-- CreateEnum
CREATE TYPE "zalo_message_direction" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "zalo_message_sender" AS ENUM ('customer', 'bot', 'staff', 'system');

-- CreateEnum
CREATE TYPE "zalo_send_status" AS ENUM ('queued', 'sent', 'failed', 'rejected');

-- CreateTable
CREATE TABLE "zalo_oa_connections" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "oa_id" TEXT NOT NULL,
    "oa_name" TEXT NOT NULL,
    "status" "zalo_connection_status" NOT NULL DEFAULT 'connected',
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "access_expires_at" TIMESTAMPTZ(6),
    "bot_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_24h" BOOLEAN NOT NULL DEFAULT true,
    "reminder_2h" BOOLEAN NOT NULL DEFAULT true,
    "allow_paid_messages" BOOLEAN NOT NULL DEFAULT true,
    "template_ids" JSONB NOT NULL DEFAULT '{}',
    "monthly_template_cap" INTEGER,
    "connected_by_user_id" UUID NOT NULL,
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ(6),
    "last_refresh_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zalo_oa_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_conversations" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "oa_id" TEXT NOT NULL,
    "zalo_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "phone_e164" TEXT,
    "mode" "zalo_conversation_mode" NOT NULL DEFAULT 'bot',
    "bot_state" JSONB NOT NULL DEFAULT '{}',
    "assigned_user_id" UUID,
    "handoff_requested_at" TIMESTAMPTZ(6),
    "last_user_interaction_at" TIMESTAMPTZ(6),
    "last_message_at" TIMESTAMPTZ(6),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "followed_at" TIMESTAMPTZ(6),
    "unfollowed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zalo_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_messages" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "direction" "zalo_message_direction" NOT NULL,
    "sender" "zalo_message_sender" NOT NULL,
    "staff_user_id" UUID,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "payload" JSONB,
    "zalo_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_webhook_events" (
    "id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "oa_id" TEXT NOT NULL,
    "salon_id" UUID,
    "event_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "zalo_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_send_logs" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID,
    "booking_id" UUID,
    "message_id" UUID,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tier" TEXT,
    "dedup_key" TEXT NOT NULL,
    "status" "zalo_send_status" NOT NULL DEFAULT 'queued',
    "cost_estimate_vnd" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "zalo_message_id" TEXT,
    "error_code" TEXT,
    "request" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "zalo_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zalo_booking_links" (
    "booking_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "customer_confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_booking_links_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "zalo_staff_notifications" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "conversation_id" UUID,
    "booking_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zalo_staff_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zalo_oa_connections_salon_id_key" ON "zalo_oa_connections"("salon_id");

-- CreateIndex
CREATE INDEX "zalo_oa_connections_oa_id_idx" ON "zalo_oa_connections"("oa_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_oa_connections_salon_id_id_key" ON "zalo_oa_connections"("salon_id", "id");

-- CreateIndex
CREATE INDEX "zalo_conversations_salon_id_last_message_at_idx" ON "zalo_conversations"("salon_id", "last_message_at");

-- CreateIndex
CREATE INDEX "zalo_conversations_salon_id_phone_e164_idx" ON "zalo_conversations"("salon_id", "phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_conversations_oa_id_zalo_user_id_key" ON "zalo_conversations"("oa_id", "zalo_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_conversations_salon_id_id_key" ON "zalo_conversations"("salon_id", "id");

-- CreateIndex
CREATE INDEX "zalo_messages_conversation_id_created_at_idx" ON "zalo_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_messages_salon_id_id_key" ON "zalo_messages"("salon_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_webhook_events_event_key_key" ON "zalo_webhook_events"("event_key");

-- CreateIndex
CREATE INDEX "zalo_webhook_events_status_received_at_idx" ON "zalo_webhook_events"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_send_logs_dedup_key_key" ON "zalo_send_logs"("dedup_key");

-- CreateIndex
CREATE INDEX "zalo_send_logs_salon_id_created_at_idx" ON "zalo_send_logs"("salon_id", "created_at");

-- CreateIndex
CREATE INDEX "zalo_send_logs_salon_id_channel_status_created_at_idx" ON "zalo_send_logs"("salon_id", "channel", "status", "created_at");

-- CreateIndex
CREATE INDEX "zalo_booking_links_conversation_id_idx" ON "zalo_booking_links"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "zalo_booking_links_salon_id_booking_id_key" ON "zalo_booking_links"("salon_id", "booking_id");

-- CreateIndex
CREATE INDEX "zalo_staff_notifications_salon_id_created_at_idx" ON "zalo_staff_notifications"("salon_id", "created_at");

-- AddForeignKey
ALTER TABLE "zalo_oa_connections" ADD CONSTRAINT "zalo_oa_connections_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_conversations" ADD CONSTRAINT "zalo_conversations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_messages" ADD CONSTRAINT "zalo_messages_salon_id_conversation_id_fkey" FOREIGN KEY ("salon_id", "conversation_id") REFERENCES "zalo_conversations"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_booking_links" ADD CONSTRAINT "zalo_booking_links_salon_id_booking_id_fkey" FOREIGN KEY ("salon_id", "booking_id") REFERENCES "bookings"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zalo_booking_links" ADD CONSTRAINT "zalo_booking_links_salon_id_conversation_id_fkey" FOREIGN KEY ("salon_id", "conversation_id") REFERENCES "zalo_conversations"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Raw objects (listed in prisma/raw-objects.json).
-- One live connection per OA: a Zalo OA can serve only one salon at a time.
CREATE UNIQUE INDEX zalo_oa_connections_one_live_per_oa
  ON zalo_oa_connections (oa_id) WHERE status <> 'disconnected';

ALTER TABLE zalo_send_logs ADD CONSTRAINT zalo_send_logs_valid CHECK (
  channel IN ('cs', 'template')
  AND (tier IS NULL OR tier IN ('free', 'paid', 'template'))
  AND cost_estimate_vnd >= 0
  AND attempts >= 0
);

ALTER TABLE zalo_webhook_events ADD CONSTRAINT zalo_webhook_events_status_valid
  CHECK (status IN ('received', 'processed', 'ignored', 'failed'));

ALTER TABLE zalo_oa_connections ADD CONSTRAINT zalo_oa_connections_tokens_when_connected
  CHECK (status = 'disconnected' OR (access_token_enc IS NOT NULL AND refresh_token_enc IS NOT NULL));
