import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { localizedNameSchema } from "../salon/registration";

/**
 * Notification contracts (topic 11; docs/domains/customer-notifications.md). Customers get email
 * only as the fallback after Zalo (ZBS Template Message, channel id `zalo_template`); team members
 * get an in-app item (bell) plus an optional email. No SMS (X12), no customer accounts (X23).
 */

/** Events that reach the salon's customer (by Zalo first, email as the fallback). */
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

export const isTeamEvent = (e: NotificationEvent): e is TeamNotificationEvent =>
  (TEAM_NOTIFICATION_EVENTS as readonly string[]).includes(e);

/** Reminder offsets (R19): at most 3, between 30 minutes and 7 days before the start. */
export const REMINDER_OFFSET_MIN_MINUTES = 30;
export const REMINDER_OFFSET_MAX_MINUTES = 7 * 24 * 60;
export const MAX_REMINDER_OFFSETS = 3;
export const DEFAULT_REMINDER_OFFSETS = [1440, 120] as const;

// ─── Settings ───────────────────────────────────────────────────────────────────────────────────

export const notificationEventSettingSchema = z.object({
  event: notificationEventSchema,
  audience: z.enum(["customer", "team"]),
  /** Customer: email fallback on/off. Team: email copy on/off. */
  email: z.boolean(),
  /** Team only: bell item on/off; null for customer events. */
  inApp: z.boolean().nullable(),
});
export type NotificationEventSetting = z.infer<typeof notificationEventSettingSchema>;

export const notificationSettingsSchema = z.object({
  events: z.array(notificationEventSettingSchema),
  reminderOffsetsMinutes: z.array(z.number().int()),
  replyToEmail: z.string().nullable(),
  /** The salon has a connected Zalo OA: Zalo goes first, email is the fallback. */
  zaloConnected: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const notificationSettingsInputSchema = z.object({
  events: z
    .array(
      z.object({
        event: notificationEventSchema,
        email: z.boolean(),
        inApp: z.boolean().nullish(),
      }),
    )
    .max(NOTIFICATION_EVENTS.length)
    .refine((list) => new Set(list.map((e) => e.event)).size === list.length, "duplicate_event"),
  reminderOffsetsMinutes: z
    .array(z.number().int().min(REMINDER_OFFSET_MIN_MINUTES).max(REMINDER_OFFSET_MAX_MINUTES))
    .max(MAX_REMINDER_OFFSETS)
    .refine((list) => new Set(list).size === list.length, "duplicate_offset"),
  replyToEmail: z.email().max(254).nullable(),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsInputSchema>;

// ─── Per-booking message timeline (CRM booking drawer) ──────────────────────────────────────────

export const bookingMessageStatusSchema = z.enum([
  "scheduled",
  "queued",
  "sent",
  "delivered",
  "failed",
  "skipped",
  /** Zalo refused on purpose (window closed, quota, no template …). */
  "rejected",
]);
export type BookingMessageStatus = z.infer<typeof bookingMessageStatusSchema>;

/** One message to the customer about this booking. No address, no content (privacy). */
export const bookingMessageSchema = z.object({
  id: uuidV7Schema,
  channel: z.enum(["email", "zalo_template", "zalo_chat"]),
  /** Notification event or Zalo purpose code (`booking_confirmation`, `reminder_24h`, …). */
  kind: z.string(),
  /** Reminder offset in minutes, when the message is a reminder. */
  offsetMinutes: z.number().int().nullable(),
  status: bookingMessageStatusSchema,
  reason: z.string().nullable(),
  /** Email sent (or planned) only because Zalo did not deliver. */
  fallback: z.boolean(),
  scheduledFor: z.iso.datetime({ offset: true }).nullable(),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type BookingMessage = z.infer<typeof bookingMessageSchema>;

export const bookingMessagesSchema = z.object({
  items: z.array(bookingMessageSchema),
  /** The booking has an email address for the fallback. */
  hasEmail: z.boolean(),
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
