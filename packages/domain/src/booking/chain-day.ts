import type { Candidate, OccupancyTerms, ServiceLine } from "./chain";
import { type Interval, subtract } from "./intervals";
import { type ResourceUnitAvailability, unitOrder } from "./resources";

/**
 * Per-day preparation for chain planning (security review M1, ADR-0013): line timing bounds,
 * unit free time, try orders, and the cheap "can this line be placed at all" pre-checks that let
 * the search skip whole days and starts. Pure — no I/O.
 */

const MINUTE = 60_000;

/** Everything about one day that every start's search shares. */
export interface ChainDay {
  /** Every unit any line may claim, with its busy time. */
  pool: readonly ResourceUnitAvailability[];
  lines: readonly ServiceLine[];
  /** Staff with free time that day, best "any staff" candidate first. */
  ranked: readonly Candidate[];
  /** Day bounds: unit free time is computed inside it. */
  day: Interval;
}

export interface Doer {
  c: Candidate;
  /** Index into `ranked`. */
  who: number;
  terms: OccupancyTerms;
}

export interface LineBounds {
  /** Earliest/latest line start relative to the chain start, in ms. */
  lo: number;
  hi: number;
  /** Shortest occupancy that always contains [start, start + duration + after], in ms. */
  minLength: number;
  /** Longest before-buffer of this line and every later one, in ms (claims horizon). */
  maxBeforeRest: number;
}

const termsOf = (line: ServiceLine) => [...line.staffTerms.values()];

/** Conservative timing bounds per line, whoever performs which line. */
function lineBounds(lines: readonly ServiceLine[]): LineBounds[] {
  const out: LineBounds[] = [];
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < lines.length; k++) {
    const t = termsOf(lines[k] as ServiceLine);
    if (k > 0) {
      const p = termsOf(lines[k - 1] as ServiceLine);
      lo += Math.min(...p.map((x) => x.durationMinutes)) * MINUTE;
      // Same staff: the gap is max(after, before); someone else starts right away.
      const gap = Math.max(
        ...p.map((x) => x.bufferAfterMinutes),
        ...t.map((x) => x.bufferBeforeMinutes),
      );
      hi += (Math.max(...p.map((x) => x.durationMinutes)) + gap) * MINUTE;
    }
    out.push({
      lo,
      hi,
      minLength: Math.min(...t.map((x) => x.durationMinutes + x.bufferAfterMinutes)) * MINUTE,
      maxBeforeRest: 0,
    });
  }
  let rest = 0;
  for (let k = lines.length - 1; k >= 0; k--) {
    const t = termsOf(lines[k] as ServiceLine);
    rest = Math.max(rest, ...t.map((x) => x.bufferBeforeMinutes * MINUTE));
    (out[k] as LineBounds).maxBeforeRest = rest;
  }
  return out;
}

/** Some interval of `free` holds `length` ms starting at a point in `[lo, hi]`. */
function fitsWindow(free: readonly Interval[], lo: number, hi: number, length: number): boolean {
  return free.some((f) => f.start <= hi && Math.max(f.start, lo) + length <= f.end);
}

/**
 * Pre-computed per day: line bounds, unit free time, and whether every line can be placed on its
 * own that day (else the day is skipped without searching).
 */
export interface ChainDayPlan extends ChainDay {
  bounds: LineBounds[];
  /**
   * Per line, the staff who perform it with their terms, in try order: `[0]` ranked order (first
   * line), `[who + 1]` with `ranked[who]` first (continuity after a line they did).
   */
  doers: Doer[][][];
  unitFree: Map<string, Interval[]>;
  /** False when some line has nobody or nothing free long enough that day. */
  feasible: boolean;
}

export function prepareChainDay(day: ChainDay): ChainDayPlan {
  const unitFree = new Map(day.pool.map((u) => [u.unitId, subtract([day.day], u.busy)] as const));
  const plan: ChainDayPlan = {
    ...day,
    pool: [...day.pool].sort(unitOrder),
    bounds: day.lines.length > 0 ? lineBounds(day.lines) : [],
    doers: day.lines.map((line) => {
      const all = day.ranked.flatMap((c, who) => {
        const terms = line.staffTerms.get(c.s.staffId);
        return terms ? [{ c, who, terms }] : [];
      });
      return [
        all,
        ...day.ranked.map((_, who) => {
          const same = all.find((d) => d.who === who);
          return same ? [same, ...all.filter((d) => d !== same)] : all;
        }),
      ];
    }),
    unitFree,
    feasible: true,
  };
  plan.feasible =
    day.lines.length > 0 &&
    day.lines.every((_, k) =>
      lineMayFit(plan, k, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
    );
  return plan;
}

/**
 * Necessary condition for line `k` to start somewhere in `[lo, hi]`: some staff member who does
 * it has a free stretch long enough, and every required resource type has enough units free that
 * long. Never rejects a placeable line (lengths and windows are lower/upper bounds).
 */
export function lineMayFit(plan: ChainDayPlan, k: number, lo: number, hi: number): boolean {
  const line = plan.lines[k] as ServiceLine;
  const staffOk = plan.ranked.some((c) => {
    const t = line.staffTerms.get(c.s.staffId);
    return (
      t !== undefined &&
      fitsWindow(c.free, lo, hi, (t.durationMinutes + t.bufferAfterMinutes) * MINUTE)
    );
  });
  if (!staffOk) return false;
  const length = (plan.bounds[k] as LineBounds).minLength;
  return (line.requirements ?? []).every(
    (r) =>
      plan.pool.filter(
        (u) =>
          u.resourceTypeId === r.resourceTypeId &&
          fitsWindow(plan.unitFree.get(u.unitId) ?? [], lo, hi, length),
      ).length >= r.quantity,
  );
}
