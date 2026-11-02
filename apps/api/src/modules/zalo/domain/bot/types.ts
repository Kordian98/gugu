/**
 * Rule-based Zalo booking bot (roadmap X24). No LLM: every step is a button / quick-reply menu,
 * typed numbers and a few keywords. The bot always speaks as the salon and never mentions GuGu.
 */

/** Zalo OA button templates are kept to this many buttons per message. */
export const MAX_BUTTONS = 5;
/** Items per page when a list needs a "More" button (MAX_BUTTONS - 1). */
export const PAGE_SIZE = MAX_BUTTONS - 1;
/** A flow left idle longer than this restarts at the menu. */
export const FLOW_TIMEOUT_MS = 30 * 60_000;
/** Days offered for booking (X24: slots for the next 7 days). */
export const BOOKING_DAYS = 7;

export interface BotButton {
  title: string;
  /** Hidden payload Zalo sends back when the customer taps the button. */
  payload: string;
}

export type BotReply =
  | { kind: "text"; text: string; buttons: BotButton[] }
  /** Zalo "request user info" form: the customer shares name + phone with the OA. */
  | { kind: "request_info"; title: string; subtitle: string };

export type BotInput =
  | { kind: "text"; text: string }
  | { kind: "payload"; payload: string }
  | { kind: "follow" }
  | { kind: "user_info"; phone: string | null; name: string | null };

export interface Selection {
  serviceId: string;
  variantId: string | null;
  /** null = any staff member. */
  staffId: string | null;
}

export type BotStep =
  | { name: "idle" }
  | { name: "service"; page: number }
  | { name: "variant"; serviceId: string }
  | { name: "staff"; serviceId: string; variantId: string | null }
  | { name: "day"; sel: Selection; page: number; rescheduleId: string | null }
  | { name: "time"; sel: Selection; date: string; page: number; rescheduleId: string | null }
  | { name: "phone"; sel: Selection; startsAt: string }
  | { name: "confirm"; sel: Selection; startsAt: string }
  | { name: "my_bookings" }
  | { name: "cancel_confirm"; bookingId: string };

/** Persisted per conversation (`zalo_conversations.bot_state`). */
export interface BotState {
  v: 1;
  /** Bumped on every reply; stale button taps (older seq) are ignored. */
  seq: number;
  step: BotStep;
  /** Option values behind the buttons of the last reply, by index. */
  options: string[];
  /** How many of `options` are numbered list items (typing "2" picks options[1]). */
  items: number;
  at: string | null;
}

export const INITIAL_BOT_STATE: BotState = {
  v: 1,
  seq: 0,
  step: { name: "idle" },
  options: [],
  items: 0,
  at: null,
};

export interface BotVariant {
  id: string;
  name: string;
  priceMinor: number;
  priceMaxMinor: number | null;
  durationMinutes: number;
}

export interface BotService extends BotVariant {
  variants: BotVariant[];
}

export interface BotBooking {
  id: string;
  ref: string;
  startsAt: string;
  serviceId: string;
  variantId: string | null;
  staffId: string;
  serviceName: string;
  staffName: string | null;
  priceMinor: number;
  priceMaxMinor: number | null;
  status: string;
}

export type BookResult =
  | { ok: true; booking: BotBooking; pending: boolean }
  /** The customer already has the maximum of upcoming bookings at this salon. */
  | { ok: false; reason: "slot_taken" | "limit_reached" | "failed" };

export type RescheduleResult =
  | { ok: true; booking: BotBooking }
  | { ok: false; reason: "slot_taken" | "too_late" | "not_found" | "failed" };

/** Data and actions the bot needs; implemented over the booking engine (application/bot-ports). */
export interface BotPorts {
  salon: { name: string; timeZone: string; hideStaffChoice: boolean };
  customer: { name: string | null; phone: string | null };
  services(): Promise<BotService[]>;
  staffFor(serviceId: string, variantId: string | null): Promise<{ id: string; name: string }[]>;
  /** Dates (YYYY-MM-DD, salon zone) in the next BOOKING_DAYS days with at least one slot. */
  days(sel: Selection, rescheduleId: string | null): Promise<string[]>;
  /** Start times (ISO) on that date. */
  slots(sel: Selection, date: string, rescheduleId: string | null): Promise<string[]>;
  /** Upcoming bookings of this conversation. */
  upcoming(): Promise<BotBooking[]>;
  book(sel: Selection, startsAt: string, phone: string, name: string): Promise<BookResult>;
  cancel(bookingId: string): Promise<"ok" | "too_late" | "not_found" | "failed">;
  reschedule(bookingId: string, startsAt: string): Promise<RescheduleResult>;
  confirmAttendance(bookingId: string): Promise<"ok" | "not_found">;
}

export type BotEffect =
  | { type: "handoff" }
  | { type: "contact"; phone: string | null; name: string | null }
  | {
      type: "notify";
      kind: "booking_created" | "booking_cancelled" | "booking_rescheduled" | "booking_confirmed";
      bookingId: string;
    };

export interface BotResult {
  state: BotState;
  replies: BotReply[];
  effects: BotEffect[];
}

/** Translation function (vi/en dictionaries, namespace `zalo`, keys under `bot.`). */
export type BotT = (key: string, vars?: Record<string, string | number>) => string;
