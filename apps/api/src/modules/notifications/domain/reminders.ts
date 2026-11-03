const MINUTE = 60_000;

/** Statuses that still get reminders (same set as the Zalo reminders). */
export const REMINDER_STATUSES = ["pending", "confirmed"] as const;

export interface PlannedReminder {
  offsetMinutes: number;
  sendAt: Date;
  variant: string;
}

export const reminderVariant = (offsetMinutes: number) => `${String(offsetMinutes)}m`;

/**
 * Reminder moments for one booking (pure). Only moments still in the future are planned: a booking
 * made 3 hours ahead gets no 24-hour reminder (the confirmation already told the customer).
 */
export function planReminders(
  startsAt: Date,
  offsetsMinutes: readonly number[],
  now: Date,
): PlannedReminder[] {
  return [...new Set(offsetsMinutes)]
    .sort((a, b) => b - a)
    .map((offsetMinutes) => ({
      offsetMinutes,
      sendAt: new Date(startsAt.getTime() - offsetMinutes * MINUTE),
      variant: reminderVariant(offsetMinutes),
    }))
    .filter((r) => r.sendAt.getTime() > now.getTime());
}

/**
 * The Zalo reminder that covers an email reminder at this offset, if Zalo sends one (module `zalo`
 * sends fixed 24 h and 2 h reminders, each only when the booking existed at that moment). An email
 * reminder with a covering Zalo reminder is the fallback: it goes out only if Zalo did not deliver.
 */
export function coveringZaloReminder(
  offsetMinutes: number,
  booking: { startsAt: Date; createdAt: Date },
  zalo: { reminder24h: boolean; reminder2h: boolean },
): "reminder_24h" | "reminder_2h" | null {
  const kind = offsetMinutes <= 120 ? "reminder_2h" : "reminder_24h";
  const enabled = kind === "reminder_2h" ? zalo.reminder2h : zalo.reminder24h;
  const leadMinutes = kind === "reminder_2h" ? 120 : 1440;
  const existedAtMoment =
    booking.createdAt.getTime() <= booking.startsAt.getTime() - leadMinutes * MINUTE;
  return enabled && existedAtMoment ? kind : null;
}
