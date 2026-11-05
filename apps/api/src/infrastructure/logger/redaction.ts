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
  "*.customService",
  "*.databaseUrl",
  "*.connectionString",
  "*.apiKey",
  'req.headers["x-api-key"]',
];

/**
 * URL path segments that are bearer secrets (booking manage tokens, topic 06). Replaced in the
 * logged request URL so tokens never reach logs, even if such a route is routed again (X23).
 */
const SECRET_PATH_PATTERNS: readonly RegExp[] = [/(\/public\/bookings\/)[^/?#]+/g];

export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined) return url;
  const safe = SECRET_PATH_PATTERNS.reduce((u, re) => u.replace(re, "$1[Redacted]"), url);
  const queryStart = safe.indexOf("?");
  if (queryStart === -1) return safe;
  const params = new URLSearchParams(safe.slice(queryStart + 1));
  // Ad hoc names are arbitrary salon-entered text and may contain customer details.
  // URLSearchParams also handles encoded keys and removes duplicate values with set().
  if (!params.has("customService")) return safe;
  params.set("customService", "[Redacted]");
  return `${safe.slice(0, queryStart)}?${params.toString()}`;
}

/** pino-http `req` serializer (applied after the standard one): redacts secret path segments. */
export function redactRequest<T extends { url?: string }>(req: T): T {
  return { ...req, url: redactUrl(req.url) };
}
