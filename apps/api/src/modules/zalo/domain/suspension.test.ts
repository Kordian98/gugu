import { describe, expect, it } from "vitest";
import {
  allowedWhileSuspended,
  parkedDedupKey,
  shouldSendSuspendedNotice,
  SUSPENDED_NOTICE_PURPOSE,
} from "./suspension";

const H = 3_600_000;
const now = new Date("2026-12-01T10:00:00Z");
const base = { hasBotInput: true, botEnabled: true, lastNoticeAt: null, now, cooldownMs: 24 * H };

describe("suspended salon: neutral notice", () => {
  it("answers the first customer message", () => {
    expect(shouldSendSuspendedNotice(base)).toBe(true);
  });

  it("answers at most once per cooldown", () => {
    const at = (ms: number) => ({ ...base, lastNoticeAt: new Date(now.getTime() - ms) });
    expect(shouldSendSuspendedNotice(at(H))).toBe(false);
    expect(shouldSendSuspendedNotice(at(24 * H - 1))).toBe(false);
    expect(shouldSendSuspendedNotice(at(24 * H))).toBe(true);
  });

  it("stays quiet for events the bot never answers and when the bot is off", () => {
    expect(shouldSendSuspendedNotice({ ...base, hasBotInput: false })).toBe(false);
    expect(shouldSendSuspendedNotice({ ...base, botEnabled: false })).toBe(false);
  });

  it("lets only the notice through at send time", () => {
    expect(allowedWhileSuspended(SUSPENDED_NOTICE_PURPOSE)).toBe(true);
    for (const p of ["bot_reply", "staff_reply", "reminder_24h", "booking_update"]) {
      expect(allowedWhileSuspended(p)).toBe(false);
    }
  });

  it("frees the reminder dedup key, keeps others", () => {
    expect(parkedDedupKey("reminder_24h", "reminder_24h:b1", "l1")).toBe(
      "reminder_24h:b1:salon_suspended:l1",
    );
    expect(parkedDedupKey("booking_update", "booking_update:e1", "l1")).toBe("booking_update:e1");
  });
});
