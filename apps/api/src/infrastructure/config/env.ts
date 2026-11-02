import { z } from "zod";

/**
 * Environment contract for the API and worker. Parsed once at boot; the process refuses to start on
 * invalid config. Add a variable here before reading it anywhere (never read process.env directly).
 */
const DEV_AUTH_SECRET = "dev-only-insecure-auth-secret-do-not-use-in-prod";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    APP_VERSION: z.string().default("0.0.0-dev"),
    /**
     * HMAC key for session, refresh, magic-link and CSRF token hashes (spec 05 R2/R9). ≥ 32 chars.
     * The built-in default only works outside production (local dev and tests).
     */
    AUTH_SECRET: z.string().min(32).default(DEV_AUTH_SECRET),
    /** Public web app origin; magic links point here (`/{locale}/auth/verify?token=…`). */
    WEB_APP_URL: z.url().default("http://localhost:8097"),
    /** Comma-separated origins allowed to call the API with credentials (CORS). */
    WEB_ORIGINS: z.string().default("http://localhost:8097"),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).default("smtp://127.0.0.1:11025"),
    MAIL_FROM: z.string().default("GuGu <no-reply@gugu.local>"),
    /** Comma-separated OAuth client IDs; empty = provider disabled (Apple/Google sign-in, R5). */
    GOOGLE_CLIENT_IDS: z.string().default(""),
    APPLE_CLIENT_IDS: z.string().default(""),
    /** Zalo Login is built but hidden until the central GuGu OA exists (q28). */
    ZALO_LOGIN_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.AUTH_SECRET !== DEV_AUTH_SECRET, {
    path: ["AUTH_SECRET"],
    message: "must be set in production",
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
