import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  computeSlots,
  findSlot,
  type StaffAvailability,
  type WeeklyHours,
} from "./availability";
import type { ServiceLine, SlotOption } from "./chain";
import { type Interval, overlaps } from "./intervals";
import { instantsAt } from "./tz";

/** Property: multi-service chains (M6.8) never double-book a staff member or a unit. */

const HCM = "Asia/Ho_Chi_Minh";
const M = 60_000;
const NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
const NINE = instantsAt("2026-11-03", 9 * 60, HCM)[0] as number;
const STAFF = ["a", "b", "c"];
const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

interface Claim {
  target: string;
  occ: Interval;
}

const staff = (id: string, busy: Interval[]): StaffAvailability => ({
  staffId: id,
  sortOrder: 0,
  schedules: allWeek(9, 18).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy,
});

const claimsOf = (o: SlotOption): Claim[] =>
  o.lines.flatMap((l) => [
    { target: l.staffId, occ: l.occupancy },
    ...l.unitIds.map((u) => ({ target: u, occ: l.occupancy })),
  ]);

const busyOf = (claims: readonly Claim[], target: string) =>
  claims.filter((c) => c.target === target).map((c) => c.occ);

function expectNoOverlap(claims: readonly Claim[], against: readonly Claim[] = []): void {
  claims.forEach((p, x) => {
    for (const q of [...claims.slice(x + 1), ...against]) {
      if (p.target === q.target) expect(overlaps(p.occ, q.occ)).toBe(false);
    }
  });
}

function expectConsistent(o: SlotOption, lines: readonly ServiceLine[], taken: Claim[]): void {
  expect(o.lines).toHaveLength(lines.length);
  o.lines.forEach((l, i) => {
    expect(lines[i]?.staffTerms.has(l.staffId)).toBe(true);
    if (i > 0) expect(l.start).toBeGreaterThanOrEqual(o.lines[i - 1]?.end ?? 0);
  });
  expectNoOverlap(claimsOf(o), taken);
}

describe("property: chains never double-book", () => {
  const arbLine = fc.record({
    who: fc.subarray(STAFF, { minLength: 1 }),
    terms: fc.record({
      durationMinutes: fc.constantFrom(15, 30, 45, 60),
      bufferBeforeMinutes: fc.constantFrom(0, 5, 10),
      bufferAfterMinutes: fc.constantFrom(0, 5, 15),
    }),
    needsChair: fc.boolean(),
  });
  const arbBusy = fc.array(
    fc.tuple(
      fc.constantFrom(...STAFF),
      fc.integer({ min: 0, max: 35 }),
      fc.integer({ min: 1, max: 6 }),
    ),
    { maxLength: 5 },
  );

  it("offered chains are free and consistent; booking them one by one never overlaps", () => {
    fc.assert(
      fc.property(
        fc.array(arbLine, { minLength: 1, maxLength: 3 }),
        arbBusy,
        fc.integer({ min: 1, max: 2 }),
        (rawLines, rawBusy, chairs) => {
          const seeded: Claim[] = rawBusy.map(([id, q, len]) => ({
            target: id,
            occ: { start: NINE + q * 15 * M, end: NINE + (q + len) * 15 * M },
          }));
          const lines: ServiceLine[] = rawLines.map((l) => ({
            staffTerms: new Map(l.who.map((w) => [w, l.terms] as const)),
            requirements: l.needsChair ? [{ resourceTypeId: "chair", quantity: 1 }] : [],
          }));
          const booked: Claim[] = [];
          const build = (): AvailabilityInput => {
            const taken = [...seeded, ...booked];
            return {
              timeZone: HCM,
              now: NOW,
              from: "2026-11-03",
              to: "2026-11-03",
              rules: { slotGranularityMinutes: 15, minLeadMinutes: 0, bookingWindowDays: 60 },
              openingHours: allWeek(9, 18),
              holidays: [],
              staff: STAFF.map((id) => staff(id, busyOf(taken, id))),
              resources: {
                requirements: [],
                units: Array.from({ length: chairs }, (_, k) => ({
                  unitId: `u${String(k)}`,
                  resourceTypeId: "chair",
                  sortOrder: k,
                  busy: busyOf(taken, `u${String(k)}`),
                })),
              },
              lines,
            };
          };
          for (const slot of computeSlots(build())) {
            for (const o of slot.options) expectConsistent(o, lines, seeded);
          }
          // Book offered chains one by one, recomputing each time (like the write path).
          for (let n = 0; n < 6; n++) {
            const option = computeSlots(build())[n * 3]?.options[0];
            if (!option) break;
            expect(findSlot(build(), option.start, option.staffId)?.options[0]).toEqual(option);
            booked.push(...claimsOf(option));
          }
          expectNoOverlap(booked, seeded);
        },
      ),
      { numRuns: 150, seed: 68 },
    );
  });
});
