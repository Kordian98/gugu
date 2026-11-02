-- Staff mode: acknowledgement once per staff period, auto-release to the bot (owner findings 2026-11-03).
ALTER TABLE "zalo_conversations" ADD COLUMN "last_staff_activity_at" TIMESTAMPTZ(6),
ADD COLUMN "staff_notice_at" TIMESTAMPTZ(6);

ALTER TABLE "zalo_oa_connections" ADD COLUMN "staff_release_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "zalo_oa_connections" ADD CONSTRAINT zalo_oa_connections_release_minutes_valid
  CHECK (staff_release_minutes BETWEEN 0 AND 10080);
