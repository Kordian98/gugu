import { z } from "zod";
import { cursorPageSchema, cursorQuerySchema } from "../common/pagination";
import { uuidV7Schema } from "../common/ids";

/**
 * Zalo integration (topic 09, roadmap X24): salon-owned OA connection, booking chatbot, staff
 * hand-off inbox and send log. Customers only ever talk to the salon's own OA — never to GuGu.
 */

/** Stable problem+json codes (clients translate `errors.<code>`). */
export const ZALO_ERRORS = {
  disabled: "zalo.disabled",
  notConnected: "zalo.not_connected",
  oauthFailed: "zalo.oauth_failed",
  oaInUse: "zalo.oa_in_use",
  windowClosed: "zalo.window_closed",
  paidMessagesOff: "zalo.paid_messages_off",
  conversationNotFound: "zalo.conversation_not_found",
  invalidSignature: "zalo.invalid_signature",
} as const;
export type ZaloErrorCode = (typeof ZALO_ERRORS)[keyof typeof ZALO_ERRORS];

/** How this API talks to Zalo: built-in emulator, real Zalo, or switched off. */
export const zaloClientModeSchema = z.enum(["disabled", "emulated", "http"]);
export type ZaloClientMode = z.infer<typeof zaloClientModeSchema>;

export const zaloConnectionStatusSchema = z.enum([
  "not_connected",
  "connected",
  "needs_reauth",
  "disconnected",
]);
export type ZaloConnectionStatus = z.infer<typeof zaloConnectionStatusSchema>;

export const zaloTemplateIdsSchema = z.object({
  booking_confirmation: z.string().trim().min(1).max(32).optional(),
  booking_reminder: z.string().trim().min(1).max(32).optional(),
});
export type ZaloTemplateIds = z.infer<typeof zaloTemplateIdsSchema>;

/** Send window of a customer: free ≤ 48 h, paid 48 h – 7 d, closed after 7 d (X24). */
export const zaloWindowSchema = z.enum(["free", "paid", "closed"]);
export type ZaloWindow = z.infer<typeof zaloWindowSchema>;

export const zaloUsageSchema = z.object({
  /** `YYYY-MM` in the salon's timezone. */
  month: z.string(),
  templatesSent: z.number().int(),
  paidMessagesSent: z.number().int(),
  freeMessagesSent: z.number().int(),
  rejected: z.number().int(),
  costEstimateVnd: z.number().int(),
  /** Plan limit for template messages this month (null = unlimited). */
  templateLimit: z.number().int().nullable(),
});
export type ZaloUsage = z.infer<typeof zaloUsageSchema>;

export const zaloConnectionSchema = z.object({
  mode: zaloClientModeSchema,
  status: zaloConnectionStatusSchema,
  oaId: z.string().nullable(),
  oaName: z.string().nullable(),
  connectedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  botEnabled: z.boolean(),
  reminder24h: z.boolean(),
  reminder2h: z.boolean(),
  allowPaidMessages: z.boolean(),
  monthlyTemplateCap: z.number().int().nullable(),
  templateIds: zaloTemplateIdsSchema,
  usage: zaloUsageSchema,
  unreadNotifications: z.number().int(),
});
export type ZaloConnection = z.infer<typeof zaloConnectionSchema>;

export const zaloStartConnectionSchema = z.object({
  /** Where the panel should return after Zalo (locale prefix only). */
  locale: z.enum(["vi", "en"]).default("vi"),
});
export const zaloStartConnectionResultSchema = z.object({ authorizeUrl: z.url() });
export type ZaloStartConnectionResult = z.infer<typeof zaloStartConnectionResultSchema>;

export const zaloSettingsInputSchema = z
  .object({
    botEnabled: z.boolean(),
    reminder24h: z.boolean(),
    reminder2h: z.boolean(),
    allowPaidMessages: z.boolean(),
    monthlyTemplateCap: z.number().int().min(0).max(100_000).nullable(),
    templateIds: zaloTemplateIdsSchema,
  })
  .partial();
export type ZaloSettingsInput = z.infer<typeof zaloSettingsInputSchema>;

export const zaloConversationSchema = z.object({
  id: uuidV7Schema,
  displayName: z.string().nullable(),
  /** Visible to members with `customers.phone.read`. */
  phone: z.string().nullable(),
  mode: z.enum(["bot", "staff"]),
  assignedUserId: uuidV7Schema.nullable(),
  handoffRequestedAt: z.iso.datetime().nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  lastMessagePreview: z.string().nullable(),
  unreadCount: z.number().int(),
  window: zaloWindowSchema,
  followed: z.boolean(),
});
export type ZaloConversation = z.infer<typeof zaloConversationSchema>;

export const zaloConversationListQuerySchema = cursorQuerySchema.extend({
  filter: z.enum(["all", "needs_staff", "unread"]).default("all"),
});
export const zaloConversationListSchema = cursorPageSchema(zaloConversationSchema);
export type ZaloConversationList = z.infer<typeof zaloConversationListSchema>;

export const zaloMessageSchema = z.object({
  id: uuidV7Schema,
  direction: z.enum(["inbound", "outbound"]),
  sender: z.enum(["customer", "bot", "staff", "system"]),
  kind: z.string(),
  text: z.string().nullable(),
  /** Button titles offered with an outbound message. */
  buttons: z.array(z.string()),
  /** Delivery status of outbound messages. */
  status: z.enum(["queued", "sent", "failed", "rejected"]).nullable(),
  createdAt: z.iso.datetime(),
});
export type ZaloMessage = z.infer<typeof zaloMessageSchema>;

export const zaloMessageListSchema = cursorPageSchema(zaloMessageSchema);
export type ZaloMessageList = z.infer<typeof zaloMessageListSchema>;

export const zaloSendMessageInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});
export type ZaloSendMessageInput = z.infer<typeof zaloSendMessageInputSchema>;

export const zaloNotificationKindSchema = z.enum([
  "handoff_requested",
  "booking_created",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_confirmed",
  "connection_needs_reauth",
]);
export const zaloNotificationSchema = z.object({
  id: uuidV7Schema,
  kind: zaloNotificationKindSchema,
  conversationId: uuidV7Schema.nullable(),
  bookingId: uuidV7Schema.nullable(),
  read: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ZaloNotification = z.infer<typeof zaloNotificationSchema>;
export const zaloNotificationListSchema = z.object({ items: z.array(zaloNotificationSchema) });
export type ZaloNotificationList = z.infer<typeof zaloNotificationListSchema>;

export const zaloSendLogEntrySchema = z.object({
  id: uuidV7Schema,
  channel: z.enum(["cs", "template"]),
  purpose: z.string(),
  tier: z.enum(["free", "paid", "template"]).nullable(),
  status: z.enum(["queued", "sent", "failed", "rejected"]),
  costEstimateVnd: z.number().int(),
  errorCode: z.string().nullable(),
  attempts: z.number().int(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
});
export type ZaloSendLogEntry = z.infer<typeof zaloSendLogEntrySchema>;
export const zaloSendLogSchema = cursorPageSchema(zaloSendLogEntrySchema);
export type ZaloSendLog = z.infer<typeof zaloSendLogSchema>;
