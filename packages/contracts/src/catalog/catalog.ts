import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { localizedNameSchema } from "../salon/registration";
import { resourceRequirementListSchema, resourceRequirementSchema } from "../booking/resources";

/**
 * Salon service catalogue (topic 07 M7.4; spec 04 §3.2 "Catalog", 06 §3.12). Money is integer VND
 * (the minor unit of VND is the đồng). Durations are minutes. `vi` is required, `en` optional.
 */

export const CATALOG_ERRORS = {
  serviceNotFound: "catalog.service_not_found",
  invalidReorder: "catalog.invalid_reorder",
  unknownStaff: "catalog.unknown_staff",
  unknownCategory: "catalog.unknown_category",
} as const;

export const localizedNameInputSchema = z.object({
  vi: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).default(""),
});
export type LocalizedNameInput = z.infer<typeof localizedNameInputSchema>;

export const localizedLongTextSchema = z.object({
  vi: z.string().trim().max(2000).default(""),
  en: z.string().trim().max(2000).default(""),
});
export type LocalizedLongText = z.infer<typeof localizedLongTextSchema>;

export const vndAmountSchema = z.number().int().min(0).max(1_000_000_000);
const durationSchema = z.number().int().min(5).max(1440);
const bufferSchema = z.number().int().min(0).max(240);

const priceRange = (v: { price?: number | null; priceMax?: number | null }) =>
  v.priceMax == null || v.price == null || v.priceMax >= v.price;

export const serviceVariantInputSchema = z
  .object({
    id: uuidV7Schema.optional(),
    name: localizedNameInputSchema,
    price: vndAmountSchema.nullable().default(null),
    priceMax: vndAmountSchema.nullable().default(null),
    durationMinutes: durationSchema.nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .refine(priceRange, { path: ["priceMax"], message: "price_max_below_price" });

export const serviceAddOnInputSchema = z
  .object({
    id: uuidV7Schema.optional(),
    name: localizedNameInputSchema,
    extraDurationMinutes: z.number().int().min(0).max(600).default(0),
    extraPrice: vndAmountSchema.default(0),
    extraPriceMax: vndAmountSchema.nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.extraPriceMax == null || v.extraPriceMax >= v.extraPrice, {
    path: ["extraPriceMax"],
    message: "price_max_below_price",
  });

/** Create or fully replace a service (variants/add-ons matched by id; missing ones are removed). */
export const serviceInputSchema = z
  .object({
    name: localizedNameInputSchema,
    description: localizedLongTextSchema.nullable().default(null),
    categoryId: uuidV7Schema.nullable().default(null),
    price: vndAmountSchema,
    priceMax: vndAmountSchema.nullable().default(null),
    durationMinutes: durationSchema,
    bufferBeforeMinutes: bufferSchema.default(0),
    bufferAfterMinutes: bufferSchema.default(0),
    isActive: z.boolean().default(true),
    variants: z.array(serviceVariantInputSchema).max(20).default([]),
    addOns: z.array(serviceAddOnInputSchema).max(20).default([]),
    /**
     * Staff profiles who perform this service (whole service, all variants). Omitted on create →
     * every bookable staff member (a service nobody performs can't be booked); omitted on update →
     * links unchanged. An explicit [] means "nobody".
     */
    staffIds: z.array(uuidV7Schema).max(100).optional(),
    /**
     * Resource types the service needs at the same time as the staff member (topic 06 M6.6),
     * e.g. a massage bed. Omitted → unchanged (none on create); [] → no resources needed.
     */
    resourceRequirements: resourceRequirementListSchema.optional(),
  })
  .refine(priceRange, { path: ["priceMax"], message: "price_max_below_price" });
export type ServiceInput = z.input<typeof serviceInputSchema>;
export type ServiceInputParsed = z.infer<typeof serviceInputSchema>;

export const serviceVariantSchema = z.object({
  id: uuidV7Schema,
  name: localizedNameSchema,
  price: z.number().int().nullable(),
  priceMax: z.number().int().nullable(),
  durationMinutes: z.number().int().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export const serviceAddOnSchema = z.object({
  id: uuidV7Schema,
  name: localizedNameSchema,
  extraDurationMinutes: z.number().int(),
  extraPrice: z.number().int(),
  extraPriceMax: z.number().int().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export const serviceSchema = z.object({
  id: uuidV7Schema,
  categoryId: uuidV7Schema.nullable(),
  name: localizedNameSchema,
  description: localizedNameSchema.nullable(),
  price: z.number().int(),
  priceMax: z.number().int().nullable(),
  currency: z.string(),
  durationMinutes: z.number().int(),
  bufferBeforeMinutes: z.number().int(),
  bufferAfterMinutes: z.number().int(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  variants: z.array(serviceVariantSchema),
  addOns: z.array(serviceAddOnSchema),
  staffIds: z.array(uuidV7Schema),
  resourceRequirements: z.array(resourceRequirementSchema),
});
export type Service = z.infer<typeof serviceSchema>;

export const serviceListSchema = z.object({ items: z.array(serviceSchema) });
export type ServiceList = z.infer<typeof serviceListSchema>;

export const serviceParamsSchema = z.object({ salonId: uuidV7Schema, serviceId: uuidV7Schema });

export const serviceActiveInputSchema = z.object({ isActive: z.boolean() });

/** New order of all (non-deleted) services of the salon. */
export const reorderInputSchema = z.object({ ids: z.array(uuidV7Schema).min(1).max(500) });
export type ReorderInput = z.infer<typeof reorderInputSchema>;
