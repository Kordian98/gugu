import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/** 256-bit URL-safe random secret (session cookies, access/refresh tokens, magic-link tokens). */
export const randomToken = (): string => randomBytes(32).toString("base64url");

/** 6-digit numeric code from a CSPRNG (magic-link code for typing on another device). */
export const randomCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

/**
 * Keyed hash used for every stored secret. `purpose` separates domains so a hash of one kind can
 * never be replayed as another (session vs refresh vs magic link vs CSRF).
 */
export function tokenHash(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}\u0000${value}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Coarse IP for logs/audit: /24 for IPv4, /48 for IPv6 (spec 05 R8 — no full IPs stored). */
export function ipPrefix(ip: string | undefined): string | null {
  if (!ip) return null;
  const plain = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(plain) === 4) return `${plain.split(".").slice(0, 3).join(".")}.0/24`;
  if (isIP(plain) === 6) return `${plain.split(":").slice(0, 3).join(":")}::/48`;
  return null;
}
