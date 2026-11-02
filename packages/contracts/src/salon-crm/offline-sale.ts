import { z } from "zod";
import { uuidV7Schema } from "../common/ids";

/**
 * "Amount received" recorded at completion (07 §3.4/§4.5). RevenueKind `recorded_offline_sale`:
 * what the salon says it received; GuGu processes no payment and never calls it one.
 */
export const OFFLINE_SALE_METHODS = ["cash", "bank_transfer", "ewallet", "card", "other"] as const;
export const offlineSaleMethodSchema = z.enum(OFFLINE_SALE_METHODS);

export const offlineSaleInputSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000),
  method: offlineSaleMethodSchema.default("cash"),
  note: z.string().trim().max(200).nullish(),
});
export type OfflineSaleInput = z.input<typeof offlineSaleInputSchema>;

export const offlineSaleSchema = z.object({
  id: uuidV7Schema,
  bookingId: uuidV7Schema,
  amount: z.number().int(),
  currency: z.string(),
  method: offlineSaleMethodSchema,
  note: z.string().nullable(),
  recordedAt: z.iso.datetime(),
  revenueKind: z.literal("recorded_offline_sale"),
});
export type OfflineSale = z.infer<typeof offlineSaleSchema>;

export const OFFLINE_SALE_ERRORS = {
  notCompleted: "offline_sale.booking_not_completed",
  notFound: "offline_sale.not_found",
} as const;
