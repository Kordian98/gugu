import { z } from "zod";

/**
 * Environment contract for the API and worker. Parsed once at boot; the process refuses to start on
 * invalid config. Add a variable here before reading it anywhere (never read process.env directly).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  APP_VERSION: z.string().default("0.0.0-dev"),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "InvalidEnvError";
  }
}

/** Parses the environment; messages name the variable but never echo its value (may be a secret). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvError(
      result.error.issues.map(
        (i) =>
          `${i.path.join(".")}: ${i.code === "invalid_type" ? "missing or wrong type" : i.message}`,
      ),
    );
  }
  return result.data;
}
