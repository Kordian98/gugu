import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

const uuidList = z.array(uuidV7Schema).max(10).default([]);

// ─── Multi-service appointments (M6.8, flag `booking.multiService`) ─────────────────────────────

/** Services after the first one an appointment may chain (first + 3 = MAX_SERVICE_LINES). */
export const MAX_NEXT_SERVICES = 3;

/**
 * A further service of the same appointment, done right after the previous one — by the same
 * staff member or another one (`staffId` null = any; the engine prefers the previous line's
 * staff). Omitted / empty everywhere = single service, the launch contract (q17).
 */
export const nextServiceSchema = z.object({
  serviceId: uuidV7Schema,
  variantId: uuidV7Schema.nullish(),
  addOnIds: uuidList,
  staffId: uuidV7Schema.nullish(),
});
export type NextService = z.infer<typeof nextServiceSchema>;

export const nextServicesList = z.array(nextServiceSchema).max(MAX_NEXT_SERVICES).default([]);

/** Query-string form: a JSON array of `nextServiceSchema` (URL-encoded). */
export const nextServicesParam = z
  .string()
  .max(2_000)
  .optional()
  .transform((v, ctx): unknown => {
    if (v === undefined || v.trim() === "") return [];
    try {
      return JSON.parse(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid_json" });
      return z.NEVER;
    }
  })
  .pipe(z.array(nextServiceSchema).max(MAX_NEXT_SERVICES));

/** `GET /salons/:id/booking-features`: what the CRM may offer (flag `booking.multiService`). */
export const bookingFeaturesSchema = z.object({
  multiService: z.boolean(),
  /** Most services one appointment may have (first + nextServices). */
  maxServices: z.number().int(),
});
export type BookingFeatureSet = z.infer<typeof bookingFeaturesSchema>;
