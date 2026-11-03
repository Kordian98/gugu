import { covers, type Interval, overlaps } from "./intervals";
import { pickUnits, type ResourceRequirement, type ResourceUnitAvailability } from "./resources";

/**
 * Multi-service chains (M6.8, spec 06 G12): one appointment with several services in sequence,
 * each done by one staff member (the same or another one) and claiming its own staff time and
 * resource units. `computeSlots` plans a chain per candidate start; a single service is a chain
 * of one. Pure — no I/O.
 */

const MINUTE = 60_000;

/** How long a booking occupies the staff member: buffers + appointment length. */
export interface OccupancyTerms {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

/**
 * One service of a multi-service appointment (M6.8). Lines run in order; each is done by one staff
 * member (the same or another one) and claims its own staff time and resource units.
 */
export interface ServiceLine {
  /** Staff who may perform this line, with their terms for it (overrides applied). */
  staffTerms: ReadonlyMap<string, OccupancyTerms>;
  /** Resource units this line needs, claimed for the line's own occupancy segment. */
  requirements?: readonly ResourceRequirement[];
}

/** Most services one appointment may chain (contracts allow the first + 3 more). */
export const MAX_SERVICE_LINES = 4;

/** Where one line of a chain lands: who, when, and what it claims. */
export interface LinePlan {
  staffId: string;
  /** Line start/end (what the customer sees for this service). */
  start: number;
  end: number;
  /** Time the staff member is blocked for this line — one booking_occupancy row. */
  occupancy: Interval;
  /** Resource units claimed for the same interval (one occupancy row each). */
  unitIds: string[];
}

export interface SlotOption {
  /** Staff of the first line. */
  staffId: string;
  /** Appointment start (first line) and end (last line) — what the customer sees. */
  start: number;
  end: number;
  /** Hull of every line's occupancy (single service: exactly its occupancy row). */
  occupancy: Interval;
  /** Every unit claimed by the chain (single service: its units). */
  unitIds: string[];
  /** One plan per service line, in order (single service: one). Write these to booking_occupancy. */
  lines: LinePlan[];
}

/**
 * Timing of one chain line (spec 06 G12). The first line starts at the slot start. A line done by
 * the same staff member as the previous one starts after max(after-buffer, before-buffer) — the
 * cleanup and the prep overlap — and its occupancy begins where the previous one ends, so the two
 * rows touch but never overlap. A line done by someone else starts as soon as the previous one
 * ends; that person's before-buffer runs while the customer is still in the previous service.
 */
export function lineTiming(
  prev: { staffId: string; end: number; bufferAfterMinutes: number } | null,
  staffId: string,
  terms: OccupancyTerms,
  chainStart: number,
): { start: number; end: number; occupancy: Interval } {
  let start: number;
  let occupancyStart: number;
  if (!prev) {
    start = chainStart;
    occupancyStart = start - terms.bufferBeforeMinutes * MINUTE;
  } else if (prev.staffId === staffId) {
    start = prev.end + Math.max(prev.bufferAfterMinutes, terms.bufferBeforeMinutes) * MINUTE;
    occupancyStart = prev.end + prev.bufferAfterMinutes * MINUTE;
  } else {
    start = prev.end;
    occupancyStart = start - terms.bufferBeforeMinutes * MINUTE;
  }
  const end = start + terms.durationMinutes * MINUTE;
  return {
    start,
    end,
    occupancy: { start: occupancyStart, end: end + terms.bufferAfterMinutes * MINUTE },
  };
}

export interface Candidate {
  s: { staffId: string };
  free: Interval[];
}

/** Claims already made by earlier lines of the chain being planned. */
export interface ChainClaims {
  staff: { staffId: string; occupancy: Interval }[];
  units: { unitId: string; occupancy: Interval }[];
}

/** Units for one line; units taken by earlier lines of the chain count as busy. */
function unitsForLine(
  pool: readonly ResourceUnitAvailability[],
  line: ServiceLine,
  claims: ChainClaims,
  occupancy: Interval,
): string[] | null {
  const units =
    claims.units.length === 0
      ? pool
      : pool.map((u) => {
          const mine = claims.units.filter((x) => x.unitId === u.unitId);
          return mine.length === 0
            ? u
            : { ...u, busy: [...u.busy, ...mine.map((x) => x.occupancy)] };
        });
  return pickUnits({ requirements: line.requirements ?? [], units }, occupancy);
}

export function planLines(
  /** Every unit any line may claim, with its busy time. */
  pool: readonly ResourceUnitAvailability[],
  lines: readonly ServiceLine[],
  /** Staff with free time that day, best "any staff" candidate first. */
  ranked: readonly Candidate[],
  index: number,
  chainStart: number,
  prev: { staffId: string; end: number; bufferAfterMinutes: number } | null,
  claims: ChainClaims,
  onlyStaffId: string | null,
): LinePlan[] | null {
  const line = lines[index];
  if (!line) return [];
  // Continuity first: the previous line's staff member, if they can do this one too.
  const order = prev
    ? [
        ...ranked.filter((c) => c.s.staffId === prev.staffId),
        ...ranked.filter((c) => c.s.staffId !== prev.staffId),
      ]
    : ranked;
  for (const c of order) {
    const staffId = c.s.staffId;
    if (onlyStaffId !== null && staffId !== onlyStaffId) continue;
    const terms = line.staffTerms.get(staffId);
    if (!terms) continue;
    const timing = lineTiming(prev, staffId, terms, chainStart);
    if (!covers(c.free, timing.occupancy)) continue;
    if (
      claims.staff.some((x) => x.staffId === staffId && overlaps(x.occupancy, timing.occupancy))
    ) {
      continue;
    }
    const unitIds = unitsForLine(pool, line, claims, timing.occupancy);
    if (!unitIds) continue;
    const plan: LinePlan = { staffId, ...timing, unitIds };
    if (index === lines.length - 1) return [plan];
    const rest = planLines(
      pool,
      lines,
      ranked,
      index + 1,
      chainStart,
      { staffId, end: timing.end, bufferAfterMinutes: terms.bufferAfterMinutes },
      {
        staff: [...claims.staff, { staffId, occupancy: timing.occupancy }],
        units: [
          ...claims.units,
          ...unitIds.map((unitId) => ({ unitId, occupancy: timing.occupancy })),
        ],
      },
      null,
    );
    if (rest) return [plan, ...rest];
  }
  return null;
}

export function toOption(lines: LinePlan[]): SlotOption {
  const first = lines[0] as LinePlan;
  const last = lines.at(-1) as LinePlan;
  return {
    staffId: first.staffId,
    start: first.start,
    end: last.end,
    occupancy: {
      start: Math.min(...lines.map((l) => l.occupancy.start)),
      end: Math.max(...lines.map((l) => l.occupancy.end)),
    },
    unitIds: [...new Set(lines.flatMap((l) => l.unitIds))],
    lines,
  };
}
