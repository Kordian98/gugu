import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";

/** Opaque offset cursor for admin lists (sorted by derived columns; bounded by `limit`). */
export function encodeOffset(offset: number): string {
  return Buffer.from(`o:${String(offset)}`).toString("base64url");
}

export function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const raw = Buffer.from(cursor, "base64url").toString();
  const match = /^o:(\d{1,7})$/.exec(raw);
  if (!match) {
    throw new AppError(400, COMMON_ERRORS.validationFailed, "Invalid cursor", {
      errors: [{ path: "cursor", code: COMMON_ERRORS.validationFailed }],
    });
  }
  return Number(match[1]);
}
