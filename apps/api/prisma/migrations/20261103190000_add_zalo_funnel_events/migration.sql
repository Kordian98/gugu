-- CreateTable
CREATE TABLE "zalo_funnel_events" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "session_id" UUID,
    "event" TEXT NOT NULL,
    "step" TEXT,
    "reason" TEXT,
    "booking_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zalo_funnel_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zalo_funnel_events_salon_id_occurred_at_idx" ON "zalo_funnel_events"("salon_id", "occurred_at");

-- CreateIndex
CREATE INDEX "zalo_funnel_events_salon_id_session_id_idx" ON "zalo_funnel_events"("salon_id", "session_id");

-- AddForeignKey
ALTER TABLE "zalo_funnel_events" ADD CONSTRAINT "zalo_funnel_events_salon_id_conversation_id_fkey" FOREIGN KEY ("salon_id", "conversation_id") REFERENCES "zalo_conversations"("salon_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Raw objects (listed in prisma/raw-objects.json).
ALTER TABLE zalo_funnel_events ADD CONSTRAINT zalo_funnel_events_valid CHECK (
  event IN (
    'inbound', 'followed', 'unfollowed', 'conversation_started',
    'session_started', 'step_reached', 'booked', 'session_ended',
    'not_understood', 'slot_taken', 'handoff', 'staff_takeover',
    'bot_unavailable', 'reply_blocked',
    'booking_cancelled', 'booking_rescheduled', 'attendance_confirmed'
  )
  AND (step IS NULL OR step IN ('service', 'staff', 'slot', 'phone', 'confirm'))
);

-- Statistics history is append-only: counts must never change after the fact.
CREATE FUNCTION zalo_funnel_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'zalo_funnel_events is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER zalo_funnel_events_no_update_delete
  BEFORE UPDATE OR DELETE ON zalo_funnel_events
  FOR EACH ROW EXECUTE FUNCTION zalo_funnel_events_append_only();
