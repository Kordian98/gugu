import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { localizedNameSchema } from "../salon/registration";

/**
 * Notification contracts (topic 11; docs/domains/customer-notifications.md). GuGu never emails a
 * salon's customers (X26, owner q85/q86): customers hear only from the salon's own Zalo OA (module
 * `zalo`: ZBS Template Message, channel id `zalo_template`, or a consultation message) and only
 * when the OA can reach them; otherwise nothing is sent. Team members get an in-app item (bell)
 * plus an optional email. No SMS (X12), no customer accounts (X23).
 */

/** Events that reach the salon's customer — only through the salon's Zalo OA (module `zalo`). */
export const CUSTOMER_NOTIFICATION_EVENTS = [
  "booking.confirmed",
  "booking.rescheduled",
  "booking.cancelled_by_salon",
  "booking.reminder",
] as const;

/** Events that reach team members (someone else changed a booking, a Zalo customer waits). */
export const TEAM_NOTIFICATION_EVENTS = [
  "salon.booking_received",
  "salon.booking_rescheduled",
  "salon.booking_cancelled",
  "salon.zalo_handoff",
] as const;

export const NOTIFICATION_EVENTS = [
  ...CUSTOMER_NOTIFICATION_EVENTS,
  ...TEAM_NOTIFICATION_EVENTS,
] as const;
export const notificationEventSchema = z.enum(NOTIFICATION_EVENTS);
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type CustomerNotificationEvent = (typeof CUSTOMER_NOTIFICATION_EVENTS)[number];
export type TeamNotificationEvent = (typeof TEAM_NOTIFICATION_EVENTS)[number];
export const teamNotificationEventSchema = z.enum(TEAM_NOTIFICATION_EVENTS);

export const isTeamEvent = (e: NotificationEvent): e is TeamNotificationEvent =>
  (TEAM_NOTIFICATION_EVENTS as readonly string[]).includes(e);

// ─── Settings ───────────────────────────────────────────────────────────────────────────────────

/** One team event: bell item and email copy on/off for the whole salon. */
export const notificationEventSettingSchema = z.object({
  event: teamNotificationEventSchema,
  email: z.boolean(),
  inApp: z.boolean(),
});
export type NotificationEventSetting = z.infer<typeof notificationEventSettingSchema>;

/**
 * Settings → Notifications. `zalo` is read-only here: what the salon's Zalo OA sends to customers
 * (module `zalo`; the 24 h / 2 h reminder switches are edited in Settings → Zalo).
 */
export const notificationSettingsSchema = z.object({
  events: z.array(notificationEventSettingSchema),
  zalo: z.object({
    connected: z.boolean(),
    reminder24h: z.boolean(),
    reminder2h: z.boolean(),
  }),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const notificationSettingsInputSchema = z.object({
  events: z
    .array(
      z.object({
        event: teamNotificationEventSchema,
        email: z.boolean(),
        inApp: z.boolean(),
      }),
    )
    .max(TEAM_NOTIFICATION_EVENTS.length)
    .refine((list) => new Set(list.map((e) => e.event)).size === list.length, "duplicate_event"),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>;

// ─── Per-booking message timeline (CRM booking drawer) ──────────────────────────────────────────

/** Outcome of a Zalo send (module `zalo` send log). */
export const bookingMessageStatusSchema = z.enum([
  "queued",
  "sent",
  "failed",
  /** Zalo refused on purpose (window closed, quota, no template, salon suspended …). */
  "rejected",
]);
export type BookingMessageStatus = z.infer<typeof bookingMessageStatusSchema>;

/** One Zalo message to the customer about this booking. No address, no content (privacy). */
export const bookingMessageSchema = z.object({
  id: uuidV7Schema,
  channel: z.enum(["zalo_template", "zalo_chat"]),
  /** Zalo purpose code (`booking_confirmation`, `booking_rescheduled`, `reminder_24h`, …). */
  kind: z.string(),
  /** Reminder offset in minutes, when the message is a reminder. */
  offsetMinutes: z.number().int().nullable(),
  status: bookingMessageStatusSchema,
  reason: z.string().nullable(),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type BookingMessage = z.infer<typeof bookingMessageSchema>;

/**
 * Can the salon's Zalo OA reach this customer right now? `not_connected`: the salon has no
 * connected OA; `not_linked`: the customer has no (unique) Zalo conversation with the OA.
 * Either way nothing is sent to the customer — there is no other channel (X26).
 */
export const zaloReachSchema = z.enum(["reachable", "not_linked", "not_connected"]);
export type ZaloReach = z.infer<typeof zaloReachSchema>;

export const bookingMessagesSchema = z.object({
  items: z.array(bookingMessageSchema),
  zaloReach: zaloReachSchema,
});
export type BookingMessages = z.infer<typeof bookingMessagesSchema>;

// ─── Team inbox (bell) ──────────────────────────────────────────────────────────────────────────

export const inboxItemSchema = z.object({
  id: uuidV7Schema,
  event: z.enum(TEAM_NOTIFICATION_EVENTS),
  createdAt: z.iso.datetime({ offset: true }),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  booking: z
    .object({
      id: uuidV7Schema,
      referenceCode: z.string(),
      startsAt: z.iso.datetime({ offset: true }),
      service: localizedNameSchema.nullable(),
      customerName: z.string().nullable(),
      customerAnonymised: z.boolean(),
      staffName: z.string().nullable(),
    })
    .nullable(),
  conversation: z.object({ id: uuidV7Schema, displayName: z.string().nullable() }).nullable(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const inboxSchema = z.object({
  items: z.array(inboxItemSchema),
  unread: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type Inbox = z.infer<typeof inboxSchema>;

export const inboxQuerySchema = z.object({
  cursor: uuidV7Schema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;

/** Mark items read; without `ids` every item of the member in this salon. */
export const inboxReadInputSchema = z.object({ ids: z.array(uuidV7Schema).max(100).optional() });
export type InboxReadInput = z.infer<typeof inboxReadInputSchema>;

export const memberNotificationPrefsSchema = z.object({ emailEnabled: z.boolean() });
export type MemberNotificationPrefs = z.infer<typeof memberNotificationPrefsSchema>;
