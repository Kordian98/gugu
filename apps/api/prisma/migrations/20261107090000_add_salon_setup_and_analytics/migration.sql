-- Guided setup after email-only signup (topic 07, owner 2026-11-04): wizard progress per salon, and
-- a minimal server-side analytics events table (X14) until topic 12 builds the full pipeline.

-- CreateTable
CREATE TABLE "salon_setups" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "business_type" TEXT,
    "name_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "current_step" TEXT NOT NULL DEFAULT 'business',
    "completed_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skipped_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wizard_closed_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "card_dismissed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salon_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "salon_id" UUID,
    "actor_hash" TEXT,
    "props" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salon_setups_salon_id_key" ON "salon_setups"("salon_id");

-- CreateIndex
CREATE UNIQUE INDEX "salon_setups_salon_id_id_key" ON "salon_setups"("salon_id", "id");

-- CreateIndex
CREATE INDEX "analytics_events_name_occurred_at_idx" ON "analytics_events"("name", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_salon_id_occurred_at_idx" ON "analytics_events"("salon_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "salon_setups" ADD CONSTRAINT "salon_setups_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
