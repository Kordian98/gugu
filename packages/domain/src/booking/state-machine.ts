/**
 * Booking status state machine (spec 06 §3.7). Shared so the app can show allowed actions; the API
 * is authoritative and records every transition in booking_status_history + an outbox event.
 */

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled_by_customer",
  "cancelled_by_salon",
  "no_show",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses whose occupancy blocks the staff member's time. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
];

/** Statuses that count towards the per-phone active-booking limit (still upcoming). */
export const UPCOMING_BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
];

/**
 * Who asks for the transition:
 * - `customer` — the customer themself (booking link);
 * - `salon` — a member with booking write access (also records a customer's phoned-in cancel);
 * - `system` — jobs (pending expiry) and the account-deletion hook (q71: the customer's upcoming
 *   bookings are cancelled on their behalf).
 */
export type TransitionActor = "customer" | "salon" | "system";

export interface TransitionContext {
  from: BookingStatus;
  to: BookingStatus;
  actor: TransitionActor;
  /** Owner/manager may correct no_show ↔ completed within the correction window. */
  canCorrect?: boolean;
  now: number;
  startsAt: number;
  endsAt: number;
  /** Customer self-service cancellation cutoff before start (q14: 120). */
  cancelCutoffMinutes: number;
  reason?: string | null;
}

export type TransitionResult =
  | {
      ok: true;
      /** Cancellation by/for the customer inside the cutoff — a reliability signal (q14). */
      lateCancellation: boolean;
      /** False → occupancy rows become inactive and the time is released. */
      keepsOccupancy: boolean;
    }
  | {
      ok: false;
      code:
        | "invalid_transition"
        | "too_early"
        | "too_late"
        | "cancel_window_passed"
        | "reason_required";
    };

const MINUTE = 60_000;
/** Check-in opens this long before the start. */
export const CHECK_IN_WINDOW_MINUTES = 60;
/** No-show can be marked this long after the start. */
export const NO_SHOW_GRACE_MINUTES = 15;
/** no_show ↔ completed corrections are allowed until this long after the end. */
export const CORRECTION_WINDOW_HOURS = 48;

interface Rule {
  actors: readonly TransitionActor[];
  check?: (c: TransitionContext) => TransitionResult | null;
}

const deny = (code: Extract<TransitionResult, { ok: false }>["code"]): TransitionResult => ({
  ok: false,
  code,
});

const needsReason = (c: TransitionContext) => (c.reason?.trim() ? null : deny("reason_required"));

const customerCancel = (c: TransitionContext): TransitionResult | null => {
  if (c.now >= c.startsAt) return deny("too_late");
  if (c.actor === "customer" && c.now > c.startsAt - c.cancelCutoffMinutes * MINUTE) {
    return deny("cancel_window_passed");
  }
  return null;
};

const correction = (c: TransitionContext): TransitionResult | null => {
  if (!c.canCorrect) return deny("invalid_transition");
  if (c.now > c.endsAt + CORRECTION_WINDOW_HOURS * 3_600_000) return deny("too_late");
  return needsReason(c);
};

const TRANSITIONS: Partial<Record<BookingStatus, Partial<Record<BookingStatus, Rule>>>> = {
  pending: {
    confirmed: { actors: ["salon"], check: (c) => (c.now >= c.endsAt ? deny("too_late") : null) },
    cancelled_by_customer: { actors: ["customer", "salon", "system"], check: customerCancel },
    cancelled_by_salon: { actors: ["salon", "system"] },
  },
  confirmed: {
    checked_in: {
      actors: ["salon"],
      check: (c) =>
        c.now < c.startsAt - CHECK_IN_WINDOW_MINUTES * MINUTE ? deny("too_early") : null,
    },
    completed: { actors: ["salon"], check: (c) => (c.now < c.startsAt ? deny("too_early") : null) },
    cancelled_by_customer: { actors: ["customer", "salon", "system"], check: customerCancel },
    cancelled_by_salon: {
      actors: ["salon"],
      check: (c) => (c.now >= c.endsAt ? deny("too_late") : null),
    },
    no_show: {
      actors: ["salon"],
      check: (c) =>
        c.now < c.startsAt + NO_SHOW_GRACE_MINUTES * MINUTE ? deny("too_early") : null,
    },
  },
  checked_in: {
    completed: { actors: ["salon"] },
    cancelled_by_salon: { actors: ["salon"], check: needsReason },
  },
  completed: { no_show: { actors: ["salon"], check: correction } },
  no_show: { completed: { actors: ["salon"], check: correction } },
};

/** Whether `ctx.actor` may move a booking from `ctx.from` to `ctx.to` right now. */
export function evaluateTransition(ctx: TransitionContext): TransitionResult {
  const rule = TRANSITIONS[ctx.from]?.[ctx.to];
  if (!rule || !rule.actors.includes(ctx.actor)) return deny("invalid_transition");
  const failure = rule.check?.(ctx);
  if (failure) return failure;
  const lateCancellation =
    ctx.to === "cancelled_by_customer" && ctx.now > ctx.startsAt - ctx.cancelCutoffMinutes * MINUTE;
  return {
    ok: true,
    lateCancellation,
    keepsOccupancy: ACTIVE_BOOKING_STATUSES.includes(ctx.to) && ctx.from !== "no_show",
  };
}

/** Target statuses reachable from `from` for `actor`, ignoring time windows (for UI hints). */
export function nextStatuses(from: BookingStatus, actor: TransitionActor): BookingStatus[] {
  const targets = TRANSITIONS[from] ?? {};
  return BOOKING_STATUSES.filter((to) => targets[to]?.actors.includes(actor) ?? false);
}

/** True for statuses that cannot change any more (corrections aside). */
export function isTerminal(status: BookingStatus): boolean {
  return status === "cancelled_by_customer" || status === "cancelled_by_salon";
}
