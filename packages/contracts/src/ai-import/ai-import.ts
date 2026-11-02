import { z } from "zod";
import { serviceInputSchema } from "../catalog/catalog";

/**
 * AI onboarding import (topic 08 milestone IMP, every plan): photos/screenshots of a price list →
 * suggested services the owner reviews, then creates through the catalogue API. Images pass a
 * no-PII gate (face check + OCR redaction) before one model call; nothing personal reaches the LLM.
 */

export const AI_IMPORT_ERRORS = {
  /** No `ANTHROPIC_API_KEY` on the server: the feature shows a "not configured" state. */
  notConfigured: "ai_import.not_configured",
  /** No images, more than `AI_IMPORT_MAX_IMAGES`, or a file over the size limit. */
  invalidUpload: "ai_import.invalid_upload",
  /** A file is not a readable JPEG/PNG/WebP/HEIC image. */
  imageUnreadable: "ai_import.image_unreadable",
  /** An image shows a person (a face bigger than an avatar); the owner should crop or retake it. */
  personDetected: "ai_import.person_detected",
  /** The redacted image still contained contact details after redaction; nothing was sent. */
  piiCheckFailed: "ai_import.pii_check_failed",
  /** The model returned no usable price list (unreadable images, refusal, or provider error). */
  extractionFailed: "ai_import.extraction_failed",
} as const;

export const AI_IMPORT_MAX_IMAGES = 10;
export const AI_IMPORT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const AI_IMPORT_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** Global category slugs the model may assign (seeded `service_categories`, master §7). */
export const AI_IMPORT_CATEGORY_SLUGS = [
  "nails",
  "hair",
  "barber",
  "massage",
  "spa",
  "skincare",
  "lashes",
  "brows",
  "makeup",
  "treatments",
] as const;
export const aiImportCategorySlugSchema = z.enum(AI_IMPORT_CATEGORY_SLUGS);

const draftName = z.object({ vi: z.string().max(120), en: z.string().max(120) });
const vnd = z.number().int().min(0).max(1_000_000_000);
const minutes = z.number().int().min(5).max(1440);

export const aiImportDraftVariantSchema = z.object({
  name: draftName,
  price: vnd.nullable(),
  priceMax: vnd.nullable(),
  durationMinutes: minutes.nullable(),
});

export const aiImportDraftAddOnSchema = z.object({
  name: draftName,
  extraPrice: vnd,
  extraPriceMax: vnd.nullable(),
  extraDurationMinutes: z.number().int().min(0).max(600).nullable(),
});

/** One suggested service. `durationMinutes: null` means the list did not say; the owner fills it. */
export const aiImportDraftServiceSchema = z.object({
  name: draftName,
  category: aiImportCategorySlugSchema.nullable(),
  price: vnd.nullable(),
  priceMax: vnd.nullable(),
  durationMinutes: minutes.nullable(),
  variants: z.array(aiImportDraftVariantSchema).max(20),
  addOns: z.array(aiImportDraftAddOnSchema).max(20),
  /** 1-based index of the image the row came from. */
  sourceImage: z.number().int().min(1).max(AI_IMPORT_MAX_IMAGES),
  /** `low` when the model was unsure (blurry text, guessed price); the UI highlights the row. */
  confidence: z.enum(["high", "low"]),
});
export type AiImportDraftService = z.infer<typeof aiImportDraftServiceSchema>;

export const aiImportImageReportSchema = z.object({
  index: z.number().int().min(1),
  /** Text regions blacked out before sending (phone numbers, emails, links, handles, names). */
  redactedRegions: z.number().int().min(0),
  /** Small faces (e.g. avatars in a screenshot) blacked out before sending. */
  maskedFaces: z.number().int().min(0),
});

export const aiImportUsageSchema = z.object({
  /** AI spend this calendar month (Asia/Ho_Chi_Minh), all AI features, in VND. */
  usedVnd: z.number().int().min(0),
  /** Hard monthly cap from the plan (`ai.monthly_cost_cap_vnd`), or "unlimited". */
  capVnd: z.union([z.number().int().min(0), z.literal("unlimited")]),
});
export type AiImportUsage = z.infer<typeof aiImportUsageSchema>;

export const aiImportStatusSchema = z.object({
  /** The server has an LLM provider configured. */
  configured: z.boolean(),
  /** The salon's plan includes `ai.onboarding_import`. */
  entitled: z.boolean(),
  maxImages: z.number().int(),
  usage: aiImportUsageSchema,
});
export type AiImportStatus = z.infer<typeof aiImportStatusSchema>;

export const aiImportExtractResultSchema = z.object({
  items: z.array(aiImportDraftServiceSchema).max(200),
  images: z.array(aiImportImageReportSchema),
  usage: aiImportUsageSchema,
});
export type AiImportExtractResult = z.infer<typeof aiImportExtractResultSchema>;

/** The reviewed rows, already mapped to catalogue inputs (category slug → id done by the client). */
export const aiImportConfirmInputSchema = z.object({
  items: z.array(serviceInputSchema).min(1).max(200),
});
export type AiImportConfirmInput = z.input<typeof aiImportConfirmInputSchema>;
export type AiImportConfirmInputParsed = z.infer<typeof aiImportConfirmInputSchema>;

export const aiImportConfirmResultSchema = z.object({
  created: z.number().int().min(0),
  serviceIds: z.array(z.string()),
});
export type AiImportConfirmResult = z.infer<typeof aiImportConfirmResultSchema>;
