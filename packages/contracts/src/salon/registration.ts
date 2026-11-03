import { z } from "zod";
import { emailSchema } from "../auth/auth";
import { localeSchema, uuidV7Schema } from "../common/ids";

/**
 * Salon registration (`POST /api/v1/salons/registrations`). Creates an organisation + its first
 * salon; the caller becomes owner. Signed-in callers are owners at once (`magicLinkStatus:
 * "not_required"`). Anonymous callers must give `email`; the salon stays a draft and the owner
 * membership waits until the emailed magic link is opened (`"sent"`). Shape agreed with topic 07.
 */

export const SALON_ERRORS = {
  invalidPhone: "salon.invalid_phone",
  unknownCategory: "salon.unknown_category",
  unknownLocation: "salon.unknown_location",
  emailRequired: "salon.email_required",
  pendingConfirmation: "salon.pending_confirmation",
} as const;

export const salonRegistrationInputSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  categoryId: uuidV7Schema,
  /** Vietnamese number in any common format; normalised to E.164 by the API. */
  phone: z.string().trim().min(8).max(20),
  provinceId: uuidV7Schema,
  wardId: uuidV7Schema,
  streetAddress: z.string().trim().min(3).max(200),
  locationsHint: z.enum(["1", "2+"]),
  locale: localeSchema,
  /** Required only when the caller is not signed in. */
  email: emailSchema.optional(),
});
export type SalonRegistrationInput = z.infer<typeof salonRegistrationInputSchema>;

export const salonRegistrationResultSchema = z.object({
  salonId: uuidV7Schema,
  salonSlug: z.string(),
  organisationId: uuidV7Schema,
  status: z.enum(["draft", "active"]),
  /** `rate_limited`: email limit hit — the owner signs in later with that email and confirms the salon explicitly (`/me/pending-salons`). */
  magicLinkStatus: z.enum(["not_required", "sent", "rate_limited"]),
});
export type SalonRegistrationResult = z.infer<typeof salonRegistrationResultSchema>;

export const localizedNameSchema = z.object({ vi: z.string(), en: z.string() });

export const locationItemSchema = z.object({
  id: uuidV7Schema,
  code: z.string(),
  level: z.enum(["province", "ward"]),
  name: localizedNameSchema,
});
export type LocationItem = z.infer<typeof locationItemSchema>;

export const locationListQuerySchema = z.object({
  level: z.enum(["province", "ward"]).default("province"),
  parentId: uuidV7Schema.optional(),
});
export type LocationListQuery = z.infer<typeof locationListQuerySchema>;

export const locationListSchema = z.object({ items: z.array(locationItemSchema) });

export const categoryItemSchema = z.object({
  id: uuidV7Schema,
  slug: z.string(),
  name: localizedNameSchema,
});
export type CategoryItem = z.infer<typeof categoryItemSchema>;

export const categoryListSchema = z.object({ items: z.array(categoryItemSchema) });

/**
 * Email-only signup (owner 2026-11-04): `POST /api/v1/salons/quick-start`, signed in. Creates the
 * caller's first salon as a draft with smart defaults (placeholder name, Asia/Ho_Chi_Minh, vi,
 * default booking window, trial + free Basic year) so nothing blocks entry. Idempotent per user:
 * a double click or a retry returns the same salon with `created: false`.
 */
export const salonQuickStartInputSchema = z.object({
  /** Language the owner signed up in; picks the placeholder name. The salon itself defaults to vi. */
  locale: localeSchema.default("vi"),
});
export type SalonQuickStartInput = z.input<typeof salonQuickStartInputSchema>;

export const salonQuickStartResultSchema = z.object({
  salonId: uuidV7Schema,
  created: z.boolean(),
});
export type SalonQuickStartResult = z.infer<typeof salonQuickStartResultSchema>;

/** Placeholder salon names until the owner names the salon in the first wizard step. */
export const PLACEHOLDER_SALON_NAME = { vi: "Salon của tôi", en: "My salon" } as const;
