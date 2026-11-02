import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Zalo OA webhook signature: header `X-ZEvent-Signature: mac=<hex>` where
 * hex = SHA-256(appId + rawBody + timestamp + oaSecretKey). [3p: SDK docs; confirm in spike S-Z1]
 * The emulator signs exactly the same way, so switching to real Zalo changes no code.
 */
export const ZALO_SIGNATURE_HEADER = "x-zevent-signature";

/** Events older than this (or this far in the future) are rejected as replays. */
export const SIGNATURE_MAX_SKEW_MS = 5 * 60_000;

export function computeZaloSignature(input: {
  appId: string;
  rawBody: string;
  timestamp: string;
  secret: string;
}): string {
  return createHash("sha256")
    .update(input.appId + input.rawBody + input.timestamp + input.secret)
    .digest("hex");
}

export function verifyZaloSignature(
  header: string | undefined,
  input: { appId: string; rawBody: string; timestamp: string; secret: string },
): boolean {
  if (!header) return false;
  const given = header.trim().replace(/^mac=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = computeZaloSignature(input);
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

/** Rejects stale/future events (timestamp in ms, as Zalo sends it). */
export function isFreshTimestamp(timestamp: string, now: Date): boolean {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms)) return false;
  return Math.abs(now.getTime() - ms) <= SIGNATURE_MAX_SKEW_MS;
}
