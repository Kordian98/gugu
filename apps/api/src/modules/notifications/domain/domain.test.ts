import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENTS, TEAM_NOTIFICATION_EVENTS } from "@gugu/contracts";
import { CATALOG, channelEnabled } from "./catalog";
import { idempotencyKey } from "./idempotency";
import { coveringZaloReminder, planReminders } from "./reminders";
import { customerSkipReason, zaloGate } from "./send-checks";
import { formatWhen } from "../application/booking-view";

const HOUR = 3_600_000;

describe("catalog and channel policy", () => {
  it("has an entry for every contract event, transactional only, never SMS", () => {
    for (const e of NOTIFICATION_EVENTS) {
      const def = CATALOG[e];
      expect(def.class).toBe("transactional");
      expect(def.channels).not.toContain("sms");
      if (def.audience === "customer") {
        // Zalo first, email only as the fallback (owner, 2026-11-03).
        expect(def.channels).toEqual(["zalo_template", "email"]);
      } else {
        expect(def.channels).toEqual(["in_app", "email"]);
      }
    }
  });

  it("team booking events follow the booking read scope, the Zalo hand-off the inbox permission", () => {
    for (const e of TEAM_NOTIFICATION_EVENTS) {
      const def = CATALOG[e];
      if (def.audience !== "team") throw new Error("team event expected");
      expect(def.permission).toEqual(
        e === "salon.zalo_handoff"
          ? { full: "zalo.inbox.use", own: null }
          : { full: "bookings.read", own: "bookings.read.own" },
      );
    }
  });

  it("uses salon overrides, else catalog defaults", () => {
    expect(channelEnabled({}, "booking.confirmed", "email")).toBe(true);
    expect(channelEnabled({}, "booking.confirmed", "in_app")).toBe(false);
    expect(channelEnabled({}, "salon.booking_cancelled", "in_app")).toBe(true);
    expect(
      channelEnabled({ "booking.confirmed": { email: false } }, "booking.confirmed", "email"),
    ).toBe(false);
  });
});

describe("idempotency key", () => {
  const base = {
    event: "booking.confirmed",
    entityId: "b1",
    entityVersion: 2,
    recipientId: "customer",
    channel: "email",
  };
  it("is deterministic hex (valid BullMQ job id)", () => {
    expect(idempotencyKey(base)).toBe(idempotencyKey({ ...base }));
    expect(idempotencyKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with every component", () => {
    const k = idempotencyKey(base);
    for (const change of [
      { event: "booking.rescheduled" },
      { entityId: "b2" },
      { entityVersion: 3 },
      { recipientId: "u1" },
      { channel: "in_app" },
      { variant: "120m" },
    ]) {
      expect(idempotencyKey({ ...base, ...change })).not.toBe(k);
    }
  });
});

describe("reminder planning (fake clock)", () => {
  const startsAt = new Date("2026-12-10T07:00:00Z"); // 14:00 in Ho Chi Minh City

  it("plans default 24 h and 2 h moments, latest offset first", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(planReminders(startsAt, [120, 1440], now)).toEqual([
      { offsetMinutes: 1440, sendAt: new Date("2026-12-09T07:00:00Z"), variant: "1440m" },
      { offsetMinutes: 120, sendAt: new Date("2026-12-10T05:00:00Z"), variant: "120m" },
    ]);
  });

  it("drops moments already past (booked 3 h ahead → only the 2 h reminder)", () => {
    const now = new Date(startsAt.getTime() - 3 * HOUR);
    expect(planReminders(startsAt, [1440, 120], now).map((r) => r.offsetMinutes)).toEqual([120]);
    expect(planReminders(startsAt, [1440, 120], new Date(startsAt.getTime() - HOUR))).toEqual([]);
  });

  it("is exact across a DST change (Europe/Warsaw, 2026-03-29)", () => {
    // 14:00 CEST on the change day = 12:00Z; 24 h earlier is 12:00Z the day before (13:00 CET).
    const start = new Date("2026-03-29T12:00:00Z");
    const [r] = planReminders(start, [1440], new Date("2026-03-01T00:00:00Z"));
    expect(r?.sendAt.toISOString()).toBe("2026-03-28T12:00:00.000Z");
  });

  it("dedupes offsets", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(planReminders(startsAt, [120, 120], now)).toHaveLength(1);
  });

  it("maps an email reminder to the Zalo reminder that covers it", () => {
    const zalo = { reminder24h: true, reminder2h: true };
    const early = { startsAt, createdAt: new Date("2026-12-01T00:00:00Z") };
    expect(coveringZaloReminder(1440, early, zalo)).toBe("reminder_24h");
    expect(coveringZaloReminder(360, early, zalo)).toBe("reminder_24h");
    expect(coveringZaloReminder(120, early, zalo)).toBe("reminder_2h");
    expect(coveringZaloReminder(30, early, zalo)).toBe("reminder_2h");
    expect(coveringZaloReminder(120, early, { ...zalo, reminder2h: false })).toBeNull();
    // Zalo skips a reminder when the booking did not exist at its moment.
    const late = { startsAt, createdAt: new Date(startsAt.getTime() - 3 * HOUR) };
    expect(coveringZaloReminder(1440, late, zalo)).toBeNull();
    expect(coveringZaloReminder(120, late, zalo)).toBe("reminder_2h");
  });
});

