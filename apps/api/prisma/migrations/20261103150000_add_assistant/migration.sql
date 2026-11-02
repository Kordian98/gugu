-- CreateEnum
CREATE TYPE "assistant_tool_call_status" AS ENUM ('ok', 'withheld', 'forbidden', 'error');

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_vnd" INTEGER NOT NULL DEFAULT 0,
    "stop_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_entity_tokens" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_entity_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_tool_calls" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "assistant_tool_call_status" NOT NULL,
    "output_digest" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_conversations_salon_id_user_id_updated_at_idx" ON "assistant_conversations"("salon_id", "user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_conversations_salon_id_id_key" ON "assistant_conversations"("salon_id", "id");

-- CreateIndex
CREATE INDEX "assistant_messages_conversation_id_created_at_idx" ON "assistant_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_entity_tokens_conversation_id_token_key" ON "assistant_entity_tokens"("conversation_id", "token");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_entity_tokens_conversation_id_entity_type_entity__key" ON "assistant_entity_tokens"("conversation_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "assistant_tool_calls_salon_id_created_at_idx" ON "assistant_tool_calls"("salon_id", "created_at");

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_salon_id_conversation_id_fkey" FOREIGN KEY ("salon_id", "conversation_id") REFERENCES "assistant_conversations"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_entity_tokens" ADD CONSTRAINT "assistant_entity_tokens_salon_id_conversation_id_fkey" FOREIGN KEY ("salon_id", "conversation_id") REFERENCES "assistant_conversations"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_tool_calls" ADD CONSTRAINT "assistant_tool_calls_salon_id_conversation_id_fkey" FOREIGN KEY ("salon_id", "conversation_id") REFERENCES "assistant_conversations"("salon_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
