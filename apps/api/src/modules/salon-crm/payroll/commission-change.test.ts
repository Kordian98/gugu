import { describe, expect, it } from "vitest";

import { applyCommissionChange } from "./commission-change";

const S1 = "01900000-0000-7000-8000-000000000001";
const S2 = "01900000-0000-7000-8000-000000000002";
const V1 = "01900000-0000-7000-8000-0000000000a1";

const base = {
  commissionPercent: 10,
  overrides: [
    { serviceId: S1, variantId: null, kind: "percent" as const, percent: 20, amount: null },
    { serviceId: S1, variantId: V1, kind: "fixed" as const, percent: null, amount: 50_000 },
  ],
};

describe("applyCommissionChange", () => {
  it("replaces the default % and keeps every own rate", () => {
    const r = applyCommissionChange(base, { target: "default", percent: 15 });
    expect(r.commissionPercent).toBe(15);
    expect(r.overrides).toEqual(base.overrides);
  });

  it("sets an own rate for several services, replacing the existing one of the same target", () => {
    const r = applyCommissionChange(base, {
      target: "override",
      services: [
        { serviceId: S1, variantId: null },
        { serviceId: S2, variantId: null },
      ],
      rate: { kind: "percent", percent: 30 },
    });
    expect(r.commissionPercent).toBe(10);
    expect(r.overrides).toEqual([
      { serviceId: S1, variantId: V1, kind: "fixed", percent: null, amount: 50_000 },
      { serviceId: S1, variantId: null, kind: "percent", percent: 30, amount: null },
      { serviceId: S2, variantId: null, kind: "percent", percent: 30, amount: null },
    ]);
  });

  it("a variant target never touches the service-level rate", () => {
    const r = applyCommissionChange(base, {
      target: "override",
      services: [{ serviceId: S1, variantId: V1 }],
      rate: { kind: "fixed", amount: 70_000 },
    });
    expect(r.overrides).toContainEqual(base.overrides[0]);
    expect(r.overrides).toContainEqual({
      serviceId: S1,
      variantId: V1,
      kind: "fixed",
      percent: null,
      amount: 70_000,
    });
    expect(r.overrides).toHaveLength(2);
  });

  it("rate null removes the own rate (back to the default %)", () => {
    const r = applyCommissionChange(base, {
      target: "override",
      services: [{ serviceId: S1 }],
      rate: null,
    });
    expect(r.overrides).toEqual([base.overrides[1]]);
  });
});
