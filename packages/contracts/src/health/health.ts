import { z } from "zod";

/** One dependency probe in the readiness report (`GET /api/v1/health`). */
export const healthCheckSchema = z.object({
  status: z.enum(["up", "down"]),
  latencyMs: z.number().nonnegative(),
  /** Stable, non-sensitive reason when down (never a connection string or stack). */
  error: z.string().optional(),
});

/** Readiness report: 200 when every dependency is up, 503 otherwise. */
export const healthReportSchema = z.object({
  status: z.enum(["ok", "down"]),
  checks: z.object({ database: healthCheckSchema, redis: healthCheckSchema }),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});

/** Liveness (`GET /api/v1/health/live`): the process is serving requests; no dependency checks. */
export const livenessSchema = z.object({ status: z.literal("ok") });

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;
export type Liveness = z.infer<typeof livenessSchema>;
