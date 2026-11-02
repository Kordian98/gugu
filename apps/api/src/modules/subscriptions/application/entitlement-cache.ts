import type { SalonEntitlements } from "@gugu/contracts";

/** Short-lived cache of resolved entitlements per salon (spec R-S5: 60 s TTL, invalidated on change). */
export interface EntitlementCache {
  get(salonId: string): Promise<SalonEntitlements | undefined>;
  set(salonId: string, value: SalonEntitlements, ttlSeconds: number): Promise<void>;
  delete(salonId: string): Promise<void>;
}

export const ENTITLEMENT_CACHE = Symbol("ENTITLEMENT_CACHE");
export const ENTITLEMENT_CACHE_TTL_SECONDS = 60;
