import { describe, expect, it } from "vitest";
import {
  commissionAmount,
  commissionTotalsByStaff,
  computeCommissions,
  type CommissionLineInput,
  lineState,
  type PayVersion,
  priceAfterDiscount,
  rateFor,
  versionAt,
} from "./commission";
import { addMonths, daysInMonth, monthProgress, monthRange } from "./month";
import { basePayForMonth, payrollLine } from "./payroll";

const pay = (p: Partial<PayVersion> = {}): PayVersion => ({
  effectiveFrom: "2026-01-01",
  baseType: "none",
  baseAmount: 0,
  commissionBps: 1000,
  overrides: [],
  ...p,
});

let n = 0;
const line = (p: Partial<CommissionLineInput> = {}): CommissionLineInput => ({
  lineId: `l${String(++n)}`,
  bookingId: `b${String(n)}`,
  staffId: "linh",
  serviceId: "gel",
  variantId: null,
  date: "2026-11-10",
  status: "completed",
  price: 200_000,
  cost: null,
  recordedForBooking: null,
  ...p,
});

describe("months", () => {
  it("knows month lengths, ranges and arithmetic", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("measures progress through a month in salon-local dates", () => {
    expect(monthProgress("2026-11", "2026-11-03")).toEqual({
      elapsedDays: 3,
      daysInMonth: 30,
      phase: "current",
    });
    expect(monthProgress("2026-10", "2026-11-03").phase).toBe("past");
    expect(monthProgress("2026-12", "2026-11-03").elapsedDays).toBe(0);
  });
});

describe("commission rates", () => {
  const v = pay({
    commissionBps: 1000,
    overrides: [
      { serviceId: "gel", variantId: null, rate: { kind: "percent", bps: 1500 } },
      { serviceId: "gel", variantId: "feet", rate: { kind: "fixed", amount: 30_000 } },
    ],
  });
  it("prefers the variant override, then the service override, then the default", () => {
    expect(rateFor(v, "gel", "feet")).toEqual({ kind: "fixed", amount: 30_000 });
    expect(rateFor(v, "gel", "hands")).toEqual({ kind: "percent", bps: 1500 });
    expect(rateFor(v, "cut", null)).toEqual({ kind: "percent", bps: 1000 });
  });
  it("rounds percentages to whole đồng and pays fixed amounts per service", () => {
    expect(commissionAmount({ kind: "percent", bps: 1250 }, 99_999)).toBe(12_500);
    expect(commissionAmount({ kind: "fixed", amount: 30_000 }, 0)).toBe(30_000);
  });
  it("uses the version in force on the date", () => {
    const versions = [pay({ effectiveFrom: "2026-11-15", commissionBps: 2000 }), pay()];
    expect(versionAt(versions, "2026-11-14")?.commissionBps).toBe(1000);
    expect(versionAt(versions, "2026-11-15")?.commissionBps).toBe(2000);
    expect(versionAt(versions, "2025-12-31")).toBeNull();
  });
  it("maps booking statuses", () => {
    expect(lineState("completed")).toBe("earned");
    for (const s of ["pending", "confirmed", "checked_in"]) expect(lineState(s)).toBe("projected");
    for (const s of ["no_show", "cancelled_by_customer", "cancelled_by_salon"])
      expect(lineState(s)).toBe("none");
  });
});

describe("computeCommissions", () => {
  const staff = new Map([
    ["linh", [pay({ commissionBps: 1000 })]],
    ["mai", [pay({ commissionBps: 2000 })]],
  ]);

  it("splits a two-staff chain by line, never to the booking's first staff member", () => {
    const lines = [
      line({ lineId: "a", bookingId: "chain", staffId: "linh", price: 200_000 }),
      line({ lineId: "b", bookingId: "chain", staffId: "mai", price: 150_000 }),
    ];
    const totals = commissionTotalsByStaff(computeCommissions(lines, staff, []));
    expect(totals.get("linh")?.earned).toBe(20_000);
    expect(totals.get("mai")?.earned).toBe(30_000);
  });

  it("no-shows and cancellations earn nothing; upcoming lines are only projected", () => {
    const r = computeCommissions(
      [
        line({ status: "no_show" }),
        line({ status: "cancelled_by_salon" }),
        line({ status: "confirmed" }),
      ],
      staff,
      [],
    );
    expect(r.map((x) => [x.state, x.amount])).toEqual([
      ["none", 0],
      ["none", 0],
      ["projected", 20_000],
    ]);
    const t = commissionTotalsByStaff(r).get("linh");
    expect(t).toEqual({ earned: 0, projected: 20_000, earnedLines: 0, projectedLines: 1 });
  });

  it("uses the recorded amount as the price after discount, pro rata over lines", () => {
    const lines = [
      line({
        lineId: "a",
        bookingId: "x",
        staffId: "linh",
        price: 200_000,
        recordedForBooking: 280_000,
      }),
      line({
        lineId: "b",
        bookingId: "x",
        staffId: "mai",
        price: 200_000,
        recordedForBooking: 280_000,
      }),
    ];
    const r = computeCommissions(lines, staff, []);
    expect(r.map((x) => x.base)).toEqual([140_000, 140_000]);
    expect(r.map((x) => x.amount)).toEqual([14_000, 28_000]);
    // Recording more than the price (a tip) never raises the commission.
    const tip = computeCommissions(
      [line({ price: 200_000, recordedForBooking: 250_000 })],
      staff,
      [],
    );
    expect(tip[0]?.base).toBe(200_000);
  });

  it("price-minus-cost policy subtracts the execution cost, floored at 0", () => {
    const policy = [{ effectiveFrom: "2026-11-01", base: "price_minus_cost" as const }];
    const r = computeCommissions(
      [
        line({ price: 200_000, cost: 50_000 }),
        line({ price: 200_000, cost: 250_000 }),
        line({ price: 200_000, cost: null, date: "2026-10-31" }),
      ],
      staff,
      policy,
    );
    expect(r.map((x) => x.base)).toEqual([150_000, 0, 200_000]);
  });

  it("a staff member without pay settings earns nothing (and the line is still attributed)", () => {
    const r = computeCommissions([line({ staffId: "tuan" })], staff, []);
    expect(r[0]).toMatchObject({ staffId: "tuan", amount: 0, rate: null });
  });

  it("a rate change mid-month applies from its date only", () => {
    const m = new Map([
      [
        "linh",
        [pay({ commissionBps: 1000 }), pay({ effectiveFrom: "2026-11-15", commissionBps: 2000 })],
      ],
    ]);
    const r = computeCommissions(
      [line({ date: "2026-11-14" }), line({ date: "2026-11-15" })],
      m,
      [],
    );
    expect(r.map((x) => x.amount)).toEqual([20_000, 40_000]);
  });
});

describe("priceAfterDiscount", () => {
  it("adds up exactly to the recorded amount", () => {
    expect(priceAfterDiscount([100, 100, 100], 200)).toEqual([67, 67, 66]);
    expect(priceAfterDiscount([100, 0], 50)).toEqual([50, 0]);
    expect(priceAfterDiscount([100, 200], null)).toEqual([100, 200]);
  });
});

describe("base pay", () => {
  const work = (dates: string[], minutes = 480) => new Map(dates.map((d) => [d, minutes]));
  const novemberWeekdays = Array.from(
    { length: 30 },
    (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`,
  ).filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0);

  it("monthly: full month, or pro-rated for the days employed", () => {
    const full = basePayForMonth({
      versions: [pay({ baseType: "monthly", baseAmount: 9_000_000 })],
      month: "2026-11",
      employedUntil: null,
      workMinutesByDate: work(novemberWeekdays),
    });
    expect(full).toMatchObject({ amount: 9_000_000, employedDays: 30, workingDays: 25 });
    const joined = basePayForMonth({
      versions: [pay({ effectiveFrom: "2026-11-21", baseType: "monthly", baseAmount: 9_000_000 })],
      month: "2026-11",
      employedUntil: null,
      workMinutesByDate: work(novemberWeekdays),
    });
    expect(joined).toMatchObject({ amount: 3_000_000, employedDays: 10 });
    const left = basePayForMonth({
      versions: [pay({ baseType: "monthly", baseAmount: 9_000_000 })],
      month: "2026-11",
      employedUntil: "2026-11-15",
      workMinutesByDate: work(novemberWeekdays),
    });
    expect(left.amount).toBe(4_500_000);
  });

  it("daily: per scheduled working day; hourly: per scheduled hour", () => {
    const daily = basePayForMonth({
      versions: [pay({ baseType: "daily", baseAmount: 300_000 })],
      month: "2026-11",
      employedUntil: null,
      workMinutesByDate: work(novemberWeekdays),
    });
    expect(daily.amount).toBe(25 * 300_000);
    const hourly = basePayForMonth({
      versions: [pay({ baseType: "hourly", baseAmount: 40_000 })],
      month: "2026-11",
      employedUntil: null,
      workMinutesByDate: work(["2026-11-02", "2026-11-03"], 450),
    });
    expect(hourly.amount).toBe(600_000);
  });

  it("a salary raise mid-month is pro-rated per version", () => {
    const r = basePayForMonth({
      versions: [
        pay({ baseType: "monthly", baseAmount: 6_000_000 }),
        pay({ effectiveFrom: "2026-11-16", baseType: "monthly", baseAmount: 9_000_000 }),
      ],
      month: "2026-11",
      employedUntil: null,
      workMinutesByDate: new Map(),
    });
    expect(r.amount).toBe(3_000_000 + 4_500_000);
  });

  it("before the first pay setting nobody is employed", () => {
    const r = basePayForMonth({
      versions: [pay({ effectiveFrom: "2026-12-01", baseType: "monthly", baseAmount: 1 })],
      month: "2026-11",
      employedUntil: null,
      workMinutesByDate: new Map(),
    });
    expect(r).toMatchObject({ amount: 0, employedDays: 0, baseType: null });
  });
});

describe("payroll line", () => {
  it("base + commission + bonus − deduction − advance", () => {
    const l = payrollLine(8_000_000, 1_200_000, [
      { kind: "bonus", amount: 500_000 },
      { kind: "deduction", amount: 200_000 },
      { kind: "advance", amount: 2_000_000 },
    ]);
    expect(l.total).toBe(7_500_000);
    // An advance is pay handed over early: it lowers what is left, not the salon's cost.
    expect(l.cost).toBe(9_500_000);
  });
});
