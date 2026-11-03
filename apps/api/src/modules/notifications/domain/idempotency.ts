import { createHash } from "node:crypto";

export interface IdempotencyParts {
  event: string;
  entityId: string;
  /** Booking version, or the source event id when the entity has no version. */
  entityVersion: number | string;
  /** Team member user id (customers get nothing from this module, X26). */
  recipientId: string;
  channel: string;
  variant?: string;
}

/**
 * Deterministic delivery key (spec 11 G7):
 * `sha256(event_type|entity_id|entity_version|recipient_id|channel|variant)`. Used as the unique key
 * of `notification_deliveries` and as the BullMQ job id, so replays and retries never double-send.
 * Hex only: BullMQ job ids must not contain `:`.
 */
export function idempotencyKey(p: IdempotencyParts): string {
  return createHash("sha256")
    .update(
      [
        p.event,
        p.entityId,
        String(p.entityVersion),
        p.recipientId,
        p.channel,
        p.variant ?? "",
      ].join("|"),
    )
    .digest("hex");
}