describe("send-time checks", () => {
  const startsAt = new Date("2026-12-10T07:00:00Z");
  const planned = { entityVersion: 1, plannedStartsAt: startsAt.toISOString() };
  const now = new Date("2026-12-09T07:00:00Z");
  const booking = { status: "confirmed", version: 1, startsAt };

  it("keeps a valid reminder and drops cancelled, moved or re-versioned ones", () => {
    expect(customerSkipReason("booking.reminder", booking, planned, now)).toBeNull();
    for (const b of [
      { ...booking, status: "cancelled_by_salon" },
      { ...booking, status: "cancelled_by_customer" },
      { ...booking, version: 2 },
      { ...booking, startsAt: new Date("2026-12-11T07:00:00Z") },
    ]) {
      expect(customerSkipReason("booking.reminder", b, planned, now)).toBe("stale");
    }
    expect(customerSkipReason("booking.reminder", booking, planned, startsAt)).toBe("too_late");
  });

  it("drops a reschedule email superseded by a newer reschedule", () => {
    const moved = { ...booking, startsAt: new Date("2026-12-12T07:00:00Z"), version: 3 };
    expect(customerSkipReason("booking.rescheduled", moved, planned, now)).toBe("superseded");
    expect(customerSkipReason("booking.rescheduled", booking, planned, now)).toBeNull();
  });

  it("sends a cancellation only while the booking stays cancelled by the salon", () => {
    const cancelled = { ...booking, status: "cancelled_by_salon" };
    expect(customerSkipReason("booking.cancelled_by_salon", cancelled, planned, now)).toBeNull();
    expect(customerSkipReason("booking.cancelled_by_salon", booking, planned, now)).toBe("stale");
    expect(customerSkipReason("booking.confirmed", cancelled, planned, now)).toBe("stale");
  });

  it("gates the email on the Zalo outcome", () => {
    const since = new Date("2026-12-09T06:59:00Z");
    const limits = { recheckMs: 60_000, maxWaitMs: 15 * 60_000 };
    expect(zaloGate("sent", since, now, limits)).toEqual({ kind: "skip" });
    expect(zaloGate("rejected", since, now, limits)).toEqual({ kind: "fallback" });
    expect(zaloGate("failed", since, now, limits)).toEqual({ kind: "fallback" });
    expect(zaloGate("queued", since, now, limits)).toEqual({
      kind: "wait",
      until: new Date(now.getTime() + 60_000),
    });
    expect(zaloGate(null, since, now, limits).kind).toBe("wait");
    const later = new Date(since.getTime() + 16 * 60_000);
    expect(zaloGate(null, since, later, limits)).toEqual({ kind: "fallback" });
    expect(zaloGate("queued", since, later, limits)).toEqual({ kind: "fallback" });
  });
});

describe("rendered time across a DST change (Europe/Warsaw)", () => {
  it("shows local wall-clock time on both sides of the change, vi and en", () => {
    const after = new Date("2026-03-29T12:00:00Z"); // CEST, UTC+2
    const before = new Date("2026-03-28T12:00:00Z"); // CET, UTC+1
    expect(formatWhen(after, "vi", "Europe/Warsaw")).toMatch(/^14:00, /);
    expect(formatWhen(before, "vi", "Europe/Warsaw")).toMatch(/^13:00, /);
    expect(formatWhen(after, "en", "Europe/Warsaw")).toMatch(/ at 2:00 PM$/);
    expect(formatWhen(before, "en", "Europe/Warsaw")).toMatch(/ at 1:00 PM$/);
  });
});
