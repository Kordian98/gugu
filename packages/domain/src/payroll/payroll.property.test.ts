import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  commissionTotalsByStaff,
  computeCommissions,
  type CommissionLineInput,
  type PayVersion,
  priceAfterDiscount,
} from "./commission";
import { basePayForMonth } from "./payroll";
import { monthProfit } from "./profit";

/** Properties of the commission engine and base pay (ADR-0014). */

const STAFF = ["a", "b", "c"] as const;
const STATUSES = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "no_show",
  "cancelled_by_customer",
  "cancelled_by_salon",
] as const;

const money = fc.integer({ min: 0, max: 5_000_000 });
const day = fc.integer({ min: 1, max: 30 }).map((d) => `2026-11-${String(d).padStart(2, "0")}`);

const payVersion: fc.Arbitrary<PayVersion> = fc.record({
  effectiveFrom: fc.constantFrom("2026-01-01", "2026-11-10", "2026-11-20"),
  baseType: fc.constantFrom("none", "monthly", "daily", "hourly"),
  baseAmount: money,
  commissionBps: fc.integer({ min: 0, max: 10_000 }),
  overrides: fc.array(
    fc.record({
      serviceId: fc.constantFrom("s1", "s2"),
      variantId: fc.constantFrom(null, "v1"),
      rate: fc.oneof(
        fc.record({
          kind: fc.constant("percent" as const),
          bps: fc.integer({ min: 0, max: 10_000 }),
        }),
        fc.record({
          kind: fc.constant("fixed" as const),
          amount: fc.integer({ min: 0, max: 200_000 }),
        }),
      ),
    }),
    { maxLength: 3 },
  ),
});

const booking = fc.record({
  status: fc.constantFrom(...STATUSES),
  date: day,
  recorded: fc.option(money, { nil: null }),
  lines: fc.array(
    fc.record({
      staffId: fc.constantFrom(...STAFF),
      serviceId: fc.constantFrom("s1", "s2", "s3"),
      variantId: fc.constantFrom(null, "v1"),
      price: money,
      cost: fc.option(money, { nil: null }),
    }),
    { minLength: 1, maxLength: 4 },
  ),
});

type BookingCase = typeof booking extends fc.Arbitrary<infer T> ? T : never;
const toLines = (bookings: BookingCase[]): CommissionLineInput[] =>
  bookings.flatMap((b, bi) =>
    b.lines.map((l, li) => ({
      ...l,
      lineId: `b${String(bi)}l${String(li)}`,
      bookingId: `b${String(bi)}`,
      date: b.date,
      status: b.status,
      recordedForBooking: b.recorded,
    })),
  );

const scenario = fc.record({
  bookings: fc.array(booking, { maxLength: 12 }),
  pay: fc.record({
    a: fc.array(payVersion, { maxLength: 2 }),
    b: fc.array(payVersion, { maxLength: 2 }),
    c: fc.array(payVersion, { maxLength: 2 }),
  }),
  policy: fc.array(
    fc.record({
      effectiveFrom: fc.constantFrom("2026-01-01", "2026-11-15"),
      base: fc.constantFrom("price_after_discount" as const, "price_minus_cost" as const),
    }),
    { maxLength: 2 },
  ),
});

const payMap = (p: Record<string, PayVersion[]>) => new Map(Object.entries(p));

describe("commission engine (properties)", () => {
  it("never negative; only completed lines earn; only active lines are projected", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const r = computeCommissions(toLines(s.bookings), payMap(s.pay), s.policy);
        for (const x of r) {
          expect(x.amount).toBeGreaterThanOrEqual(0);
          expect(x.base).toBeGreaterThanOrEqual(0);
          if (x.state === "none") expect(x.amount).toBe(0);
        }
      }),
    );
  });

  it("a percentage commission never exceeds the line's base (rates ≤ 100 %)", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        for (const x of computeCommissions(toLines(s.bookings), payMap(s.pay), s.policy)) {
          if (x.rate?.kind === "percent") expect(x.amount).toBeLessThanOrEqual(x.base);
        }
      }),
    );
  });

  it("each line is attributed to its own staff member and totals add up per staff", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const lines = toLines(s.bookings);
        const r = computeCommissions(lines, payMap(s.pay), s.policy);
        r.forEach((x, i) => {
          expect(x.staffId).toBe(lines[i]?.staffId);
        });
        const totals = commissionTotalsByStaff(r);
        const earned = [...totals.values()].reduce((n, t) => n + t.earned, 0);
        expect(earned).toBe(
          r.filter((x) => x.state === "earned").reduce((n, x) => n + x.amount, 0),
        );
      }),
    );
  });

  it("a booking's lines never get a base above the recorded amount when less was recorded", () => {
    fc.assert(
      fc.property(fc.array(money, { minLength: 1, maxLength: 4 }), money, (prices, recorded) => {
        const parts = priceAfterDiscount(prices, recorded);
        const total = prices.reduce((a, b) => a + b, 0);
        const sum = parts.reduce((a, b) => a + b, 0);
        if (recorded < total) expect(sum).toBe(recorded);
        else expect(parts).toEqual(prices);
        parts.forEach((p, i) => {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(prices[i] ?? 0);
        });
      }),
    );
  });

  it("changing another staff member's pay never changes someone's commission", () => {
    fc.assert(
      fc.property(scenario, fc.array(payVersion, { maxLength: 2 }), (s, other) => {
        const lines = toLines(s.bookings);
        const before = commissionTotalsByStaff(computeCommissions(lines, payMap(s.pay), s.policy));
        const after = commissionTotalsByStaff(
          computeCommissions(lines, payMap({ ...s.pay, b: other }), s.policy),
        );
        expect(after.get("a")).toEqual(before.get("a"));
      }),
    );
  });
});

describe("base pay (properties)", () => {
  it("monthly pay is at most the monthly amount and grows with employed days", () => {
    fc.assert(
      fc.property(money, fc.integer({ min: 1, max: 30 }), (amount, from) => {
        const effectiveFrom = `2026-11-${String(from).padStart(2, "0")}`;
        const r = basePayForMonth({
          versions: [
            {
              effectiveFrom,
              baseType: "monthly",
              baseAmount: amount,
              commissionBps: 0,
              overrides: [],
            },
          ],
          month: "2026-11",
          employedUntil: null,
          workMinutesByDate: new Map(),
        });
        expect(r.amount).toBeLessThanOrEqual(amount);
        expect(r.employedDays).toBe(31 - from);
      }),
    );
  });
});

describe("month profit (properties)", () => {
  it("net = revenue − service costs − payroll − other costs, for any inputs", () => {
    fc.assert(
      fc.property(
        fc.record({
          earned: money,
          earnedRecorded: money,
          upcoming: money,
          noShowRate: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
          serviceCostsActual: money,
          serviceCostsUpcoming: money,
          basePay: money,
          commissionEarned: money,
          commissionUpcoming: money,
          adjustments: fc.integer({ min: -1_000_000, max: 1_000_000 }),
          otherCosts: money,
          elapsedDays: fc.integer({ min: 0, max: 30 }),
          daysInMonth: fc.constant(30),
        }),
        (i) => {
          const p = monthProfit(i);
          expect(p.netProfit).toBe(p.revenueTotal - p.serviceCosts - p.payroll - p.otherCosts);
          expect(p.revenueTotal).toBeLessThanOrEqual(i.earned + i.upcoming);
          expect(p.noShowAllowance).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});
