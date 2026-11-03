import { describe, expect, it } from "vitest";
import { computeSlots, MAX_AVAILABILITY_DAYS, MAX_CHAIN_EARLIEST_DAYS } from "./availability";
import { CHAIN_STEPS_PER_REQUEST, CHAIN_STEPS_PER_START, searchBudget } from "./chain-search";
import { PERF_CASES, perfFeasible } from "./chain-perf.fixture";
import { addDays } from "./tz";

/**
 * CPU bound for chain planning (security review M1): 15 staff, 4 lines, line 4 impossible. Before
 * the budget one 31-day window took 3–14 s and the earliest-slot scan (12 windows over a 365-day
 * booking window) up to ~160 s on the event loop; now it stays well under the limits below.
 */

/**
 * Wall-clock limits hold under `pnpm verify` load (lint/typecheck in parallel: ~5–7× slower than
 * alone, where a window takes ≤ 0.2 s). The deterministic guard is the step budget below; these
 * catch a regression to unbounded search (13.6 s per window alone).
 */
const WINDOW_MS = 2_500;
const EARLIEST_MS = 3_000;

function timed<T>(fn: () => T): { value: T; ms: number } {
  const t0 = Date.now();
  const value = fn();
  return { value, ms: Date.now() - t0 };
}

describe("chain planning stays within a strict time budget", () => {
  for (const [name, mk] of Object.entries(PERF_CASES)) {
    it(`${name}: one 31-day window`, () => {
      const input = mk();
      const budget = searchBudget();
      const { value, ms } = timed(() =>
        computeSlots({ ...input, to: addDays(input.from, 30) }, budget),
      );
      expect(value).toEqual([]);
      expect(budget.remaining).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThan(WINDOW_MS);
    });

    it(`${name}: the chain earliest-slot scan, windows sharing one budget`, () => {
      const input = mk();
      const budget = searchBudget();
      const { ms } = timed(() => {
        for (let d = 0; d < MAX_CHAIN_EARLIEST_DAYS; d += MAX_AVAILABILITY_DAYS) {
          const from = addDays(input.from, d);
          computeSlots({ ...input, from, to: addDays(from, MAX_AVAILABILITY_DAYS - 1) }, budget);
        }
      });
      expect(ms).toBeLessThan(EARLIEST_MS);
    });
  }

  it("an impossible 4-line chain with 15 staff needs ~3·15² steps per start, not 15⁴", () => {
    const input = PERF_CASES["line 4 collides with line 3"]();
    const budget = searchBudget();
    const slots = computeSlots(input, budget); // one day, 5-minute grid
    expect(slots).toEqual([]);
    expect(budget.truncated).toBe(false);
    const starts = (12 * 60) / 5;
    const spent = CHAIN_STEPS_PER_REQUEST - budget.remaining;
    expect(spent / starts).toBeLessThan(3 * 15 * 15);
    expect(spent / starts).toBeLessThan(CHAIN_STEPS_PER_START);
  });

  it("a feasible 4-line chain over 31 days is complete and fast", () => {
    const input = perfFeasible();
    const budget = searchBudget();
    const { value, ms } = timed(() =>
      computeSlots({ ...input, to: addDays(input.from, 30) }, budget),
    );
    expect(budget.truncated).toBe(false);
    expect(value.length).toBe(31 * 121); // 08:00–18:00 starts on a 5-minute grid
    expect(ms).toBeLessThan(WINDOW_MS);
  });
});
