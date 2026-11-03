import { bookingMessagesSchema, bookingParamsSchema } from "@gugu/contracts";

/**
 * Read models of the notifications module (layering X7). `notifications.bookingLog` returns
 * channel, status, reason and times only: no recipient address, no message content, so it may be
 * agent-exposed later without leaking personal data to an LLM (X10).
 */
export const NOTIFICATIONS_READ_MODELS = {
  "notifications.bookingLog": {
    description:
      "Messages sent to the customer about one booking: Zalo and email, with channel, status, skip reason and times (no address or content).",
    input: bookingParamsSchema,
    output: bookingMessagesSchema,
    permission: "bookings.read",
    scope: "salon",
    untrustedFields: [] as string[],
    piiFields: [] as string[],
    agentExposed: false,
    handler: "TimelineQueries.forBooking",
  },
} as const;
