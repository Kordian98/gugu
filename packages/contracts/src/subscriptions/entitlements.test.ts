import { describe, expect, it } from "vitest";
import {
  defaultEntitlementValue,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  entitlementMapSchema,
  isWithinLimit,
  parseEntitlementValue,
} from "../index";

describe("entitlement registry", () => {
  it("defaults booleans to false and limits to 0", () => {
    expect(defaultEntitlementValue("ai.agent.enabled")).toBe(false);
    expect(defaultEntitlementValue("ai.monthly_cost_cap_vnd")).toBe(0);
  });

  it("validates stored values against the key type", () => {
    expect(parseEntitlementValue("zalo.inbox", true)).toBe(true);
    expect(parseEntitlementValue("zalo.inbox", 1)).toBeUndefined();
    expect(parseEntitlementValue("salon.max_locations", "unlimited")).toBe("unlimited");
    expect(parseEntitlementValue("salon.max_locations", -1)).toBeUndefined();
    expect(parseEntitlementValue("salon.max_locations", 1.5)).toBeUndefined();
  });

  it("checks limits, including unlimited", () => {
    expect(isWithinLimit(100, 99)).toBe(true);
    expect(isWithinLimit(100, 100)).toBe(false);
    expect(isWithinLimit("unlimited", 1_000_000, 50)).toBe(true);
  });

  it("requires a value for every key in the read model", () => {
    const all = Object.fromEntries(
      (Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[]).map((k) => [
        k,
        defaultEntitlementValue(k),
      ]),
    );
    expect(entitlementMapSchema.safeParse(all).success).toBe(true);
    const missing = { ...all };
    delete missing["zalo.inbox"];
    expect(entitlementMapSchema.safeParse(missing).success).toBe(false);
  });
});
