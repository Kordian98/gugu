import { describe, expect, it } from "vitest";
import { resolveEntitlements, type StoredOverride } from "./resolve-entitlements";

const now = new Date("2026-11-02T12:00:00Z");
const override = (
  o: Partial<StoredOverride> & Pick<StoredOverride, "key" | "value">,
): StoredOverride => ({
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  ...o,
});

describe("resolveEntitlements", () => {
  it("denies everything without a current plan", () => {
    const r = resolveEntitlements(null, [], now);
    expect(r["crm.core"]).toBe(false);
    expect(r["ai.monthly_cost_cap_vnd"]).toBe(0);
  });

  it("applies plan values and ignores unknown keys and ill-typed values", () => {
    const r = resolveEntitlements(
      [
        { key: "zalo.inbox", value: true },
        { key: "ai.monthly_cost_cap_vnd", value: 20_000 },
        { key: "salon.max_locations", value: "lots" },
        { key: "not.a.key", value: true },
      ],
      [],
      now,
    );
    expect(r["zalo.inbox"]).toBe(true);
    expect(r["ai.monthly_cost_cap_vnd"]).toBe(20_000);
    expect(r["salon.max_locations"]).toBe(0);
    expect(r).not.toHaveProperty("not.a.key");
  });

  it("lets active overrides win, newest first, and skips expired or revoked ones", () => {
    const r = resolveEntitlements(
      [
        { key: "ai.agent.enabled", value: false },
        { key: "ai.monthly_cost_cap_vnd", value: 20_000 },
      ],
      [
        override({ key: "ai.agent.enabled", value: true }),
        override({
          key: "ai.monthly_cost_cap_vnd",
          value: 50_000,
          createdAt: new Date("2026-10-01Z"),
        }),
        override({ key: "ai.monthly_cost_cap_vnd", value: 90_000 }),
        override({ key: "zalo.inbox", value: true, expiresAt: new Date("2026-11-02T11:59:59Z") }),
        override({
          key: "analytics.advanced",
          value: true,
          revokedAt: new Date("2026-11-01T01:00:00Z"),
        }),
      ],
      now,
    );
    expect(r["ai.agent.enabled"]).toBe(true);
    expect(r["ai.monthly_cost_cap_vnd"]).toBe(90_000);
    expect(r["zalo.inbox"]).toBe(false);
    expect(r["analytics.advanced"]).toBe(false);
  });

  it("can restrict a feature the plan grants", () => {
    const r = resolveEntitlements(
      [{ key: "zalo.inbox", value: true }],
      [override({ key: "zalo.inbox", value: false })],
      now,
    );
    expect(r["zalo.inbox"]).toBe(false);
  });
});
