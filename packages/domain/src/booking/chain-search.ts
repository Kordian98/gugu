import { covers, type Interval, overlaps } from "./intervals";
import {
  type Candidate,
  type LinePlan,
  lineTiming,
  type ServiceLine,
  type SlotOption,
  toOption,
} from "./chain";
import { type ChainDayPlan, type Doer, type LineBounds, lineMayFit } from "./chain-day";
import type { ResourceUnitAvailability } from "./resources";

const MINUTE = 60_000;

/**
 * Search budget for chain planning (security review M1, ADR-0013). Backtracking over every
 * staff member on every line is exponential in the number of lines, so each start gets at most
 * CHAIN_STEPS_PER_START steps and the whole request (every start, day and window it scans)
 * shares `remaining`. A step is one candidate staff member tried for a line after the first —
 * a single service never spends any, so its results cannot change. When a budget runs out the
 * start (or the rest of the request) is skipped and `truncated` is set: callers return what was
 * found and say the list may be incomplete. Deterministic (counts steps, not time), so the write
 * path's revalidation of one start finds exactly what availability offered.
 */
export interface SearchBudget {
  /** Steps left for the whole request. */
  remaining: number;
  /** A start or the request ran out of steps: some bookable starts may be missing. */
  truncated: boolean;
}

/**
 * Steps one start may spend: a feasible 4-line chain with 15 staff needs ~50, proving that no
 * chain fits with N staff needs about 3·N² (memoized), so this covers ~40 staff exhaustively.
 */
export const CHAIN_STEPS_PER_START = 5_000;
/**
 * Steps one request may spend across all starts, days and windows (≈ 150 ms of CPU worst case;
 * a feasible 4-line chain with 15 staff over 31 days at a 5-minute grid uses ~170k).
 */
export const CHAIN_STEPS_PER_REQUEST = 1_000_000;

export function searchBudget(steps = CHAIN_STEPS_PER_REQUEST): SearchBudget {
  return { remaining: steps, truncated: false };
}

/** Claims made by earlier lines of the chain being planned (immutable list, newest first). */
interface Claim {
  /** Index into `ChainDayPlan.ranked` (staff) or the sorted pool (units). */
  id: number;
  occupancy: Interval;
  next: Claim | null;
}

function claimed(list: Claim | null, id: number, occupancy: Interval): boolean {
  for (let c = list; c; c = c.next)
    if (c.id === id && overlaps(c.occupancy, occupancy)) return true;
  return false;
}

/**
 * Units for one line (indexes into the sorted pool); units taken by earlier lines of the chain
 * count as busy. Same picks as `pickUnits`: per requirement, the first `quantity` free units in
 * sort order.
 */
function unitsForLine(
  sortedPool: readonly ResourceUnitAvailability[],
  line: ServiceLine,
  claims: Claim | null,
  occupancy: Interval,
): number[] | null {
  const requirements = line.requirements ?? [];
  if (requirements.length === 0) return [];
  const chosen: number[] = [];
  for (const req of requirements) {
    let n = 0;
    for (let i = 0; i < sortedPool.length && n < req.quantity; i++) {
      const u = sortedPool[i] as ResourceUnitAvailability;
      if (u.resourceTypeId !== req.resourceTypeId) continue;
      if (u.busy.some((b) => overlaps(b, occupancy)) || claimed(claims, i, occupancy)) continue;
      chosen.push(i);
      n++;
    }
    if (n < req.quantity) return null;
  }
  return chosen;
}

/** Per-start search state: memo of sub-plans and the start's own step allowance. */
interface Search {
  plan: ChainDayPlan;
  chainStart: number;
  budget: SearchBudget;
  stepsLeft: number;
  exhausted: boolean;
  memo: Map<number, MemoEntry[]>;
}

interface MemoEntry {
  /** Relevant claims, flattened `[kind, id, start, end]` quads in canonical order. */
  sig: number[];
  result: LinePlan[] | null;
}

