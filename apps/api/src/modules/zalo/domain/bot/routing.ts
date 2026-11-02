import { restartIntent } from "./payload";
import type { BotInput } from "./types";

export type InboundRoute =
  /** The bot handles the message. */
  | "bot"
  /** Back from a hand-off: switch the conversation to the bot, then the bot handles it. */
  | "resume_bot"
  /** A staff member has taken over: tell the customer, offer "back to the assistant". */
  | "staff_notice"
  /** Stored for staff only. */
  | "silent";

/**
 * Who answers a customer message (owner rule, 2026-11-03). From any state, a greeting, "menu" or
 * "Đặt lịch" restarts the bot, except when a staff member has explicitly taken over: then the
 * customer is told staff will reply and can tap "back to the assistant".
 */
export function routeInbound(
  conversation: { mode: "bot" | "staff"; assignedUserId: string | null },
  botEnabled: boolean,
  input: BotInput | null,
): InboundRoute {
  if (!input || !botEnabled) return "silent";
  if (conversation.mode === "bot") return "bot";
  const intent = restartIntent(input);
  if (!intent) return "silent";
  if (conversation.assignedUserId === null) return "resume_bot";
  return intent === "bot" ? "resume_bot" : "staff_notice";
}
