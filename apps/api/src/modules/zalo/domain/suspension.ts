/**
 * Salon suspended by GuGu (q89, ADR-0010) — pure rules for the Zalo side. While suspended the bot
 * never books; a customer message gets one neutral "please contact the salon directly" reply per
 * conversation per cooldown, in the salon's voice. Webhooks are still stored and staff can read.
 */

/** Send-log purpose of the neutral notice; the only Zalo send allowed while suspended. */
export const SUSPENDED_NOTICE_PURPOSE = "suspended_notice";

/** Send-log / delivery reason when a send is skipped because the salon is suspended. */
export const SALON_SUSPENDED_REASON = "salon_suspended";

/** Reminder purposes whose dedup key is freed when skipped, so they can go out after unsuspend. */
const REMINDER_PURPOSES = new Set(["reminder_24h", "reminder_2h"]);

/**
 * Whether this inbound event gets the neutral notice now. Only customer messages the bot would
 * answer (`hasBotInput`); never when the salon switched its bot off (no automation was wanted);
 * at most once per `cooldownMs` per conversation (`lastNoticeAt` = latest notice logged).
 */
export function shouldSendSuspendedNotice(input: {
  hasBotInput: boolean;
  botEnabled: boolean;
  lastNoticeAt: Date | null;
  now: Date;
  cooldownMs: number;
}): boolean {
  if (!input.hasBotInput || !input.botEnabled) return false;
  if (!input.lastNoticeAt) return true;
  return input.now.getTime() - input.lastNoticeAt.getTime() >= input.cooldownMs;
}

/** Whether a queued send may still go out for a suspended salon (only the neutral notice). */
export function allowedWhileSuspended(purpose: string): boolean {
  return purpose === SUSPENDED_NOTICE_PURPOSE;
}

/**
 * Dedup key a skipped send is parked under. Reminders give their real key back so the reminder
 * scan can still send them after unsuspend while they are due; other sends keep theirs.
 */
export function parkedDedupKey(purpose: string, dedupKey: string, logId: string): string {
  return REMINDER_PURPOSES.has(purpose)
    ? `${dedupKey}:${SALON_SUSPENDED_REASON}:${logId}`
    : dedupKey;
}

/** Dedup key prefix of reminder skips logged by the scan while suspended (one per reminder). */
export const suspendedReminderKey = (dedupKey: string) => `${dedupKey}:${SALON_SUSPENDED_REASON}`;
