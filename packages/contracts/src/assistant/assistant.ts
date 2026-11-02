import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * AI business assistant HTTP contracts (topic 08 A2): status, one chat turn streamed as
 * server-sent events. Text the user sees is re-hydrated on the server; the model only ever saw
 * tokens and aggregates.
 */

export const ASSISTANT_ERRORS = {
  /** No `ANTHROPIC_API_KEY` on the server. */
  notConfigured: "assistant.not_configured",
  conversationNotFound: "assistant.conversation_not_found",
  /** The provider failed or refused; the turn produced no answer. */
  failed: "assistant.failed",
  /** The outgoing request contained something that looks like personal data; nothing was sent. */
  privacyBlocked: "assistant.privacy_blocked",
} as const;

export const ASSISTANT_MAX_INPUT_CHARS = 1_000;

export const assistantStatusSchema = z.object({
  configured: z.boolean(),
  /** Plan includes `ai.agent.enabled` (Pro/Ultra). */
  entitled: z.boolean(),
  /** The member's role has `assistant.use`. */
  permitted: z.boolean(),
});
export type AssistantStatus = z.infer<typeof assistantStatusSchema>;

export const assistantTurnInputSchema = z.object({
  conversationId: uuidV7Schema.nullish(),
  text: z.string().trim().min(1).max(ASSISTANT_MAX_INPUT_CHARS),
  locale: z.enum(["vi", "en"]).default("vi"),
});
export type AssistantTurnInput = z.input<typeof assistantTurnInputSchema>;
export type AssistantTurnInputParsed = z.infer<typeof assistantTurnInputSchema>;

/** One server-sent event of a turn (`data: <json>\n\n`). */
export const assistantEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("conversation"), conversationId: uuidV7Schema }),
  /** What the model received after scrubbing: names → tokens, contact details → [redacted]. */
  z.object({ type: z.literal("masked"), text: z.string(), changed: z.boolean() }),
  /** Re-hydrated answer text, streamed in pieces. */
  z.object({ type: z.literal("delta"), text: z.string() }),
  /** Data sources used for the answer (tool + period), for the source chips. */
  z.object({
    type: z.literal("source"),
    tool: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  z.object({ type: z.literal("done"), usedVnd: z.number().int(), model: z.string() }),
  z.object({ type: z.literal("error"), code: z.string() }),
]);
export type AssistantEvent = z.infer<typeof assistantEventSchema>;
