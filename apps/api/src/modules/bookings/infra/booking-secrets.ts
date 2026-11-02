import { createHash, createHmac, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { referenceCode } from "@gugu/domain";
import { AppConfig } from "../../../infrastructure/config/app-config";

/** Manage links stop working this long after the appointment ends. */
export const MANAGE_TOKEN_TTL_AFTER_END_MS = 7 * 24 * 3_600_000;

/**
 * Keyed hashes and tokens of the booking module, under the dedicated BOOKING_TOKEN_SECRET.
 * Raw phones never become rate-limit or lock keys. The customer's manage link carries a random
 * per-booking token; only its HMAC is stored, so it can be rotated (reschedule, replay), revoked
 * (cancellation) and expires after the appointment (spec 06 §3.10, security review).
 */
@Injectable()
export class BookingSecrets {
  constructor(private readonly config: AppConfig) {}

  private mac(purpose: string, value: string): string {
    return createHmac("sha256", this.config.env.BOOKING_TOKEN_SECRET)
      .update(`${purpose}\u0000${value}`)
      .digest("base64url");
  }

  phoneHash(e164: string): string {
    return this.mac("booking.phone", e164);
  }

  deviceHash(deviceId: string): string {
    return this.mac("booking.device", deviceId);
  }

  /** A fresh manage-link token and the hash to store. */
  issueManageToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.manageTokenHash(token) };
  }

  manageTokenHash(token: string): string {
    return this.mac("booking.manage", token);
  }

  referenceCode(): string {
    return referenceCode(randomBytes(6));
  }
}

/** Stable hash of a request body for idempotency (key reuse with another body is rejected). */
export function requestHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}
