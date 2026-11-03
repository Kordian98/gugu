import { describe, expect, it } from "vitest";
import type { PayrollMonth, PayVersion, Profit } from "@gugu/contracts";

import {
  amountLooksOff,
  effectiveChoiceOf,
  effectivePreview,
  effectiveRate,
  exampleCommission,
  groupOverrides,
  monthStatus,
  monthSummary,
  parseMoney,
  parsePercent,
  sortLines,
  topServices,
  validatePay,
  waterfall,
  waterfallRange,
} from "./model";

const S1 = "01900000-0000-7000-8000-000000000001";
const S2 = "01900000-0000-7000-8000-000000000002";
const V1 = "01900000-0000-7000-8000-0000000000a1";

const version = (p: Partial<PayVersion> = {}): PayVersion => ({
  id: "v",
  effectiveFrom: "2026-11-01",
  baseType: "monthly",
  baseAmount: 8_000_000,
  commissionPercent: 10,
  overrides: [],
  employerCost: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...p,
});

describe("effective rate", () => {
  const v = version({
    overrides: [
      { serviceId: S1, variantId: null, kind: "percent", percent: 30, amount: null },
      { serviceId: S1, variantId: V1, kind: "fixed", percent: null, amount: 50_000 },
    ],
  });
  it("variant → service → default", () => {
    expect(effectiveRate(v, S1, V1)).toEqual({
      rate: { kind: "fixed", amount: 50_000 },
      source: "variant",
    });
    expect(effectiveRate(v, S1)).toEqual({
      rate: { kind: "percent", percent: 30 },
      source: "service",
    });
    expect(effectiveRate(v, S2)).toEqual({
      rate: { kind: "percent", percent: 10 },
      source: "default",
    });
    expect(effectiveRate(null, S2).source).toBe("none");
  });
});

describe("own rates table", () => {
  it("one row per service and rate, with everyone who has it", () => {
    const rows = groupOverrides(
      [
        {
          staffId: "a",
          current: version({
            overrides: [
              { serviceId: S2, variantId: null, kind: "percent", percent: 30, amount: null },
            ],
          }),
        },
        {
          staffId: "b",
          current: version({
            overrides: [
              { serviceId: S2, variantId: null, kind: "percent", percent: 30, amount: null },
              { serviceId: S1, variantId: null, kind: "fixed", percent: null, amount: 60_000 },
            ],
          }),
        },
        { staffId: "c", current: null },
      ],
      [S1, S2],
    );
    expect(rows.map((r) => [r.serviceId, r.rate, r.staffIds])).toEqual([
      [S1, { kind: "fixed", amount: 60_000 }, ["b"]],
      [S2, { kind: "percent", percent: 30 }, ["a", "b"]],
    ]);
  });
});

describe("effective date", () => {
  it("quick choices and the one-line preview", () => {
    expect(effectiveChoiceOf("2026-11-05", "2026-11-05")).toBe("today");
    expect(effectiveChoiceOf("2026-11-01", "2026-11-05")).toBe("monthStart");
    expect(effectiveChoiceOf("2026-12-01", "2026-11-05")).toBe("custom");
    expect(effectivePreview("2026-11-05", "2026-11-05")).toBe("today");
    expect(effectivePreview("2026-11-20", "2026-11-05")).toBe("future");
    expect(effectivePreview("2026-11-01", "2026-11-05")).toBe("backdated");
    expect(effectivePreview("2026-10-15", "2026-11-05")).toBe("earlierMonth");
  });
});

describe("validation and parsing", () => {
  const ok = {
    baseType: "monthly" as const,
    amount: 8_000_000,
    percent: 10,
    overrides: [],
    employerCost: { kind: "none" as const, percent: null, amount: null },
  };
  it("accepts a complete draft", () => {
    expect(validatePay(ok)).toEqual({});
  });
  it("names each missing field", () => {
    expect(
      validatePay({
        ...ok,
        amount: null,
        percent: null,
        overrides: [{ serviceId: S1, kind: "fixed", percent: null, amount: null }],
        employerCost: { kind: "percent", percent: null, amount: null },
      }),
    ).toEqual({
      amount: "amountRequired",
      percent: "percentRequired",
      "override:0": "overrideRequired",
      employer: "employerPercentRequired",
    });
    // No base pay: no amount needed.
    expect(validatePay({ ...ok, baseType: "none", amount: null })).toEqual({});
  });
  it("warns softly about a missing or extra zero", () => {
    expect(amountLooksOff("monthly", 800_000)).toBeNull();
    expect(amountLooksOff("monthly", 80_000)).toBe("low");
    expect(amountLooksOff("monthly", 800_000_000)).toBe("high");
    expect(amountLooksOff("hourly", 35_000)).toBeNull();
  });
  it("parses vi and en input", () => {
    expect(parsePercent("12,5")).toBe(12.5);
    expect(parsePercent("12.555")).toBe(12.56);
    expect(parsePercent("150")).toBe(100);
    expect(parsePercent("")).toBeNull();
    expect(parseMoney("8.000.000đ")).toBe(8_000_000);
    expect(parseMoney("8,000,000")).toBe(8_000_000);
    expect(parseMoney("")).toBeNull();
    expect(exampleCommission({ kind: "percent", percent: 12.5 }, 200_000)).toBe(25_000);
    expect(exampleCommission({ kind: "fixed", amount: 40_000 }, 200_000)).toBe(40_000);
  });
});

