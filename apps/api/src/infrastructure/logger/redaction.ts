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
