import {
  type CustomerNotificationEvent,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  TEAM_NOTIFICATION_EVENTS,
  type TeamNotificationEvent,
} from "@gugu/contracts";
import type { SalonPermission } from "@gugu/domain";

/**
 * Notification event catalog (topic 11 R15). One entry per event: audience, message class and
 * channel policy.
 *
 * Customer channel policy (X26, owner q85/q86): the salon's Zalo OA if it can reach the customer
 * (module `zalo` decides and sends, from the salon's own OA: ZBS Template Message `zalo_template`
 * or a consultation message), otherwise nothing. GuGu never emails a salon's customers — there is
 * no email channel, no fallback and no customer row in this module's send log.
 * Team members get a bell item and an email copy. No SMS (X12), no push (no customer app, X23).
 */

export type ChannelId = "zalo_template" | "email" | "in_app";

export interface CustomerEventDef {
  audience: "customer";
  /** `transactional` only: marketing needs consent + quiet hours and is out of scope. */
  class: "transactional";
  /** Only the salon's Zalo OA, sent by module `zalo`. Never email (X26). */
  channels: readonly ["zalo_template"];
}

export interface TeamEventDef {
  audience: "team";
  class: "transactional";
  /** Key under `notifications:email.team.*`. */
  templateKey: string;
  defaults: { email: boolean; inApp: boolean };
  channels: readonly ["in_app", "email"];
  /**
   * Who may receive it. Booking events: `bookings.read`, or `bookings.read.own` for bookings of the
   * member's own staff profile (staff own-scope). Zalo: `zalo.inbox.use`.
   */
  permission: { full: SalonPermission; own: SalonPermission | null };
  /** Where the email button points in the panel. */
  link: "calendar" | "zalo";
}

export type EventDef = CustomerEventDef | TeamEventDef;

const CUSTOMER: CustomerEventDef = {
  audience: "customer",
  class: "transactional",
  channels: ["zalo_template"],
};
const TEAM_CHANNELS = ["in_app", "email"] as const;
const TEAM_DEFAULTS = { email: true, inApp: true } as const;
const bookingScope = { full: "bookings.read", own: "bookings.read.own" } as const;

export const CATALOG: Readonly<Record<NotificationEvent, EventDef>> = {
  "booking.confirmed": CUSTOMER,
  "booking.rescheduled": CUSTOMER,
  "booking.cancelled_by_salon": CUSTOMER,
  "booking.reminder": CUSTOMER,
  "salon.booking_received": {
    audience: "team",
    class: "transactional",
    templateKey: "salonBookingReceived",
    defaults: TEAM_DEFAULTS,
    channels: TEAM_CHANNELS,
    permission: bookingScope,
    link: "calendar",
  },
  "salon.booking_rescheduled": {
    audience: "team",
    class: "transactional",
    templateKey: "salonBookingRescheduled",
    defaults: TEAM_DEFAULTS,
    channels: TEAM_CHANNELS,
    permission: bookingScope,
    link: "calendar",
  },
  "salon.booking_cancelled": {
    audience: "team",
    class: "transactional",
    templateKey: "salonBookingCancelled",
    defaults: TEAM_DEFAULTS,
    channels: TEAM_CHANNELS,
    permission: bookingScope,
    link: "calendar",
  },
  "salon.zalo_handoff": {
    audience: "team",
    class: "transactional",
    templateKey: "salonZaloHandoff",
    defaults: TEAM_DEFAULTS,
    channels: TEAM_CHANNELS,
    permission: { full: "zalo.inbox.use", own: null },
    link: "zalo",
  },
};

export const customerDef = (e: CustomerNotificationEvent) => CATALOG[e] as CustomerEventDef;
export const teamDef = (e: TeamNotificationEvent) => CATALOG[e] as TeamEventDef;

/** Stored per-salon overrides: `{ "<team event>": { "email": bool, "in_app": bool } }`. */
export type StoredEventSettings = Partial<
  Record<string, Partial<Record<"email" | "in_app", boolean>>>
>;

/** Effective on/off for one team event × channel (salon override, else the catalog default). */
export function channelEnabled(
  stored: StoredEventSettings,
  event: TeamNotificationEvent,
  channel: "email" | "in_app",
): boolean {
  const own = stored[event]?.[channel];
  if (typeof own === "boolean") return own;
  const d = teamDef(event).defaults;
  return channel === "email" ? d.email : d.inApp;
}

export const ALL_EVENTS: readonly NotificationEvent[] = NOTIFICATION_EVENTS;
export const TEAM_EVENTS: readonly TeamNotificationEvent[] = TEAM_NOTIFICATION_EVENTS;
