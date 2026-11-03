import type { AvailabilityInput, StaffAvailability, WeeklyHours } from "./availability";
import type { OccupancyTerms, ServiceLine } from "./chain";
import type { ResourceUnitAvailability } from "./resources";
import { instantsAt } from "./tz";

/**
 * Worst cases for chain planning (security review M1, ADR-0013): 15 staff free all day, a chain
 * of 4 lines where the last one can never be placed. Before the search budget these took
 * ~10⁹ steps per availability window on the event loop.
 */

const HCM = "Asia/Ho_Chi_Minh";
export const PERF_NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
export const PERF_DAY = "2026-11-03";

const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

const terms = (d: number, before = 0, after = 0): OccupancyTerms => ({
  durationMinutes: d,
  bufferBeforeMinutes: before,
  bufferAfterMinutes: after,
});

export const PERF_STAFF: StaffAvailability[] = Array.from({ length: 15 }, (_, k) => ({
  staffId: `s${String(k).padStart(2, "0")}`,
  sortOrder: k,
  schedules: allWeek(8, 20).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy: [],
}));

const byStaff = (ids: readonly string[], t: OccupancyTerms) =>
  new Map(ids.map((id) => [id, t] as const));
const everyone = PERF_STAFF.map((s) => s.staffId);
const room = [{ resourceTypeId: "room", quantity: 1 }];
const oneRoom: ResourceUnitAvailability[] = [
  { unitId: "room-1", resourceTypeId: "room", sortOrder: 0, busy: [] },
];

const base = (lines: ServiceLine[], units: ResourceUnitAvailability[]): AvailabilityInput => ({
  timeZone: HCM,
  now: PERF_NOW,
  from: PERF_DAY,
  to: PERF_DAY,
  rules: { slotGranularityMinutes: 5, minLeadMinutes: 0, bookingWindowDays: 365 },
  openingHours: allWeek(8, 20),
  holidays: [],
  staff: PERF_STAFF,
  resources: { requirements: [], units },
  lines,
});

/** A 4-line chain everyone can do, all day: the expensive legitimate case. */
export const perfFeasible = (): AvailabilityInput =>
  base(
    Array.from({ length: 4 }, () => ({ staffTerms: byStaff(everyone, terms(30)) })),
    [],
  );

export const PERF_CASES = {
  /** Line 4 needs a room the salon does not have: impossible on its own. */
  "line 4 has no resource": () =>
    base(
      [
        { staffTerms: byStaff(everyone, terms(30)) },
        { staffTerms: byStaff(everyone, terms(30)) },
        { staffTerms: byStaff(everyone, terms(30)) },
        { staffTerms: byStaff(everyone, terms(30)), requirements: room },
      ],
      [],
    ),
  /**
   * Each line fits on its own, but line 3 and line 4 share the only room, are done by disjoint
   * staff, and line 3's clean-up overlaps line 4 — the chain never fits, only search proves it.
   */
  "line 4 collides with line 3": () =>
    base(
      [
        { staffTerms: byStaff(everyone, terms(30)) },
        { staffTerms: byStaff(everyone, terms(30)) },
        { staffTerms: byStaff(everyone.slice(0, 14), terms(30, 0, 10)), requirements: room },
        { staffTerms: byStaff(everyone.slice(14), terms(30)), requirements: room },
      ],
      oneRoom,
    ),
  /** Line 4's only staff member works mornings, the chain cannot reach them in time. */
  "line 4 staff gone by then": () => {
    const input = base(
      [
        { staffTerms: byStaff(everyone, terms(60)) },
        { staffTerms: byStaff(everyone, terms(60)) },
        { staffTerms: byStaff(everyone, terms(60)) },
        { staffTerms: byStaff(["s14"], terms(60)) },
      ],
      [],
    );
    return {
      ...input,
      staff: PERF_STAFF.map((s) =>
        s.staffId === "s14"
          ? {
              ...s,
              schedules: allWeek(8, 10).map((h) => ({
                ...h,
                effectiveFrom: "2026-01-01",
                effectiveTo: null,
              })),
            }
          : s,
      ),
    };
  },
} satisfies Record<string, () => AvailabilityInput>;
