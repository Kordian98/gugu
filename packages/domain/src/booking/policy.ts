import type { BookingStatus } from "./state-machine";

/** Reschedule and booking-reference rules (spec 06 §3.8, q14). */

const MINUTE = 60_000;

export type RescheduleCheck =
  { ok: true } | { ok: false; code: "invalid_status" | "reschedule_window_passed" | "too_late" };

/**
 * Pending/confirmed bookings can move. Customers only until the reschedule cutoff before the
 * original start; salon members until the original start.
 */
export function canReschedule(input: {
  status: BookingStatus;
  actor: "customer" | "salon";
  now: number;
  startsAt: number;
  rescheduleCutoffMinutes: number;
}): RescheduleCheck {
  if (input.status !== "pending" && input.status !== "confirmed") {
    return { ok: false, code: "invalid_status" };
  }
  if (input.now >= input.startsAt) return { ok: false, code: "too_late" };
  if (
    input.actor === "customer" &&
    input.now > input.startsAt - input.rescheduleCutoffMinutes * MINUTE
  ) {
    return { ok: false, code: "reschedule_window_passed" };
  }
  return { ok: true };
}

/** Unambiguous alphabet for booking reference codes read out on the phone (no 0/O, 1/I/L). */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Short human booking code from random bytes, e.g. `K7M-3QX`. Unique per salon (DB constraint). */
export function referenceCode(random: Uint8Array): string {
  if (random.length < 6) throw new RangeError("need 6 random bytes");
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += REFERENCE_ALPHABET.charAt((random[i] as number) % REFERENCE_ALPHABET.length);
    if (i === 2) code += "-";
  }
  return code;
}
