import { describe, expect, it } from "vitest";
import { globalPayload } from "./payload";
import { dueForAutoRelease, routeInbound } from "./routing";

const STAFF = "0194c2a0-0000-7000-8000-0000000000aa";
const handedOff = { mode: "staff" as const, assignedUserId: null, staffNoticeAt: null };
const takenOver = { mode: "staff" as const, assignedUserId: STAFF, staffNoticeAt: null };
const text = (t: string) => ({ kind: "text" as const, text: t });
const tap = (c: "menu" | "book" | "bot" | "staff" | "mine") => ({
  kind: "payload" as const,
  payload: globalPayload(c),
});

describe("routeInbound", () => {
  it("the bot answers in bot mode; nothing answers when the bot is off", () => {
    const bot = { mode: "bot" as const, assignedUserId: null, staffNoticeAt: null };
    expect(routeInbound(bot, true, text("hi"))).toBe("bot");
    expect(routeInbound(bot, false, text("hi"))).toBe("silent");
  });

  it("after a bot hand-off, greetings / menu / Đặt lịch / follow restart the bot", () => {
    for (const input of [
      text("xin chào"),
      text("Menu"),
      text("đặt lịch"),
      tap("book"),
      tap("menu"),
      { kind: "follow" as const },
    ]) {
      expect(routeInbound(handedOff, true, input)).toBe("resume_bot");
    }
  });

  it("in staff mode the first other message gets the notice once, later ones wait for staff", () => {
    expect(routeInbound(handedOff, true, text("salon mở cửa tối nay không?"))).toBe("staff_notice");
    const noticed = { ...handedOff, staffNoticeAt: new Date() };
    expect(routeInbound(noticed, true, text("còn ở đó không?"))).toBe("silent");
    expect(routeInbound(noticed, true, text("xin chào"))).toBe("resume_bot");
  });

  it("after an explicit take-over, restart intents always get the notice; only 'back to the assistant' resumes", () => {
    const noticed = { ...takenOver, staffNoticeAt: new Date() };
    expect(routeInbound(noticed, true, text("menu"))).toBe("staff_notice");
    expect(routeInbound(noticed, true, tap("book"))).toBe("staff_notice");
    expect(routeInbound(noticed, true, tap("bot"))).toBe("resume_bot");
    expect(routeInbound(noticed, true, text("cảm ơn chị"))).toBe("silent");
    expect(routeInbound(takenOver, true, text("cảm ơn chị"))).toBe("staff_notice");
  });
});

describe("dueForAutoRelease", () => {
  const now = new Date("2026-12-01T10:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  it("releases staff chats after the configured quiet time; 0 = never", () => {
    expect(dueForAutoRelease({ mode: "staff", lastStaffActivityAt: ago(31) }, 30, now)).toBe(true);
    expect(dueForAutoRelease({ mode: "staff", lastStaffActivityAt: ago(10) }, 30, now)).toBe(false);
    expect(dueForAutoRelease({ mode: "staff", lastStaffActivityAt: ago(999) }, 0, now)).toBe(false);
    expect(dueForAutoRelease({ mode: "bot", lastStaffActivityAt: ago(999) }, 30, now)).toBe(false);
  });
});
