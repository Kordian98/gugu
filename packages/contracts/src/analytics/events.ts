import { z } from "zod";
import { businessTypeSchema, setupMethodSchema, setupStepSchema } from "../salon-settings/setup";

/**
 * Minimal in-house analytics catalogue (X14), server-side events only, until topic 12 builds the
 * full pipeline (`packages/analytics`, consent-gated client events, rollups). Properties are ids,
 * enums and counts: never names, emails, phones, free text or raw user ids (the store keeps a
 * salted `actor_hash`). Funnel of the email-only signup: `salon_quick_started` →
 * `setup_step_viewed`/`_completed`/`_skipped` per step → `setup_finished` (or `setup_left`).
 */
export const ANALYTICS_EVENTS = {
  salon_quick_started: z.object({ locale: z.enum(["vi", "en"]) }).strict(),
  setup_step_viewed: z.object({ step: setupStepSchema, step_index: z.number().int() }).strict(),
  setup_step_completed: z
    .object({
      step: setupStepSchema,
      step_index: z.number().int(),
      method: setupMethodSchema.nullable(),
      business_type: businessTypeSchema.nullable(),
      seconds_since_start: z.number().int().min(0),
    })
    .strict(),
  setup_step_skipped: z.object({ step: setupStepSchema, step_index: z.number().int() }).strict(),
  setup_left: z.object({ step: setupStepSchema, step_index: z.number().int() }).strict(),
  setup_finished: z
    .object({
      seconds_since_start: z.number().int().min(0),
      completed_count: z.number().int().min(0),
      skipped_count: z.number().int().min(0),
      went_live: z.boolean(),
    })
    .strict(),
  setup_card_dismissed: z.object({ remaining_count: z.number().int().min(0) }).strict(),
  starter_services_added: z
    .object({ business_type: businessTypeSchema, count: z.number().int().min(0) })
    .strict(),
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsProps<N extends AnalyticsEventName> = z.infer<(typeof ANALYTICS_EVENTS)[N]>;

/** Property names that must never appear in an event (PII deny-list, checked by a unit test). */
export const ANALYTICS_DENIED_PROPS = [
  "email",
  "phone",
  "name",
  "display_name",
  "address",
  "note",
  "text",
  "message",
  "user_id",
  "ip",
] as const;
