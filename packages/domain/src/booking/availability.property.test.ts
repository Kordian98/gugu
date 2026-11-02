import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AvailabilityInput,
  computeSlots,
  findSlot,
  type StaffAvailability,
  type WeeklyHours,
} from "./availability";
import { overlaps } from "./intervals";
import { instantsAt } from "./tz";

const HCM = "Asia/Ho_Chi_Minh";
const M = 60_000;
// Monday 2026-11-02, 08:00 local.
const NOW = instantsAt("2026-11-02", 8 * 60, HCM)[0] as number;
const at = (date: string, hh: number, mm = 0, tz = HCM) =>
  instantsAt(date, hh * 60 + mm, tz)[0] as number;
const allWeek = (start: number, end: number): WeeklyHours[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    startMinute: start * 60,
    endMinute: end * 60,
  }));

const staff = (id: string, patch: Partial<StaffAvailability> = {}): StaffAvailability => ({
  staffId: id,
  sortOrder: 0,
  terms: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  schedules: allWeek(9, 18).map((h) => ({ ...h, effectiveFrom: "2026-01-01", effectiveTo: null })),
  breaks: [],
  timeOff: [],
  busy: [],
  ...patch,
});

const input = (patch: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  timeZone: HCM,
  now: NOW,
  from: "2026-11-03",
  to: "2026-11-03",
  rules: { slotGranularityMinutes: 15, minLeadMinutes: 60, bookingWindowDays: 60 },
  openingHours: allWeek(9, 18),
  holidays: [],
  staff: [staff("a")],
  ...patch,
});

describe("property: the engine never double-books", () => {
  const arbBusy = fc.array(
    fc.tuple(fc.integer({ min: 0, max: 47 }), fc.integer({ min: 1, max: 8 })),
    { maxLength: 6 },
  );
  const arbTerms = fc.record({
    durationMinutes: fc.constantFrom(15, 30, 45, 60, 90),
    bufferBeforeMinutes: fc.constantFrom(0, 5, 10),
    bufferAfterMinutes: fc.constantFrom(0, 5, 15),
  });

  it("every offered option is free; booking offered slots one by one never overlaps", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbBusy, arbTerms), { minLength: 1, maxLength: 3 }),
        fc.array(fc.nat(), { minLength: 1, maxLength: 8 }),
        (staffSpecs, picks) => {
          const dayStart = at("2026-11-03", 0);
          const staffList = staffSpecs.map(([busy, terms], k) =>
            staff(`s${String(k)}`, {
              terms,
              busy: busy.map(([slot, len]) => ({
                start: dayStart + slot * 30 * M,
                end: dayStart + (slot + len) * 30 * M,
              })),
            }),
          );
          let current = input({
            staff: staffList,
            rules: { slotGranularityMinutes: 15, minLeadMinutes: 0, bookingWindowDays: 60 },
          });
          for (const pick of picks) {
            const slots = computeSlots(current);
            for (const slot of slots) {
              for (const option of slot.options) {
                const s = current.staff.find((x) => x.staffId === option.staffId);
                for (const b of s?.busy ?? []) expect(overlaps(option.occupancy, b)).toBe(false);
              }
            }
            const sample = slots[pick % Math.max(slots.length, 1)];
            if (sample)
              expect(
                findSlot(current, sample.start, sample.options[0]?.staffId ?? null),
              ).not.toBeNull();
            if (slots.length === 0) break;
            const chosen = slots[pick % slots.length]?.options[0];
            if (!chosen) break;
            current = {
              ...current,
              staff: current.staff.map((s) =>
                s.staffId === chosen.staffId ? { ...s, busy: [...s.busy, chosen.occupancy] } : s,
              ),
            };
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
