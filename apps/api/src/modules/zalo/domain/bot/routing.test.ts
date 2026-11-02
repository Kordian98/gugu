import { describe, expect, it } from "vitest";
import { globalPayload } from "./payload";
import { routeInbound } from "./routing";

const handedOff = { mode: "staff" as const, assignedUserId: null };
const takenOver = {
  mode: "staff" as const,
  assignedUserId: "0194c2a0-0000-7000-8000-0000000000aa",
};
const text = (t: string) => ({ kind: "text" as const, text: t });
const tap = (c: "menu" | "book" | "bot" | "staff" | "mine") => ({
  kind: "payload" as const,
  payload: globalPayload(c),
});

describe("routeInbound", () => {
  it("the bot answers in bot mode; nothing answers when the bot is off", () => {
    expect(routeInbound({ mode: "bot", assignedUserId: null }, true, text("hi"))).toBe("bot");
    expect(routeInbound({ mode: "bot", assignedUserId: null }, false, text("hi"))).toBe("silent");
  });

  it("after a bot hand-off, greetings / menu / Đặt lịch / follow restart the bot; other text waits for staff", () => {
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
    expect(routeInbound(handedOff, true, text("salon mở cửa tối nay không?"))).toBe("silent");
    expect(routeInbound(handedOff, true, tap("staff"))).toBe("silent");
  });

  it("after an explicit staff take-over, restart intents get a notice; only 'back to the assistant' resumes", () => {
    expect(routeInbound(takenOver, true, text("menu"))).toBe("staff_notice");
    expect(routeInbound(takenOver, true, tap("book"))).toBe("staff_notice");
    expect(routeInbound(takenOver, true, tap("bot"))).toBe("resume_bot");
    expect(routeInbound(takenOver, true, text("cảm ơn chị"))).toBe("silent");
  });
});
