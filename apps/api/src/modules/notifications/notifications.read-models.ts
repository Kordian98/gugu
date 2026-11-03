import { bookingMessagesSchema, bookingParamsSchema } from "@gugu/contracts";

/**
 * Read models of the notifications module (layering X7). `notifications.bookingLog` returns
 * channel, status, reason and times only: no recipient address, no message content, so it may be
 * agent-exposed later without leaking personal data to an LLM (X10).
 */
export const NOTIFICATIONS_READ_MODELS = {
  "notifications.bookingLog": {
    description:
      "Zalo messages sent to the customer about one booking (the only channel to customers), with status, reason and times, and whether the salon's OA can reach the customer (no address or content).",
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
