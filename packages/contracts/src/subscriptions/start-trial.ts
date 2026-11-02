import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { planCodeSchema, subscriptionStatusSchema } from "./entitlements";

/**
 * Contract between salon registration (topic 05) and subscriptions (topic 12): registration calls
 * `SubscriptionsFacade.startTrial({ salonId })` inside its own transaction right after inserting
 * the salon. Every new salon gets a 14-day trial with Pro features and Basic limits (plan `trial`).
 * Idempotent per salon: calling it again while that trial is current returns the same subscription;
 * calling it for a salon that already used a trial or has another subscription fails with
 * `subscription.trial_unavailable` (409).
 */
export const startTrialInputSchema = z.object({ salonId: uuidV7Schema });
export type StartTrialInput = z.infer<typeof startTrialInputSchema>;

export const TRIAL_DAYS = 14;

export const subscriptionSummarySchema = z.object({
  id: uuidV7Schema,
  salonId: uuidV7Schema,
  plan: planCodeSchema,
  status: subscriptionStatusSchema,
  trialEndsAt: z.iso.datetime().nullable(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;
