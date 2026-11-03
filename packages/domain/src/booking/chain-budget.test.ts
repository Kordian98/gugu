import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  chainLines,
  computeSlots,
  findSlot,
  type Slot,
  type StaffAvailability,
  type WeeklyHours,
} from "./availability";
import { lineTiming, type LinePlan, type ServiceLine, type SlotOption, toOption } from "./chain";
import { CHAIN_STEPS_PER_REQUEST, searchBudget } from "./chain-search";
import { PERF_CASES, perfFeasible } from "./chain-perf.fixture";
import { covers, type Interval, overlapLength, overlaps, subtract } from "./intervals";
import { pickUnits, type ResourceUnitAvailability } from "./resources";
import { GOLDEN_CASES } from "./single-service-golden.fixture";
import { instantsAt } from "./tz";

/**
 * Chain search budget, memo and pre-checks (security review M1, ADR-0013): same answers as the
 * plain backtracking search, bounded work, and a truncation flag when the budget runs out.
 */

const HCM = "Asia/Ho_Chi_Minh";
const M = 60_000;
const NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
const NINE = instantsAt("2026-11-03", 9 * 60, HCM)[0] as number;
const STAFF = ["a", "b", "c", "d"];
const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

/**
 * Reference: the unbounded backtracking search as merged in M6.8 (14bf9b3), on the free time the
 * engine computes. The optimised search must return exactly what this returns.
 */
function referencePlan(
  pool: readonly ResourceUnitAvailability[],
  lines: readonly ServiceLine[],
  ranked: readonly { staffId: string; free: Interval[] }[],
  index: number,
  chainStart: number,
  prev: { staffId: string; end: number; bufferAfterMinutes: number } | null,
  claims: { staff: { id: string; occ: Interval }[]; units: { id: string; occ: Interval }[] },
  only: string | null,
): LinePlan[] | null {
  const line = lines[index];
  if (!line) return [];
  const order = prev
    ? [
        ...ranked.filter((c) => c.staffId === prev.staffId),
        ...ranked.filter((c) => c.staffId !== prev.staffId),
      ]
    : ranked;
  for (const c of order) {
    if (only !== null && c.staffId !== only) continue;
    const terms = line.staffTerms.get(c.staffId);
    if (!terms) continue;
    const timing = lineTiming(prev, c.staffId, terms, chainStart);
    if (!covers(c.free, timing.occupancy)) continue;
    if (claims.staff.some((x) => x.id === c.staffId && overlaps(x.occ, timing.occupancy))) continue;
    const units = pool.map((u) => ({
      ...u,
      busy: [...u.busy, ...claims.units.filter((x) => x.id === u.unitId).map((x) => x.occ)],
    }));
    const unitIds = pickUnits({ requirements: line.requirements ?? [], units }, timing.occupancy);
    if (!unitIds) continue;
    const plan: LinePlan = { staffId: c.staffId, ...timing, unitIds };
    if (index === lines.length - 1) return [plan];
    const rest = referencePlan(
      pool,
      lines,
      ranked,
      index + 1,
      chainStart,
      { staffId: c.staffId, end: timing.end, bufferAfterMinutes: terms.bufferAfterMinutes },
      {
        staff: [...claims.staff, { id: c.staffId, occ: timing.occupancy }],
        units: [...claims.units, ...unitIds.map((id) => ({ id, occ: timing.occupancy }))],
      },
      null,
    );
    if (rest) return [plan, ...rest];
  }
  return null;
}

/**
 * Reference slots for the fixtures below: all staff share hours 09–18, sort order = list order,
 * no time off or breaks, so "any staff" ranking is by load (busy minutes), then order.
 */
function referenceSlots(input: AvailabilityInput): Slot[] {
  const lines = chainLines(input);
  const day = { start: NINE - 9 * 60 * M, end: NINE + 15 * 60 * M };
  const open = { start: NINE, end: NINE + 9 * 60 * M };
  const eligible = new Set(lines.flatMap((l) => [...l.staffTerms.keys()]));
  const ranked = input.staff
    .filter((s) => eligible.has(s.staffId))
    .map((s) => ({ s, load: overlapLength(s.busy, day), free: subtract([open], s.busy) }))
    .filter((x) => x.free.length > 0)
    .sort((a, b) => a.load - b.load || a.s.sortOrder - b.s.sortOrder)
    .map((x) => ({ staffId: x.s.staffId, free: x.free }));
  const first = ranked.filter((c) => lines[0]?.staffTerms.has(c.staffId));
  const slots: Slot[] = [];
  for (let start = NINE; start < open.end; start += 15 * M) {
    const options: SlotOption[] = [];
    for (const c of first) {
      const plan = referencePlan(
        input.resources?.units ?? [],
        lines,
        ranked,
        0,
        start,
        null,
        { staff: [], units: [] },
        c.staffId,
      );
      if (plan) options.push(toOption(plan));
    }
    if (options.length > 0) slots.push({ start, options });
  }
  return slots;
}

const staff = (id: string, k: number, busy: Interval[]): StaffAvailability => ({
  staffId: id,
  sortOrder: k,
  schedules: allWeek(9, 18).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy,
});

