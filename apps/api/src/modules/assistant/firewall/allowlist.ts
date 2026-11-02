import { isPiiFreeString } from "@gugu/contracts";
import type { z } from "zod";

export type AllowlistResult =
  { ok: true; value: unknown } | { ok: false; path: string; reason: "schema" | "string" };

/**
 * Tool-result allowlist check (spec 08 §4.3 step 3, blocking). A result passes only if it matches
 * the tool's strict output schema **and** every string in it is a token, an ISO date/time or a known
 * enum value. Anything else (an extra `name` field, free text, a nested unknown object) is withheld.
 */
export function checkToolResult(schema: z.ZodType, value: unknown): AllowlistResult {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, path: parsed.error.issues[0]?.path.join(".") ?? "", reason: "schema" };
  }
  const bad = findFreeString(parsed.data, "");
  return bad === null
    ? { ok: true, value: parsed.data }
    : { ok: false, path: bad, reason: "string" };
}

function findFreeString(value: unknown, path: string): string | null {
  if (typeof value === "string") return isPiiFreeString(value) ? null : path;
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) {
      const hit = findFreeString(v, `${path}.${String(i)}`);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findFreeString(v, path ? `${path}.${k}` : k);
      if (hit !== null) return hit;
    }
  }
  return null;
}
