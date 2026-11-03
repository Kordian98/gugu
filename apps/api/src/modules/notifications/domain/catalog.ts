import {
  type CustomerNotificationEvent,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type TeamNotificationEvent,
} from "@gugu/contracts";
import type { SalonPermission } from "@gugu/domain";

/**
 * Notification event catalog (topic 11 R15, scoped to the email milestone). One entry per event:
 * audience, message class, default settings, channel policy, calendar attachment and template key.
 * Channel policy (owner, 2026-11-03): customers get Zalo first (module `zalo` sends ZBS Template /
 * consultation messages from the salon's own OA), email only as the fallback when the customer has
 * an email and Zalo did not deliver, otherwise nothing. Team members get a bell item and an email.
 * No SMS (X12) and no push (no customer app, X23) in this milestone.
 */

export type ChannelId = "zalo_template" | "email" | "in_app";

interface BaseDef {
  /** `transactional` only: marketing needs consent + quiet hours and is out of scope. */
  class: "transactional";
  /** Key under `notifications:email.*` (or `email.team.*`). */
  templateKey: string;
  defaults: { email: boolean; inApp: boolean | null };
}

export interface CustomerEventDef extends BaseDef {
  audience: "customer";
  /** Ordered channel plan; `email` only runs when the channel before it did not deliver. */
  channels: readonly ChannelId[];
  /** `.ics` attachment: PUBLISH the appointment, CANCEL it, or none. */
  ics: "publish" | "cancel";
}

export interface TeamEventDef extends BaseDef {
  audience: "team";
  channels: readonly ChannelId[];
  /**
   * Who may receive it. Booking events: `bookings.read`, or `bookings.read.own` for bookings of the
   * member's own staff profile (staff own-scope). Zalo: `zalo.inbox.use`.
   */
  permission: { full: SalonPermission; own: SalonPermission | null };
  /** Where the email button points in the panel. */
  link: "calendar" | "zalo";
}

export type EventDef = CustomerEventDef | TeamEventDef;

const CUSTOMER_CHANNELS = ["zalo_template", "email"] as const;
const TEAM_CHANNELS = ["in_app", "email"] as const;
const bookingScope = { full: "bookings.read", own: "bookings.read.own" } as const;

export const CATALOG: Readonly<Record<NotificationEvent, EventDef>> = {
  "booking.confirmed": {
    audience: "customer",
    class: "transactional",
    templateKey: "bookingConfirmed",
    defaults: { email: true, inApp: null },
    channels: CUSTOMER_CHANNELS,
    ics: "publish",
  },
  "booking.rescheduled": {
    audience: "customer",
    class: "transactional",
    templateKey: "bookingRescheduled",
    defaults: { email: true, inApp: null },
    channels: CUSTOMER_CHANNELS,
    ics: "publish",
  },
  "booking.cancelled_by_salon": {
    audience: "customer",
    class: "transactional",
    templateKey: "bookingCancelledBySalon",
    defaults: { email: true, inApp: null },
    channels: CUSTOMER_CHANNELS,
    ics: "cancel",
  },
  "booking.reminder": {
    audience: "customer",
    class: "transactional",
    templateKey: "bookingReminder",
    defaults: { email: true, inApp: null },
    channels: CUSTOMER_CHANNELS,
    ics: "publish",
  },
  "salon.booking_received": {
    audience: "team",
    class: "transactional",
    templateKey: "salonBookingReceived",
    defaults: { email: true, inApp: true },
    channels: TEAM_CHANNELS,
    permission: bookingScope,
    link: "calendar",
  },
  "salon.booking_rescheduled": {
    audience: "team",
    class: "transactional",
    templateKey: "salonBookingRescheduled",
    defaults: { email: true, inApp: true },
    channels: TEAM_CHANNELS,
    permission: bookingScope,
    link: "calendar",
  },
  "salon.booking_cancelled": {
    audience: "team",
    class: "transactional",
    templateKey: "salonBookingCancelled",
    defaults: { email: true, inApp: true },
    channels: TEAM_CHANNELS,
    permission: bookingScope,
    link: "calendar",
  },
  "salon.zalo_handoff": {
    audience: "team",
    class: "transactional",
    templateKey: "salonZaloHandoff",
    defaults: { email: true, inApp: true },
    channels: TEAM_CHANNELS,
    permission: { full: "zalo.inbox.use", own: null },
    link: "zalo",
  },
};

export const customerDef = (e: CustomerNotificationEvent) => CATALOG[e] as CustomerEventDef;
export const teamDef = (e: TeamNotificationEvent) => CATALOG[e] as TeamEventDef;

/** Stored per-salon overrides: `{ "<event>": { "email": bool, "in_app": bool } }`. */
export type StoredEventSettings = Partial<
  Record<string, Partial<Record<"email" | "in_app", boolean>>>
>;

/** Effective on/off for one event × channel (salon override, else the catalog default). */
export function channelEnabled(
  stored: StoredEventSettings,
  event: NotificationEvent,
  channel: "email" | "in_app",
): boolean {
  const own = stored[event]?.[channel];
  if (typeof own === "boolean") return own;
  const d = CATALOG[event].defaults;
  return channel === "email" ? d.email : d.inApp === true;
}

export const ALL_EVENTS: readonly NotificationEvent[] = NOTIFICATION_EVENTS;
