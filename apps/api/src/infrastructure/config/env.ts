import { z } from "zod";

/**
 * Environment contract for the API and worker. Parsed once at boot; the process refuses to start on
 * invalid config. Add a variable here before reading it anywhere (never read process.env directly).
 */
const DEV_AUTH_SECRET = "dev-only-insecure-auth-secret-do-not-use-in-prod";
const DEV_BOOKING_TOKEN_SECRET = "dev-only-insecure-booking-token-secret-not-for-prod";
const DEV_ZALO_TOKEN_KEY = "dev-only-insecure-zalo-token-key-do-not-use-in-prod";
const DEV_ZALO_OA_SECRET_KEY = "dev-only-zalo-emulator-oa-secret-key";

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
    /**
     * Dedicated HMAC key for booking tokens and hashes (customer manage links, phone/device hashes;
     * topic 06). Separate from AUTH_SECRET so either can rotate alone. ≥ 32 chars.
     */
    BOOKING_TOKEN_SECRET: z.string().min(32).default(DEV_BOOKING_TOKEN_SECRET),
    /** Public web app origin; magic links point here (`/{locale}/auth/verify?token=…`). */
    WEB_APP_URL: z.url().default("http://localhost:8097"),
    /**
     * Express `trust proxy` (spec 05 R32): which hops may set X-Forwarded-For, so `req.ip` is the
     * real client. `false` (default, local: no proxy) | hop count (`1` behind one LB/Cloudflare) |
     * comma-separated IPs/CIDRs/`loopback`. Never `true` (any client could spoof its IP).
     */
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform(parseTrustProxy)
      .pipe(
        z.union([z.literal(false), z.number(), z.string()], {
          error: "false, a hop count, or IP/CIDR list (not true)",
        }),
      ),
    /** Comma-separated origins allowed to call the API with credentials (CORS). */
    WEB_ORIGINS: z.string().default("http://localhost:8097"),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).default("smtp://127.0.0.1:11025"),
    MAIL_FROM: z.string().default("GuGu <no-reply@gugu.local>"),
    /** Indicative cost of one email in VND for the per-salon send log (q33; SES ≈ 0.1 USD/1000). */
    NOTIFY_EMAIL_COST_VND: z.coerce.number().int().min(0).default(3),
    /** Abuse caps on customer emails (addresses are typed by staff, unverified): per salon per day… */
    NOTIFY_CUSTOMER_EMAILS_PER_SALON_DAY: z.coerce.number().int().min(1).default(500),
    /** …and per recipient address per salon per day. */
    NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY: z.coerce.number().int().min(1).default(10),
    /** …and per canonical address across all salons per day. */
    NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY_ALL_SALONS: z.coerce.number().int().min(1).default(20),
    /** Comma-separated OAuth client IDs; empty = provider disabled (Apple/Google sign-in, R5). */
    GOOGLE_CLIENT_IDS: z.string().default(""),
    APPLE_CLIENT_IDS: z.string().default(""),
    /**
     * Anthropic API key for AI features (topic 08). Empty = AI import shows "not configured" and
     * no request is ever made. Never logged.
     */
    ANTHROPIC_API_KEY: z.string().default(""),
    /** Fixed USD→VND rate used to convert LLM token cost into the VND cost cap (q73). */
    AI_USD_TO_VND: z.coerce.number().positive().default(26_000),
    /** Zalo Login is built but hidden until the central GuGu OA exists (q28). */
    ZALO_LOGIN_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    /** Public origin of this API (Zalo OAuth callback, emulator pages and webhook target). */
    API_PUBLIC_URL: z.url().default("http://localhost:3001"),
    /**
     * Zalo OA integration (topic 09, X24). `emulated` = built-in emulator, no real Zalo (default
     * outside production); `http` = real Zalo APIs (needs ZALO_APP_ID/SECRET); `disabled` = off
     * (default in production).
     */
    ZALO_CLIENT: z.enum(["disabled", "emulated", "http"]).optional(),
    ZALO_APP_ID: z.string().default(""),
    ZALO_APP_SECRET: z.string().default(""),
    /** Key Zalo uses to sign webhooks for our app ("OA Secret Key" in the Zalo app console). */
    ZALO_OA_SECRET_KEY: z.string().min(16).default(DEV_ZALO_OA_SECRET_KEY),
    /** Encrypts per-salon OA tokens at rest (AES-256-GCM, key derived with SHA-256). ≥ 32 chars. */
    ZALO_TOKEN_KEY: z.string().min(32).default(DEV_ZALO_TOKEN_KEY),
    /** Key prefix for the built-in emulator's Redis state; tests use one per run. */
    ZALO_EMULATOR_NAMESPACE: z
      .string()
      .regex(/^[\w-]{1,64}$/)
      .default("dev"),
    /** Indicative prices for the send log (VND). Override when real prices are known. */
    ZALO_PRICE_TEMPLATE_VND: z.coerce.number().int().min(0).default(200),
    ZALO_PRICE_CS_PAID_VND: z.coerce.number().int().min(0).default(55),
    /**
     * Marketplace launch (spec 12 R-FP1). Unset = not launched: a salon whose first paid plan
     * becomes active before this moment becomes a founding partner (X20). ISO 8601 UTC.
     */
    MARKETPLACE_LAUNCH_AT: z.iso.datetime().optional(),
    /**
     * GuGu support contact shown to salon members, e.g. in the suspension banner (q89). Set the
     * real address per environment; the default only exists for local dev and tests.
     */
    SUPPORT_EMAIL: z.email().default("support@gugu.local"),
    /** Optional support phone / Zalo number, shown as written (e.g. `0901 234 567`). */
    SUPPORT_PHONE: z.string().trim().max(40).optional(),
    /**
     * Suspended salon (q89): the Zalo bot answers a conversation with the neutral "please contact
     * the salon" notice at most once per this many hours.
     */
    ZALO_SUSPENDED_NOTICE_COOLDOWN_HOURS: z.coerce.number().min(1).max(720).default(24),
  })
  .transform((env) => ({
    ...env,
    ZALO_CLIENT: env.ZALO_CLIENT ?? (env.NODE_ENV === "production" ? "disabled" : "emulated"),
  }))
  .refine((env) => env.NODE_ENV !== "production" || env.AUTH_SECRET !== DEV_AUTH_SECRET, {
    path: ["AUTH_SECRET"],
    message: "must be set in production",
  })
  .refine(
    (env) => env.NODE_ENV !== "production" || env.BOOKING_TOKEN_SECRET !== DEV_BOOKING_TOKEN_SECRET,
    { path: ["BOOKING_TOKEN_SECRET"], message: "must be set in production" },
  )
  .refine((env) => env.NODE_ENV !== "production" || env.ZALO_CLIENT !== "emulated", {
    path: ["ZALO_CLIENT"],
    message: "the Zalo emulator is not allowed in production",
  })
  .refine(
    (env) =>
      env.ZALO_CLIENT !== "http" ||
      (env.ZALO_APP_ID !== "" &&
        env.ZALO_APP_SECRET !== "" &&
        env.ZALO_OA_SECRET_KEY !== DEV_ZALO_OA_SECRET_KEY &&
        env.ZALO_TOKEN_KEY !== DEV_ZALO_TOKEN_KEY),
    {
      path: ["ZALO_CLIENT"],
      message: "http needs ZALO_APP_ID, ZALO_APP_SECRET, ZALO_OA_SECRET_KEY, ZALO_TOKEN_KEY",
    },
  );

export type Env = z.infer<typeof envSchema>;

/** `false` | hop count | address list; null for invalid input (including `true`). */
export function parseTrustProxy(raw: string): false | number | string | null {
  const value = raw.trim();
  if (value === "" || value === "false" || value === "0") return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "true") return null;
  return /^[\w.:/,\s-]+$/.test(value) ? value : null;
}

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
