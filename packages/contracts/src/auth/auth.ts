import { z } from "zod";
import { localeSchema, uuidV7Schema } from "../common/ids";

/**
 * Auth contracts (docs/tasks/05-auth-security.md §3.1–3.2, X11/X12). Sign-in is email magic link,
 * Apple or Google; no SMS/OTP for now. Web sessions use an httpOnly cookie + CSRF header; native
 * clients get an opaque access token + rotating refresh token in the response body.
 */

export const AUTH_ERRORS = {
  unauthenticated: "auth.unauthenticated",
  invalidOrExpiredLink: "auth.invalid_or_expired_link",
  tooManyAttempts: "auth.too_many_attempts",
  csrfFailed: "auth.csrf_failed",
  refreshInvalid: "auth.refresh_invalid",
  providerDisabled: "auth.provider_disabled",
  providerTokenInvalid: "auth.provider_token_invalid",
  accountUnavailable: "auth.account_unavailable",
} as const;

export const authClientSchema = z.enum(["web", "native"]);
export type AuthClient = z.infer<typeof authClientSchema>;

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** App-relative path to return to after sign-in; never an absolute URL (open-redirect guard). */
export const redirectPathSchema = z
  .string()
  .max(512)
  .regex(/^\/(?!\/)[\w\-./?=&%[\]]*$/, "relative_path");

export const magicLinkRequestInputSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
  client: authClientSchema.default("web"),
  redirectPath: redirectPathSchema.optional(),
});
export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestInputSchema>;

/** Always `sent`, whether or not the email has an account (no enumeration). */
export const magicLinkRequestResultSchema = z.object({ status: z.literal("sent") });
export type MagicLinkRequestResult = z.infer<typeof magicLinkRequestResultSchema>;

export const magicLinkVerifyInputSchema = z.union([
  z.object({ token: z.string().min(32).max(128), client: authClientSchema.default("web") }),
  z.object({
    email: emailSchema,
    code: z.string().regex(/^\d{6}$/, "six_digits"),
    client: authClientSchema.default("web"),
  }),
]);
export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifyInputSchema>;

export const socialProviderSchema = z.enum(["apple", "google"]);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

export const socialSignInInputSchema = z.object({
  provider: socialProviderSchema,
  idToken: z.string().min(20).max(8192),
  locale: localeSchema,
  client: authClientSchema.default("web"),
});
export type SocialSignInInput = z.infer<typeof socialSignInInputSchema>;

export const authProvidersSchema = z.object({
  emailMagicLink: z.literal(true),
  apple: z.boolean(),
  google: z.boolean(),
  /** Built but hidden until the central GuGu Zalo OA exists (q28). */
  zalo: z.boolean(),
});
export type AuthProviders = z.infer<typeof authProvidersSchema>;

export const salonRoleSchema = z.enum(["owner", "manager", "receptionist", "staff"]);

export const membershipSchema = z.object({
  salonId: uuidV7Schema,
  salonName: z.string(),
  salonSlug: z.string(),
  organizationId: uuidV7Schema,
  role: salonRoleSchema,
  status: z.enum(["active", "pending_verification"]),
});
export type Membership = z.infer<typeof membershipSchema>;

export const meSchema = z.object({
  id: uuidV7Schema,
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  displayName: z.string().nullable(),
  preferredLocale: localeSchema,
  platformRole: z.enum(["support_admin", "super_admin"]).nullable(),
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;

export const nativeTokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
});
export type NativeTokens = z.infer<typeof nativeTokensSchema>;

/** Result of any sign-in. Web: `csrfToken` (cookie is set by the response). Native: tokens. */
export const authSessionSchema = z.object({
  user: meSchema,
  session: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("web"), csrfToken: z.string() }),
    z.object({ kind: z.literal("native"), tokens: nativeTokensSchema }),
  ]),
  redirectPath: z.string().nullable(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const refreshInputSchema = z.object({ refreshToken: z.string().min(32).max(128) });
export type RefreshInput = z.infer<typeof refreshInputSchema>;

/** `GET /me` for web also returns the CSRF token so a reloaded page can keep writing. */
export const meResponseSchema = z.object({ user: meSchema, csrfToken: z.string().nullable() });
export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * Salons where the user is a pending owner (registered without a session; the registration email
 * was rate-limited or never opened). Each must be confirmed explicitly — signing in alone never
 * activates them (security review: no ownership binding without intent).
 */
export const pendingSalonSchema = z.object({
  salonId: uuidV7Schema,
  salonName: z.string(),
  createdAt: z.iso.datetime(),
});
export type PendingSalon = z.infer<typeof pendingSalonSchema>;
export const pendingSalonListSchema = z.object({ items: z.array(pendingSalonSchema) });
export type PendingSalonList = z.infer<typeof pendingSalonListSchema>;
export const pendingSalonParamsSchema = z.object({ salonId: uuidV7Schema });
