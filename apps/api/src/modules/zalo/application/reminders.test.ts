import { describe, expect, it } from "vitest";
import { dueReminder } from "./reminders.service";

const H = 3_600_000;
const start = new Date("2026-12-10T10:00:00Z");
const made = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * H);
const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * H);
const on = { h24: true, h2: true };

describe("dueReminder", () => {
  it("is due 24 h ahead (until 2 h ahead), then 2 h ahead", () => {
    const b = { startsAt: start, createdAt: made(72) };
    expect(dueReminder(b, at(25), on)).toBeNull();
    expect(dueReminder(b, at(24), on)).toBe("reminder_24h");
    expect(dueReminder(b, at(3), on)).toBe("reminder_24h");
    expect(dueReminder(b, at(2), on)).toBe("reminder_2h");
    expect(dueReminder(b, at(0.1), on)).toBe("reminder_2h");
    expect(dueReminder(b, at(0), on)).toBeNull();
  });

  it("skips a reminder the booking was made after, and respects the salon toggles", () => {
    expect(dueReminder({ startsAt: start, createdAt: made(10) }, at(9), on)).toBeNull();
    expect(dueReminder({ startsAt: start, createdAt: made(10) }, at(1), on)).toBe("reminder_2h");
    expect(dueReminder({ startsAt: start, createdAt: made(1) }, at(0.5), on)).toBeNull();
    expect(
      dueReminder({ startsAt: start, createdAt: made(72) }, at(20), { h24: false, h2: true }),
    ).toBeNull();
    expect(
      dueReminder({ startsAt: start, createdAt: made(72) }, at(1), { h24: true, h2: false }),
    ).toBeNull();
  });
});
