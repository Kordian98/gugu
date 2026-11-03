import { describe, expect, it } from "vitest";
import type { EmployerCost, PayVersion } from "./commission";
import { employerCostTerms, employerExtra } from "./payroll";
import { monthProfit } from "./profit";

const v = (effectiveFrom: string, employerCost: EmployerCost | null): PayVersion => ({
  effectiveFrom,
  baseType: "monthly",
  baseAmount: 10_000_000,
  commissionBps: 1000,
  overrides: [],
  employerCost,
});

describe("employer cost (chi phí thực tế, ADR-0017)", () => {
  it("not set: no extra, real cost = gross", () => {
    const t = employerCostTerms({
      versions: [v("2026-01-01", null)],
      month: "2026-12",
      employedUntil: null,
    });
    expect(t).toEqual({ fixed: 0, bps: 0, set: false });
    expect(employerExtra(t, 12_000_000)).toBe(0);
  });

  it("a % applies to gross; a fixed amount is per month", () => {
    const pct = employerCostTerms({
      versions: [v("2026-01-01", { kind: "percent", bps: 2150 })],
      month: "2026-12",
      employedUntil: null,
    });
    expect(employerExtra(pct, 10_000_000)).toBe(2_150_000);
    const fixed = employerCostTerms({
      versions: [v("2026-01-01", { kind: "fixed", amount: 3_100_000 })],
      month: "2026-12",
      employedUntil: null,
    });
    expect(employerExtra(fixed, 10_000_000)).toBe(3_100_000);
  });

  it("effective-dated: fixed pro-rated by days, % weighted by employed days", () => {
    const t = employerCostTerms({
      versions: [
        v("2026-12-01", { kind: "fixed", amount: 620_000 }),
        v("2026-12-16", { kind: "percent", bps: 1000 }),
      ],
      month: "2026-12",
      employedUntil: null,
    });
    expect(t.fixed).toBe(300_000);
    expect(t.bps).toBeCloseTo((1000 * 16) / 31);
    expect(employerExtra(t, 1_545_000)).toBe(300_000 + 79_742);
  });

  it("leaving mid-month pro-rates the fixed amount; a later month without a version adds nothing", () => {
    const t = employerCostTerms({
      versions: [v("2026-01-01", { kind: "fixed", amount: 3_000_000 })],
      month: "2026-11",
      employedUntil: "2026-11-10",
    });
    expect(t.fixed).toBe(1_000_000);
    const before = employerCostTerms({
      versions: [v("2027-01-01", { kind: "percent", bps: 2000 })],
      month: "2026-12",
      employedUntil: null,
    });
    expect(employerExtra(before, 5_000_000)).toBe(0);
  });

  it("never negative on a negative gross (deductions larger than pay)", () => {
    const t = { fixed: 0, bps: 2000, set: true };
    expect(employerExtra(t, -100_000)).toBe(0);
  });

  it("profit: payroll includes employer costs; the upcoming part follows the no-show assumption", () => {
    const p = monthProfit({
      earned: 30_000_000,
      earnedRecorded: 0,
      upcoming: 10_000_000,
      noShowRate: 0.1,
      serviceCostsActual: 0,
      serviceCostsUpcoming: 0,
      basePay: 10_000_000,
      commissionEarned: 1_000_000,
      commissionUpcoming: 1_000_000,
      adjustments: 0,
      employerCostsActual: 2_000_000,
      employerCostsUpcoming: 200_000,
      otherCosts: 0,
      elapsedDays: 15,
      daysInMonth: 30,
    });
    expect(p.employerCosts).toBe(2_000_000 + 180_000);
    expect(p.payroll).toBe(10_000_000 + 1_000_000 + 900_000 + 2_180_000);
    expect(p.netProfit).toBe(p.revenueTotal - p.payroll);
  });
});
