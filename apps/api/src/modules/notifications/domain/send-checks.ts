import type { CustomerNotificationEvent } from "@gugu/contracts";
import { REMINDER_STATUSES } from "./reminders";

const UPCOMING = new Set<string>(REMINDER_STATUSES);

export interface BookingState {
  status: string;
  version: number;
  startsAt: Date;
}

export interface PlannedSend {
  /** Booking version the reminder was planned for. */
  entityVersion: number | null;
  /** Start time when the send was planned (ISO). */
  plannedStartsAt: string | undefined;
}

/**
 * Why a customer email planned earlier must not go out now (pure; null = still valid). The worker
 * calls this at send time (spec 11 G8): reminders are dropped when the booking was cancelled,
 * moved or changed version; a reschedule email is dropped when a newer reschedule exists.
 */
export function customerSkipReason(
  event: CustomerNotificationEvent,
  b: BookingState,
  planned: PlannedSend,
  now: Date,
): "stale" | "superseded" | "too_late" | null {
  switch (event) {
    case "booking.reminder":
      if (
        !UPCOMING.has(b.status) ||
        b.version !== planned.entityVersion ||
        b.startsAt.toISOString() !== planned.plannedStartsAt
      ) {
        return "stale";
      }
      return now.getTime() >= b.startsAt.getTime() ? "too_late" : null;
    case "booking.cancelled_by_salon":
      return b.status === "cancelled_by_salon" ? null : "stale";
    case "booking.rescheduled":
      if (!UPCOMING.has(b.status)) return "stale";
      return planned.plannedStartsAt === b.startsAt.toISOString() ? null : "superseded";
    case "booking.confirmed":
      return UPCOMING.has(b.status) ? null : "stale";
  }
}

export type ZaloGate =
  | { kind: "skip" }
  | { kind: "wait"; until: Date }
  /** Zalo did not deliver (failed / rejected / never final in time): email is the fallback. */
  | { kind: "fallback" };

/** What to do with an email that only goes out if Zalo did not deliver (pure). */
export function zaloGate(
  outcome: "queued" | "sent" | "failed" | "rejected" | null,
  waitingSince: Date,
  now: Date,
  limits: { recheckMs: number; maxWaitMs: number },
): ZaloGate {
  if (outcome === "sent") return { kind: "skip" };
  if (outcome === "failed" || outcome === "rejected") return { kind: "fallback" };
  return now.getTime() - waitingSince.getTime() < limits.maxWaitMs
    ? { kind: "wait", until: new Date(now.getTime() + limits.recheckMs) }
    : { kind: "fallback" };
}
