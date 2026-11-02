import { restartIntent } from "./payload";
import type { BotInput } from "./types";

export type InboundRoute =
  /** The bot handles the message. */
  | "bot"
  /** Back from a hand-off: switch the conversation to the bot, then the bot handles it. */
  | "resume_bot"
  /**
   * Staff mode: tell the customer a staff member will reply and offer "back to the assistant".
   * Sent for restart intents after an explicit take-over, and once per staff period otherwise.
   */
  | "staff_notice"
  /** Stored for staff only. */
  | "silent";

export interface RoutingConversation {
  mode: "bot" | "staff";
  assignedUserId: string | null;
  /** Set when the customer was told "staff will reply" in the current staff period. */
  staffNoticeAt: Date | null;
}

/**
 * Who answers a customer message (owner rules, 2026-11-03):
 * - from any state, a greeting, "menu" or "Đặt lịch" restarts the bot — unless a staff member has
 *   explicitly taken over; then the customer gets the notice with "back to the assistant";
 * - in staff mode a customer is never silently ignored: the first message gets the notice.
 */
export function routeInbound(
  conversation: RoutingConversation,
  botEnabled: boolean,
  input: BotInput | null,
): InboundRoute {
  if (!input || !botEnabled) return "silent";
  if (conversation.mode === "bot") return "bot";
  const intent = restartIntent(input);
  if (intent) {
    if (conversation.assignedUserId === null || intent === "bot") return "resume_bot";
    return "staff_notice";
  }
  return conversation.staffNoticeAt === null ? "staff_notice" : "silent";
}

/** Staff-mode chats go back to the bot after this long without staff activity (0 = never). */
export function dueForAutoRelease(
  conversation: { mode: "bot" | "staff"; lastStaffActivityAt: Date | null },
  releaseMinutes: number,
  now: Date,
): boolean {
  if (conversation.mode !== "staff" || releaseMinutes <= 0) return false;
  const since = conversation.lastStaffActivityAt?.getTime() ?? 0;
  return now.getTime() - since >= releaseMinutes * 60_000;
}