/** Inserts quad `[kind, id, start, end]` into `out` keeping quads in ascending order. */
function insertQuad(out: number[], kind: number, id: number, start: number, end: number) {
  let at = out.length;
  while (at > 0) {
    const k = out[at - 4] as number;
    const i = out[at - 3] as number;
    const st = out[at - 2] as number;
    const en = out[at - 1] as number;
    const greater =
      k > kind ||
      (k === kind && (i > id || (i === id && (st > start || (st === start && en > end)))));
    if (!greater) break;
    at -= 4;
  }
  out.splice(at, 0, kind, id, start, end);
}

/** Claims that end after `horizon` (the only ones a later line can overlap), canonical order. */
function relevantClaims(staff: Claim | null, units: Claim | null, horizon: number): number[] {
  const out: number[] = [];
  for (let c = staff; c; c = c.next) {
    if (c.occupancy.end > horizon) insertQuad(out, 0, c.id, c.occupancy.start, c.occupancy.end);
  }
  for (let c = units; c; c = c.next) {
    if (c.occupancy.end > horizon) insertQuad(out, 1, c.id, c.occupancy.start, c.occupancy.end);
  }
  return out;
}

function sameSig(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Numeric memo bucket for (line, previous staff, previous end, previous after-buffer), or null
 * when a value is out of range for the packing (then that state is not memoized).
 */
function bucketOf(index: number, prev: Prev, chainStart: number): number | null {
  const endMinute = (prev.end - chainStart) / MINUTE;
  if (
    !Number.isInteger(endMinute) ||
    endMinute < 0 ||
    endMinute >= 2 ** 13 ||
    prev.who >= 2 ** 20 ||
    !Number.isInteger(prev.bufferAfterMinutes) ||
    prev.bufferAfterMinutes < 0 ||
    prev.bufferAfterMinutes >= 2 ** 12
  ) {
    return null;
  }
  // index < 8 (MAX_SERVICE_LINES) → 3 + 20 + 13 + 12 = 48 bits, exact in a double.
  return ((index * 2 ** 20 + prev.who) * 2 ** 13 + endMinute) * 2 ** 12 + prev.bufferAfterMinutes;
}

function spend(search: Search): boolean {
  if (search.stepsLeft <= 0 || search.budget.remaining <= 0) {
    search.exhausted = true;
    search.budget.truncated = true;
    return false;
  }
  search.stepsLeft--;
  search.budget.remaining--;
  return true;
}

interface Prev {
  /** Index into `ChainDayPlan.ranked`. */
  who: number;
  end: number;
  bufferAfterMinutes: number;
}

/**
 * Plans lines `index…` after `prev`. The result depends only on `prev` and the claims that can
 * still overlap a later line — every later occupancy starts at or after
 * `prev.end − (longest remaining before-buffer)` — so sub-results are memoized on exactly that.
 */
/** Memo slot for a state: a recorded result, or where to record it once explored. */
type MemoSlot = { hit: LinePlan[] | null } | { bucket: MemoEntry[]; sig: number[] } | null;

function memoSlot(
  search: Search,
  index: number,
  prev: Prev,
  staffClaims: Claim | null,
  unitClaims: Claim | null,
): MemoSlot {
  const id = bucketOf(index, prev, search.chainStart);
  if (id === null) return null;
  const horizon = prev.end - (search.plan.bounds[index] as LineBounds).maxBeforeRest;
  const sig = relevantClaims(staffClaims, unitClaims, horizon);
  const bucket = search.memo.get(id) ?? [];
  const hit = bucket.find((e) => sameSig(e.sig, sig));
  if (hit) return { hit: hit.result };
  search.memo.set(id, bucket);
  return { bucket, sig };
}

function planFrom(
  search: Search,
  index: number,
  prev: Prev | null,
  staffClaims: Claim | null,
  unitClaims: Claim | null,
  onlyStaffId: string | null,
): LinePlan[] | null {
  if (!search.plan.lines[index]) return [];
  const slot = prev ? memoSlot(search, index, prev, staffClaims, unitClaims) : null;
  if (slot && "hit" in slot) return slot.hit;
  // Continuity first: the previous line's staff member, if they can do this one too.
  const doers = (search.plan.doers[index] as Doer[][])[prev ? prev.who + 1 : 0] as readonly Doer[];
  let result: LinePlan[] | null = null;
  for (const doer of doers) {
    if (onlyStaffId !== null && doer.c.s.staffId !== onlyStaffId) continue;
    // Lines after the first spend budget; a single service never does.
    if (prev && !spend(search)) return null;
    result = tryDoer(search, index, prev, staffClaims, unitClaims, doer);
    if (search.exhausted) return null;
    if (result) break;
  }
  // Recorded only once the state is fully explored (never after running out of steps).
  if (slot) slot.bucket.push({ sig: slot.sig, result });
  return result;
}

/** Line `index` done by `doer`, then the rest of the chain; null when that cannot work. */
function tryDoer(
  search: Search,
  index: number,
  prev: Prev | null,
  staffClaims: Claim | null,
  unitClaims: Claim | null,
  { c, who, terms }: Doer,
): LinePlan[] | null {
  const { plan, chainStart } = search;
  const line = plan.lines[index] as ServiceLine;
  const staffId = c.s.staffId;
  const prevLine = prev
    ? {
        staffId: (plan.ranked[prev.who] as Candidate).s.staffId,
        end: prev.end,
        bufferAfterMinutes: prev.bufferAfterMinutes,
      }
    : null;
  const timing = lineTiming(prevLine, staffId, terms, chainStart);
  if (!covers(c.free, timing.occupancy) || claimed(staffClaims, who, timing.occupancy)) return null;
  const units = unitsForLine(plan.pool, line, unitClaims, timing.occupancy);
  if (!units) return null;
  const here = (): LinePlan => ({
    staffId,
    ...timing,
    unitIds: units.map((i) => (plan.pool[i] as ResourceUnitAvailability).unitId),
  });
  if (index === plan.lines.length - 1) return [here()];
  let nextUnits = unitClaims;
  for (const id of units) nextUnits = { id, occupancy: timing.occupancy, next: nextUnits };
  const rest = planFrom(
    search,
    index + 1,
    { who, end: timing.end, bufferAfterMinutes: terms.bufferAfterMinutes },
    { id: who, occupancy: timing.occupancy, next: staffClaims },
    nextUnits,
    null,
  );
  return rest ? [here(), ...rest] : null;
}

/**
 * One option per first-line staff member (in `firstStaff` order) who can start the whole chain
 * at `chainStart`. Lines after the first are pre-checked against their possible start window and
 * the search spends from `budget`; when it runs out, the options found so far are returned and
 * `budget.truncated` is set.
 */
export function planStart(
  plan: ChainDayPlan,
  chainStart: number,
  firstStaff: readonly Candidate[],
  budget: SearchBudget,
): SlotOption[] {
  if (!plan.feasible) return [];
  for (let k = 1; k < plan.lines.length; k++) {
    const b = plan.bounds[k] as LineBounds;
    if (!lineMayFit(plan, k, chainStart + b.lo, chainStart + b.hi)) return [];
  }
  if (plan.lines.length > 1 && budget.remaining <= 0) {
    budget.truncated = true;
    return [];
  }
  const search: Search = {
    plan,
    chainStart,
    budget,
    stepsLeft: CHAIN_STEPS_PER_START,
    exhausted: false,
    memo: new Map(),
  };
  const options: SlotOption[] = [];
  for (const c of firstStaff) {
    const lines = planFrom(search, 0, null, null, null, c.s.staffId);
    // Out of steps: keep the options found so far (the write path stops at the same point).
    if (search.exhausted) break;
    if (lines) options.push(toOption(lines));
  }
  return options;
}
