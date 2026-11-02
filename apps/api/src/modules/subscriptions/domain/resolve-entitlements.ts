import {
  defaultEntitlementValue,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  type EntitlementMap,
  parseEntitlementValue,
} from "@gugu/contracts";

export interface StoredEntitlement {
  key: string;
  value: unknown;
}

export interface StoredOverride extends StoredEntitlement {
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const KEYS = Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[];

function isKey(key: string): key is EntitlementKey {
  return key in ENTITLEMENT_KEYS;
}

/**
 * Resolution order per key: active override (newest wins) → plan value → safe default (deny / 0).
 * `plan` is null when the salon has no current subscription, so everything falls back to defaults.
 * Unknown keys and values that do not fit the key's type are ignored (they never grant access).
 */
export function resolveEntitlements(
  plan: readonly StoredEntitlement[] | null,
  overrides: readonly StoredOverride[],
  now: Date,
): EntitlementMap {
  const resolved = Object.fromEntries(KEYS.map((k) => [k, defaultEntitlementValue(k)])) as Record<
    EntitlementKey,
    unknown
  >;
  for (const { key, value } of plan ?? []) {
    if (!isKey(key)) continue;
    const parsed = parseEntitlementValue(key, value);
    if (parsed !== undefined) resolved[key] = parsed;
  }
  const active = overrides
    .filter((o) => o.revokedAt === null && (o.expiresAt === null || o.expiresAt > now))
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const { key, value } of active) {
    if (!isKey(key)) continue;
    const parsed = parseEntitlementValue(key, value);
    if (parsed !== undefined) resolved[key] = parsed;
  }
  return resolved as EntitlementMap;
}
