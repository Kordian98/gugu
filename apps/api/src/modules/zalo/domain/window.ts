import type { ZaloWindow } from "@gugu/contracts";

const HOUR = 3_600_000;

/** Consultation messages are free this long after the customer's last interaction (X24). */
export const FREE_WINDOW_MS = 48 * HOUR;
/** …and possible (paid) until this long; after that only template messages reach the customer. */
export const PAID_WINDOW_MS = 7 * 24 * HOUR;

/**
 * Which consultation-message window a customer is in. Pure; thresholds from Zalo's OA policy
 * (oa.zalo.me "Tổng quan các loại tin nhắn", effective 2026-01-01; re-verify before go-live).
 */
export function sendWindow(lastUserInteractionAt: Date | null, now: Date): ZaloWindow {
  if (!lastUserInteractionAt) return "closed";
  const age = now.getTime() - lastUserInteractionAt.getTime();
  if (age < 0) return "free";
  if (age <= FREE_WINDOW_MS) return "free";
  if (age <= PAID_WINDOW_MS) return "paid";
  return "closed";
}

export type CsDecision =
  | { send: true; tier: "free" | "paid" }
  | { send: false; reason: "window_closed" | "paid_messages_off" };

/** Whether a consultation message may go out now, and at which price tier. */
export function decideCs(
  lastUserInteractionAt: Date | null,
  now: Date,
  allowPaidMessages: boolean,
): CsDecision {
  const window = sendWindow(lastUserInteractionAt, now);
  if (window === "free") return { send: true, tier: "free" };
  if (window === "paid") {
    return allowPaidMessages
      ? { send: true, tier: "paid" }
      : { send: false, reason: "paid_messages_off" };
  }
  return { send: false, reason: "window_closed" };
}
