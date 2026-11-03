import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238 over RFC 4226 HOTP): HMAC-SHA1, 30-second steps, 6 digits — the defaults every
 * authenticator app supports. Pure functions; the service adds replay protection (a code's step
 * must be newer than the last accepted one) and rate limits.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too (±30 s clock drift). */
export const TOTP_WINDOW = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret (RFC 4226 recommendation), base32 for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(msg).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return (bin % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

export const totpStep = (atMs: number): number => Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);

export function totp(secretBase32: string, atMs: number): string {
  return hotp(base32Decode(secretBase32), totpStep(atMs));
}

/**
 * The matching step for `code` within ±TOTP_WINDOW of `atMs`, or null. Every candidate is
 * compared in constant time and the loop never exits early, so timing reveals nothing.
 */
export function verifyTotp(secretBase32: string, code: string, atMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = totpStep(atMs);
  const given = Buffer.from(code);
  let match: number | null = null;
  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    const step = now + d;
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), given) && match === null) match = step;
  }
  return match;
}

/** `otpauth://` URI for the QR code (issuer GuGu Admin, label = issuer:account). */
export function otpauthUri(secretBase32: string, account: string): string {
  const issuer = "GuGu Admin";
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── Recovery codes ─────────────────────────────────────────────────────────────────────────────

/** Crockford base32 without I, L, O, U: easy to read aloud and to type. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `xxxxx-xxxxx` (50 bits of CSPRNG entropy). */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let s = "";
  for (const b of bytes) s += CROCKFORD.charAt(b & 31);
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** Canonical form for hashing: upper-case, no separators, Crockford look-alikes folded. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}