const row = (p: Partial<PayrollMonth["rows"][number]>): PayrollMonth["rows"][number] => ({
  staffId: "a",
  displayName: "A",
  removed: false,
  baseType: "monthly",
  base: 1000,
  employedDays: 30,
  workingDays: 26,
  workMinutes: 0,
  commission: 100,
  commissionLines: 1,
  projectedCommission: 50,
  bonus: 0,
  deduction: 0,
  advance: 0,
  total: 1100,
  gross: 1100,
  employerCost: 0,
  projectedEmployerCost: 0,
  employerCostSet: false,
  realCost: 1100,
  paidOn: null,
  ...p,
});
const month = (p: Partial<PayrollMonth>): PayrollMonth => ({
  month: "2026-11",
  phase: "current",
  status: "open",
  closedAt: null,
  reopenedAt: null,
  commissionBase: "price_after_discount",
  rows: [row({})],
  totals: {
    base: 1000,
    commission: 100,
    bonus: 0,
    deduction: 0,
    advance: 0,
    total: 1100,
    gross: 1100,
    employerCost: 0,
    realCost: 1100,
  },
  adjustments: [],
  ...p,
});

describe("month status and summary", () => {
  it("open / future / closed / paid", () => {
    expect(monthStatus(month({}))).toBe("open");
    expect(monthStatus(month({ phase: "future" }))).toBe("future");
    expect(monthStatus(month({ status: "closed" }))).toBe("closed");
    expect(
      monthStatus(
        month({ status: "closed", rows: [row({ paidOn: "2026-12-01" }), row({ total: 0 })] }),
      ),
    ).toBe("paid");
  });
  it("earned vs expected; nothing expected once closed", () => {
    expect(monthSummary(month({}))).toMatchObject({ earned: 1100, projected: 50, estimate: 1150 });
    expect(monthSummary(month({ status: "closed" })).projected).toBe(0);
  });
});

describe("commission lines", () => {
  const line = (state: "earned" | "projected", date: string, vi: string, amount: number) => ({
    lineId: `${date}-${vi}`,
    bookingId: "b",
    date,
    service: { vi, en: `${vi} (en)` },
    state,
    price: 100_000,
    base: 100_000,
    rate: null,
    amount,
  });
  const items = [
    line("earned", "2026-11-03", "Sơn gel", 15_000),
    line("projected", "2026-11-20", "Sơn gel", 15_000),
    line("earned", "2026-11-01", "Cắt tóc", 20_000),
    line("earned", "2026-11-02", "Sơn gel", 15_000),
  ];
  it("done first, by date", () => {
    const s = sortLines(items);
    expect(s.earned.map((l) => l.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(s.projected).toHaveLength(1);
  });
  it("my earnings: earned commission per service, biggest first", () => {
    expect(topServices(items, "vi")).toEqual([
      { name: "Sơn gel", count: 2, amount: 30_000 },
      { name: "Cắt tóc", count: 1, amount: 20_000 },
    ]);
    expect(topServices(items, "en")[0]?.name).toBe("Sơn gel (en)");
  });
});

describe("profit waterfall", () => {
  const b = {
    revenueEarned: 4_000,
    revenueEarnedRecorded: 0,
    revenueUpcoming: 6_000,
    noShowAllowance: 0,
    revenueTotal: 10_000,
    serviceCostsActual: 500,
    serviceCostsProjected: 500,
    serviceCosts: 1_000,
    basePay: 5_000,
    commissionEarned: 400,
    commissionProjected: 600,
    adjustments: 0,
    employerCosts: 1_000,
    payroll: 7_000,
    otherCosts: 4_000,
    grossProfit: 9_000,
    netProfit: -2_000,
    grossMargin: 0.9,
    netMargin: -0.2,
    monthProgress: 0.5,
  } satisfies Profit["breakdown"];
  it("revenue → costs → net, each split into done and expected; zero no-show dropped", () => {
    const steps = waterfall(b);
    expect(steps.map((s) => [s.id, s.amount, s.from, s.to])).toEqual([
      ["revenue", 10_000, 0, 10_000],
      ["serviceCosts", -1_000, 10_000, 9_000],
      ["payroll", -7_000, 9_000, 2_000],
      ["otherCosts", -4_000, 2_000, -2_000],
      ["net", -2_000, 0, -2_000],
    ]);
    expect(steps[0]).toMatchObject({ actual: 4_000, projected: 6_000 });
    expect(steps[2]).toMatchObject({ actual: 6_400, projected: 600 });
    expect(waterfallRange(steps)).toEqual({ min: -2_000, max: 10_000 });
  });
});
