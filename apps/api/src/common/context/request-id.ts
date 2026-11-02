import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
type WithId = IncomingMessage & { id?: unknown };

/**
 * Request id shared by the logger, RequestContext and problem+json `traceId`. Accepts a well-formed
 * incoming `x-request-id` (from a proxy or the app) and otherwise generates one; memoised on `req.id`.
 */
export function resolveRequestId(req: IncomingMessage): string {
  const r = req as WithId;
  if (typeof r.id === "string") return r.id;
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : randomUUID();
  r.id = id;
  return id;
}
