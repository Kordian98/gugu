import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENTS,
  TEAM_NOTIFICATION_EVENTS,
} from "@gugu/contracts";
import { CATALOG, channelEnabled } from "./catalog";
import { idempotencyKey } from "./idempotency";
import { formatWhen } from "../application/booking-view";

describe("catalog and channel policy", () => {
  it("has an entry for every contract event, transactional only, never SMS", () => {
    for (const e of NOTIFICATION_EVENTS) {
      const def = CATALOG[e];
      expect(def.class).toBe("transactional");
      expect(def.channels).not.toContain("sms");
    }
  });

  it("reaches customers only through the salon's Zalo OA — never by email (X26)", () => {
    for (const e of CUSTOMER_NOTIFICATION_EVENTS) {
      const def = CATALOG[e];
      expect(def.audience).toBe("customer");
      expect(def.channels).toEqual(["zalo_template"]);
      expect(def.channels).not.toContain("email");
    }
    for (const e of TEAM_NOTIFICATION_EVENTS) {
      expect(CATALOG[e].channels).toEqual(["in_app", "email"]);
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
    expect(channelEnabled({}, "salon.booking_cancelled", "in_app")).toBe(true);
    expect(channelEnabled({}, "salon.booking_cancelled", "email")).toBe(true);
    expect(
      channelEnabled(
        { "salon.booking_received": { email: false } },
        "salon.booking_received",
        "email",
      ),
    ).toBe(false);
  });
});

describe("idempotency key", () => {
  const base = {
    event: "salon.booking_received",
    entityId: "b1",
    entityVersion: 2,
    recipientId: "u1",
    channel: "email",
  };
  it("is deterministic hex (valid BullMQ job id)", () => {
    expect(idempotencyKey(base)).toBe(idempotencyKey({ ...base }));
    expect(idempotencyKey(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with every component", () => {
    const k = idempotencyKey(base);
    for (const change of [
      { event: "salon.booking_cancelled" },
      { entityId: "b2" },
      { entityVersion: 3 },
      { recipientId: "u2" },
      { channel: "in_app" },
      { variant: "120m" },
    ]) {
      expect(idempotencyKey({ ...base, ...change })).not.toBe(k);
    }
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
