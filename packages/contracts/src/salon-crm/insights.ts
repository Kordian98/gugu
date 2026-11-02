import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { bookingSourceSchema } from "../booking/source";

/**
 * Insights (topic 07 M7.8, §3.8). Metric keys and definitions come from the catalogue in
 * packages/domain/src/metrics (single source, X5/X7); the RevenueKind values mirror it (parity test
 * in apps/api). Bookings count by their start in the salon timezone.
 */

export const insightsQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((q) => q.from <= q.to, { path: ["to"], message: "to_before_from" })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 92 * 86_400_000, {
    path: ["to"],
    message: "range_too_long",
  });
export type InsightsQuery = z.infer<typeof insightsQuerySchema>;

export const revenueKindSchema = z.enum([
  "estimated_from_bookings",
  "recorded_offline_sale",
  "reported_by_salon",
]);

export const metricValueSchema = z.object({
  value: z.number().nullable(),
  previous: z.number().nullable(),
  unit: z.enum(["count", "ratio", "vnd"]),
  revenueKind: revenueKindSchema.nullable(),
});

export const insightsSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  previousRange: z.object({ from: z.string(), to: z.string() }),
  /** Own-scope readers (staff) see only their own appointments. */
  scope: z.enum(["salon", "own"]),
  metrics: z.record(z.string(), metricValueSchema),
  daily: z.array(
    z.object({
      date: z.string(),
      appointments: z.number().int(),
      completed: z.number().int(),
      estimatedRevenue: z.number().int(),
    }),
  ),
  services: z.array(
    z.object({
      serviceId: uuidV7Schema,
      name: z.object({ vi: z.string(), en: z.string() }),
      count: z.number().int(),
      estimatedRevenue: z.number().int(),
    }),
  ),
  sources: z.array(z.object({ source: bookingSourceSchema, count: z.number().int() })),
  staff: z.array(
    z.object({
      staffId: uuidV7Schema,
      name: z.string(),
      appointments: z.number().int(),
      completed: z.number().int(),
      noShows: z.number().int(),
      estimatedRevenue: z.number().int(),
    }),
  ),
});
export type Insights = z.infer<typeof insightsSchema>;
