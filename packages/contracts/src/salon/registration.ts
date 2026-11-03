import { z } from "zod";
import { localeSchema, uuidV7Schema } from "../common/ids";

/**
 * Salon registration (`POST /api/v1/salons/registrations`), signed-in callers only since ADR-0018:
 * creates an organisation + a salon with full details; the caller becomes owner at once
 * (`magicLinkStatus: "not_required"`). The anonymous variant (pending until an emailed link) is
 * retired; older pending salons are still confirmed through `/me/pending-salons`.
 */

export const SALON_ERRORS = {
  invalidPhone: "salon.invalid_phone",
  unknownCategory: "salon.unknown_category",
  unknownLocation: "salon.unknown_location",
  emailRequired: "salon.email_required",
  pendingConfirmation: "salon.pending_confirmation",
  /** Quick start refused: the signed-in email has an open (or used) team invitation (q102). */
  invitationPending: "salon.invitation_pending",
  /** Quick start refused: disposable email domain (ADR-0018). */
  emailNotAllowed: "salon.email_not_allowed",
  /** Quick start refused: platform admins do not own salons. */
  quickStartNotAllowed: "salon.quick_start_not_allowed",
  /** The salon has no name yet; it is the first, mandatory setup step (q103). */
  nameRequired: "salon.name_required",
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
  /** Language the owner signed up in (analytics only). The salon itself defaults to vi. */
  locale: localeSchema.default("vi"),
  /**
   * The user saw their team invitations and chose "I'm a salon owner, create a new salon" (q102).
   * Without it, quick start refuses with 409 `salon.invitation_pending` when invitations exist.
   */
  ignoreInvitations: z.boolean().default(false),
});
export type SalonQuickStartInput = z.input<typeof salonQuickStartInputSchema>;

export const salonQuickStartResultSchema = z.object({
  salonId: uuidV7Schema,
  created: z.boolean(),
});
export type SalonQuickStartResult = z.infer<typeof salonQuickStartResultSchema>;

/** Salon name rules (q103): trimmed, 2–80 characters; required before anything else. */
export const salonNameSchema = z.string().trim().min(2).max(80);

/** Team invitations addressed to the signed-in email (`GET /me/invitations`, q102). */
export const myInvitationSchema = z.object({
  id: uuidV7Schema,
  salonName: z.string(),
  role: z.enum(["manager", "receptionist", "staff"]),
  expiresAt: z.iso.datetime(),
});
export const myInvitationListSchema = z.object({
  items: z.array(myInvitationSchema),
  /** The user accepted an invitation before but belongs to no salon now (e.g. removed). */
  formerMember: z.boolean(),
});
export type MyInvitation = z.infer<typeof myInvitationSchema>;
export type MyInvitationList = z.infer<typeof myInvitationListSchema>;
export const myInvitationParamsSchema = z.object({ invitationId: uuidV7Schema });
