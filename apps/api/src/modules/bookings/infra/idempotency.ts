import { BOOKING_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";

/**
 * `Idempotency-Key` handling (spec 06 §3.10, spec 04 G9). The key row is inserted as the first
 * statement of the business transaction: a duplicate request blocks on the unique index until the
 * first commits (then replays its response) or rolls back (then proceeds). Failed requests leave
 * no row, so the client may retry with the same key.
 */

type Tx = Prisma.TransactionClient;

export interface IdempotencyClaim {
  /** `user:<id>` or `device:<hash>` — keys are unique per caller. */
  scope: string;
  route: string;
  key: string | undefined;
  requestHash: string;
}

const TTL_MS = 24 * 3_600_000;
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

export type ClaimResult<T> = { kind: "new"; id: string } | { kind: "replay"; body: T };

export async function claimIdempotency<T>(
  tx: Tx,
  claim: IdempotencyClaim,
  now: Date,
): Promise<ClaimResult<T>> {
  if (!claim.key || !KEY_PATTERN.test(claim.key)) {
    throw new AppError(400, BOOKING_ERRORS.idempotencyKeyRequired, "Idempotency-Key required", {
      detail: "Send a unique Idempotency-Key header (8–128 chars) with this request.",
    });
  }
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO idempotency_keys (id, scope, route, key, request_hash, expires_at)
    VALUES (uuidv7(), ${claim.scope}, ${claim.route}, ${claim.key}, ${claim.requestHash},
      ${new Date(now.getTime() + TTL_MS)})
    ON CONFLICT (scope, route, key) DO NOTHING
    RETURNING id`;
  const id = inserted[0]?.id;
  if (id) return { kind: "new", id };

  const existing = await tx.idempotencyKey.findUniqueOrThrow({
    where: { scope_route_key: { scope: claim.scope, route: claim.route, key: claim.key } },
  });
  if (existing.requestHash !== claim.requestHash) {
    throw new AppError(422, BOOKING_ERRORS.idempotencyMismatch, "Idempotency-Key reused", {
      detail: "This key was already used with a different request body.",
    });
  }
  if (existing.responseBody === null) {
    throw new AppError(409, COMMON_ERRORS.conflict, "Request still in progress");
  }
  return { kind: "replay", body: existing.responseBody as T };
}

export async function completeIdempotency(
  tx: Tx,
  id: string,
  status: number,
  body: Prisma.InputJsonValue,
): Promise<void> {
  await tx.idempotencyKey.update({
    where: { id },
    data: { responseStatus: status, responseBody: body },
  });
}
