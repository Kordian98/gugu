import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * Resources (topic 06 M6.6): salon-defined resource types ("Giường massage"), resources with a
 * capacity (= number of identical units), and what each service requires. Availability needs a
 * free staff member AND free units of every required type.
 */

const nameSchema = z.string().trim().min(1).max(80);

export const resourceRequirementSchema = z.object({
  resourceTypeId: uuidV7Schema,
  /** Units needed at the same time (1–3). */
  quantity: z.number().int().min(1).max(3).default(1),
});
export type ResourceRequirement = z.infer<typeof resourceRequirementSchema>;

/** Requirements list: at most one entry per type. */
export const resourceRequirementListSchema = z
  .array(resourceRequirementSchema)
  .max(5)
  .refine((items) => new Set(items.map((i) => i.resourceTypeId)).size === items.length, {
    message: "duplicate_resource_type",
  });

export const resourceSchema = z.object({
  id: uuidV7Schema,
  resourceTypeId: uuidV7Schema,
  name: z.string(),
  /** Active units. */
  capacity: z.number().int(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type Resource = z.infer<typeof resourceSchema>;

export const resourceTypeSchema = z.object({
  id: uuidV7Schema,
  name: z.string(),
  sortOrder: z.number().int(),
  /** Services that require this type (deleting the type is refused while > 0). */
  requiredByServiceCount: z.number().int(),
  resources: z.array(resourceSchema),
});
export type ResourceType = z.infer<typeof resourceTypeSchema>;
export const resourceTypeListSchema = z.object({ items: z.array(resourceTypeSchema) });
export type ResourceTypeList = z.infer<typeof resourceTypeListSchema>;

export const resourceTypeParamsSchema = z.object({
  salonId: uuidV7Schema,
  resourceTypeId: uuidV7Schema,
});
export const resourceParamsSchema = z.object({ salonId: uuidV7Schema, resourceId: uuidV7Schema });
export const serviceResourceParamsSchema = z.object({
  salonId: uuidV7Schema,
  serviceId: uuidV7Schema,
});

export const createResourceTypeInputSchema = z.object({
  name: nameSchema,
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type CreateResourceTypeInput = z.infer<typeof createResourceTypeInputSchema>;
export const updateResourceTypeInputSchema = createResourceTypeInputSchema.partial();
export type UpdateResourceTypeInput = z.infer<typeof updateResourceTypeInputSchema>;

/** Most a single resource may hold; larger rooms are modelled as several resources. */
export const MAX_RESOURCE_CAPACITY = 50;

export const createResourceInputSchema = z.object({
  resourceTypeId: uuidV7Schema,
  name: nameSchema,
  capacity: z.number().int().min(1).max(MAX_RESOURCE_CAPACITY).default(1),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type CreateResourceInput = z.infer<typeof createResourceInputSchema>;
export const updateResourceInputSchema = z.object({
  name: nameSchema.optional(),
  capacity: z.number().int().min(1).max(MAX_RESOURCE_CAPACITY).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type UpdateResourceInput = z.infer<typeof updateResourceInputSchema>;

export const serviceResourceRequirementsSchema = z.object({
  items: z.array(resourceRequirementSchema),
});
export const replaceServiceResourceRequirementsInputSchema = z.object({
  items: resourceRequirementListSchema,
});
export type ReplaceServiceResourceRequirementsInput = z.infer<
  typeof replaceServiceResourceRequirementsInputSchema
>;

/** Problem codes of the resources endpoints. */
export const RESOURCE_ERRORS = {
  typeInUse: "resource.type_in_use",
  inUse: "resource.in_use",
  notFound: "resource.not_found",
  typeNotFound: "resource.type_not_found",
} as const;
