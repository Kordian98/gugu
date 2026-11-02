/**
 * Fields that must never reach logs (docs/tasks/04-backend-database.md §4.5): credentials, OTP,
 * contact details and free-text notes. Pino replaces them with "[Redacted]".
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.otp",
  "*.phone",
  "*.phoneE164",
  "*.email",
  "*.notes",
  "*.note",
  "*.databaseUrl",
  "*.connectionString",
];

/**
 * URL path segments that are bearer secrets (booking manage tokens, topic 06). Replaced in the
 * logged request URL so tokens never reach logs, even if such a route is routed again (X23).
 */
const SECRET_PATH_PATTERNS: readonly RegExp[] = [/(\/public\/bookings\/)[^/?#]+/g];

export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined) return url;
  return SECRET_PATH_PATTERNS.reduce((u, re) => u.replace(re, "$1[Redacted]"), url);
}

/** pino-http `req` serializer (applied after the standard one): redacts secret path segments. */
export function redactRequest<T extends { url?: string }>(req: T): T {
  return { ...req, url: redactUrl(req.url) };
}
