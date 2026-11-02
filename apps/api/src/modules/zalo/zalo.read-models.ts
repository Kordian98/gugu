import { zaloStatsQuerySchema, zaloStatsSchema } from "@gugu/contracts";

/**
 * Read models of the Zalo module for dashboards and, later, the AI assistant (layering X7: read
 * models → metric catalogue → agent tools). Every field is an aggregate: no names, phones, Zalo
 * user ids or message text, so nothing here may leak personal data to an LLM (X10).
 */
export const ZALO_READ_MODELS = {
  "zalo.stats": {
    description:
      "Zalo statistics for a salon and period: contacts, bot booking funnel per step with drop-off, why bookings didn't happen, button cancellations/reschedules, reminders, staff hand-offs and message costs (salon timezone).",
    input: zaloStatsQuerySchema,
    output: zaloStatsSchema,
    permission: "analytics.read",
    scope: "salon",
    maxRange: { days: 366 },
    untrustedFields: [] as string[],
    piiFields: [] as string[],
    agentExposed: true,
    handler: "StatsQueries.stats",
  },
} as const;