describe("chain search: same answers as plain backtracking", () => {
  const arbLine = fc.record({
    who: fc.subarray(STAFF, { minLength: 1 }),
    terms: fc.record({
      durationMinutes: fc.constantFrom(15, 30, 45, 60),
      // Long buffers keep earlier claims relevant to later lines (memo key horizon).
      bufferBeforeMinutes: fc.constantFrom(0, 5, 10, 45),
      bufferAfterMinutes: fc.constantFrom(0, 5, 15, 60),
    }),
    needsChair: fc.boolean(),
  });
  const arbBusy = fc.array(
    fc.tuple(
      fc.constantFrom(...STAFF, "u0", "u1"),
      fc.integer({ min: 0, max: 35 }),
      fc.integer({ min: 1, max: 8 }),
    ),
    { maxLength: 8 },
  );

  it("identical slots, options and line plans for random chains of 1–4 lines", () => {
    fc.assert(
      fc.property(
        fc.array(arbLine, { minLength: 1, maxLength: 4 }),
        arbBusy,
        fc.integer({ min: 1, max: 2 }),
        (rawLines, rawBusy, chairs) => {
          const busy = (id: string) =>
            rawBusy
              .filter(([t]) => t === id)
              .map(([, q, len]) => ({ start: NINE + q * 15 * M, end: NINE + (q + len) * 15 * M }));
          const input: AvailabilityInput = {
            timeZone: HCM,
            now: NOW,
            from: "2026-11-03",
            to: "2026-11-03",
            rules: { slotGranularityMinutes: 15, minLeadMinutes: 0, bookingWindowDays: 60 },
            openingHours: allWeek(9, 18),
            holidays: [],
            staff: STAFF.map((id, k) => staff(id, k, busy(id))),
            resources: {
              requirements: [],
              units: Array.from({ length: chairs }, (_, k) => ({
                unitId: `u${String(k)}`,
                resourceTypeId: "chair",
                sortOrder: k,
                busy: busy(`u${String(k)}`),
              })),
            },
            lines: rawLines.map((l) => ({
              staffTerms: new Map(l.who.map((w) => [w, l.terms] as const)),
              requirements: l.needsChair ? [{ resourceTypeId: "chair", quantity: 1 }] : [],
            })),
          };
          const budget = searchBudget();
          expect(computeSlots(input, budget)).toEqual(referenceSlots(input));
          expect(budget.truncated).toBe(false);
        },
      ),
      { numRuns: 300, seed: 1106 },
    );
  });
});

describe("chain search budget", () => {
  it("a single service never spends budget: same slots with an empty budget", () => {
    for (const mk of Object.values(GOLDEN_CASES)) {
      const input = mk();
      const budget = searchBudget(0);
      expect(computeSlots(input, budget)).toEqual(computeSlots(input));
      expect(budget.truncated).toBe(false);
    }
  });

  it("a day where some line cannot be placed on its own costs nothing", () => {
    const budget = searchBudget();
    expect(computeSlots(PERF_CASES["line 4 has no resource"](), budget)).toEqual([]);
    expect(budget).toEqual({ remaining: CHAIN_STEPS_PER_REQUEST, truncated: false });
  });

  it("starts the later lines can never reach are skipped before searching", () => {
    const budget = searchBudget();
    expect(computeSlots(PERF_CASES["line 4 staff gone by then"](), budget)).toEqual([]);
    expect(budget).toEqual({ remaining: CHAIN_STEPS_PER_REQUEST, truncated: false });
  });

  it("out of budget: returns what was found so far and marks the result truncated", () => {
    // Feasible 4-line chain: ~45 steps per start. 2,000 steps cover only part of the day.
    const feasible = perfFeasible();
    const full = computeSlots(feasible);
    const budget = searchBudget(2_000);
    const partial = computeSlots(feasible, budget);
    expect(budget.truncated).toBe(true);
    expect(budget.remaining).toBe(0);
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(full.length);
    // What was returned is a prefix of the full answer (the last start may have fewer options).
    partial.slice(0, -1).forEach((s, i) => {
      expect(s).toEqual(full[i]);
    });
    const last = partial.at(-1) as Slot;
    expect(full[partial.length - 1]?.options.slice(0, last.options.length)).toEqual(last.options);
    // The same budget, already spent, finds nothing more for chains.
    expect(computeSlots(feasible, budget)).toEqual([]);
  });

  it("an impossible chain stops at the per-start and per-request budget", () => {
    const budget = searchBudget();
    const input = PERF_CASES["line 4 collides with line 3"]();
    expect(computeSlots({ ...input, to: "2026-12-03" }, budget)).toEqual([]);
    expect(budget.truncated).toBe(true);
    expect(budget.remaining).toBe(0);
  });

  it("every offered start revalidates on the write path, even when the read was truncated", () => {
    const feasible = perfFeasible();
    const budget = searchBudget(5_000);
    const offered = computeSlots(feasible, budget);
    expect(budget.truncated).toBe(true);
    for (const slot of offered) {
      for (const o of slot.options) {
        expect(findSlot(feasible, slot.start, o.staffId)?.options[0]).toEqual(o);
      }
    }
  });
});
