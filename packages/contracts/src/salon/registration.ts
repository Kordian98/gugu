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
  magicLinkStatus: z.enum(["not_required", "sent"]),
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
