import { describe, expect, it } from "vitest";

import { estimate } from "../pricing/model";
import { CASES, caseEstimate, metricValue } from "./data";

describe("case studies", () => {
  it("tells four salons, each with three different outcomes", () => {
    expect(CASES.map((c) => c.k)).toEqual(["nail", "hair", "spa", "lash"]);
    for (const c of CASES) expect(new Set(c.outcomes).size).toBe(3);
  });

  it("takes every number from the pricing model", () => {
    for (const c of CASES) {
      const e = estimate({ weekly: c.weekly, price: c.price, staff: c.staff });
      expect(caseEstimate(c)).toEqual(e);
      expect(metricValue(e, "desk")).toBe(e.hours);
      expect(metricValue(e, "owner")).toBe(e.ownerHours);
      expect(metricValue(e, "kept")).toBe(e.keptVnd);
    }
  });

  it("stays modest (illustrative, conservative)", () => {
    const hair = CASES.find((c) => c.k === "hair");
    expect(hair).toBeDefined();
    if (!hair) return;
    // 90 bookings/week → 390 a month; 3 min each ≈ 20 h; 5 staff × 80 min + 60 min ≈ 8 h
    expect(caseEstimate(hair)).toMatchObject({ bookingsPerMonth: 390, hours: 20, ownerHours: 8 });
    for (const c of CASES) expect(caseEstimate(c).keptVnd).toBeLessThan(5_000_000);
  });
});
