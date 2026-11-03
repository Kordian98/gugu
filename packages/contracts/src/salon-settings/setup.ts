import { z } from "zod";
import { serviceInputSchema } from "../catalog/catalog";
import { salonNameSchema } from "../salon/registration";

/**
 * Guided setup after the email-only signup (07 §3.7, owner 2026-11-04). Server-side wizard progress
 * so every step is resumable on any device; the Today "finish setup" card reads the same state.
 */

/** Big friendly tiles in step (a). `mixed` maps to no primary category. */
export const BUSINESS_TYPES = ["nails", "hair", "spa", "lashes_brows", "mixed"] as const;
export const businessTypeSchema = z.enum(BUSINESS_TYPES);
export type BusinessType = z.infer<typeof businessTypeSchema>;

/** Wizard order. `done` is the celebration screen. */
export const SETUP_STEPS = ["business", "hours", "services", "team", "zalo", "done"] as const;
export const setupStepSchema = z.enum(SETUP_STEPS);
export type SetupStep = z.infer<typeof setupStepSchema>;

/** Items the Today card can still offer once the wizard is closed. */
export const SETUP_ITEMS = ["business", "hours", "services", "team", "zalo"] as const;
export const setupItemSchema = z.enum(SETUP_ITEMS);
export type SetupItem = z.infer<typeof setupItemSchema>;

/** How a step was completed (analytics only; enums, never content). */
export const SETUP_METHODS = [
  "tiles",
  "preset",
  "custom",
  "ai_import",
  "template",
  "manual",
  "just_me",
  "team",
  "zalo_connect",
] as const;
export const setupMethodSchema = z.enum(SETUP_METHODS);
export type SetupMethod = z.infer<typeof setupMethodSchema>;

export const setupStateSchema = z.object({
  businessType: businessTypeSchema.nullable(),
  /** False until the owner saved a name (q103: required first; the app is gated on it). */
  nameConfirmed: z.boolean(),
  currentStep: setupStepSchema,
  completed: z.array(setupStepSchema),
  skipped: z.array(setupStepSchema),
  /** Finished or left with "Để sau": Today no longer opens the wizard. */
  wizardClosed: z.boolean(),
  finished: z.boolean(),
  cardDismissed: z.boolean(),
  /**
   * What is still open, from real data (not from clicks): hours, services, a bookable team member,
   * a connected Zalo OA. Never the name (mandatory). The app hides `zalo` when it is disabled.
   */
  remaining: z.array(setupItemSchema),
});
export type SetupState = z.infer<typeof setupStateSchema>;

export const setupBusinessInputSchema = z.object({
  name: salonNameSchema,
  /** Optional: the tiles can be skipped (q103 keeps only the name mandatory). */
  businessType: businessTypeSchema.nullable().default(null),
});
export type SetupBusinessInput = z.input<typeof setupBusinessInputSchema>;
export type SetupBusinessInputParsed = z.infer<typeof setupBusinessInputSchema>;

export const setupProgressInputSchema = z.object({
  step: setupStepSchema,
  /** `left`: "Để sau" — closes the wizard at this step. */
  event: z.enum(["viewed", "completed", "skipped", "left"]),
  method: setupMethodSchema.optional(),
});
export type SetupProgressInput = z.infer<typeof setupProgressInputSchema>;

/** Starter services from a template (step c, path B). Names and prices are editable before saving. */
export const starterServicesInputSchema = z.object({
  businessType: businessTypeSchema,
  items: z.array(serviceInputSchema).min(1).max(30),
});
export type StarterServicesInput = z.input<typeof starterServicesInputSchema>;
export type StarterServicesInputParsed = z.infer<typeof starterServicesInputSchema>;

export const starterServicesResultSchema = z.object({
  created: z.number().int().min(0),
  /** Rows skipped because a service with the same Vietnamese name already exists (retries). */
  skipped: z.number().int().min(0),
});
export type StarterServicesResult = z.infer<typeof starterServicesResultSchema>;
