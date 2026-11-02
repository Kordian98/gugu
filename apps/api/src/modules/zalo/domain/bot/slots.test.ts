// Slot picking within Zalo's limits (owner 2026-11-03): max 5 buttons per message, so days and
// times are paged (3 + ‹ ›), times are grouped by part of day, every option is listed in the text
// and can be typed, and short phrases like "mai 15h" jump straight to the nearest times.
import { createI18n } from "@gugu/localization";
import { describe, expect, it } from "vitest";
import { runBot } from "./engine";
import type { BotInput, BotPorts, BotResult, BotState } from "./types";

const NOW = new Date("2026-11-03T01:00:00Z"); // Tue 08:00 in Ho Chi Minh City
const vn = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const DAYS = [
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
  "2026-11-08",
  "2026-11-10",
];
const TIMES = [
  "09:00",
  "09:30",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "15:30",
  "16:30",
  "18:00",
  "19:00",
];
const booked: string[] = [];
const ports: BotPorts = {
  salon: { name: "Lotus", timeZone: "Asia/Ho_Chi_Minh", hideStaffChoice: true },
  customer: { name: "Mai", phone: "+84901234567" },
  services: () =>
    Promise.resolve([
      {
        id: "svc",
        name: "Gel",
        priceMinor: 1,
        priceMaxMinor: null,
        durationMinutes: 30,
        variants: [],
      },
    ]),
  staffFor: () => Promise.resolve([]),
  days: () => Promise.resolve(DAYS),
  slots: (_s, date) => Promise.resolve(TIMES.map((t) => vn(date, t))),
  upcoming: () => Promise.resolve([]),
  book: () => Promise.resolve({ ok: false as const, reason: "failed" as const }),
  cancel: () => Promise.resolve("ok" as const),
  reschedule: () => Promise.resolve({ ok: false as const, reason: "failed" as const }),
  confirmAttendance: () => Promise.resolve("ok" as const),
  explainNoDays: () =>
    Promise.resolve({ reason: "fully_booked" as const, windowDays: 60, earliest: [] }),
};
const { t } = createI18n("vi");
const run = (s: BotState | null, input: BotInput) =>
  runBot(
    s,
    input,
    {
      ...ports,
      book: (sel, at) => {
        booked.push(at);
        return ports.book(sel, at, "", "");
      },
    },
    {
      now: NOW,
      newId: () => crypto.randomUUID(),
      locale: "vi",
      t: (k, v) => t(`zalo:${k}`, v ?? {}),
    },
  );
const titles = (r: BotResult) => {
  const m = r.replies.at(-1);
  return m?.kind === "text" ? m.buttons.map((b) => b.title) : [];
};
const text = (r: BotResult) => {
  const m = r.replies.at(-1);
  return m?.kind === "text" ? m.text : "";
};
const tap = (r: BotResult, title: string): BotInput => {
  const m = r.replies.at(-1);
  const b = m?.kind === "text" ? m.buttons.find((x) => x.title === title) : undefined;
  if (!b) throw new Error(`no "${title}" in ${JSON.stringify(titles(r))}`);
  return { kind: "payload", payload: b.payload };
};
async function toDays() {
  const r = await run(null, { kind: "payload", payload: "gg|g|book" });
  return run(r.state, tap(r, "Gel"));
}

describe("slot picking", () => {
  it("pages days three at a time with ‹ ›, never more than 5 buttons, all days listed and typeable", async () => {
    let r = await toDays();
    expect(titles(r)).toEqual(["Thứ 3, 03/11", "Thứ 4, 04/11", "Thứ 5, 05/11", "Sau ›"]);
    expect(text(r)).toContain("7. Thứ 3, 10/11");
    r = await run(r.state, tap(r, "Sau ›"));
    expect(titles(r)).toEqual(["Thứ 6, 06/11", "Thứ 7, 07/11", "CN, 08/11", "‹ Trước", "Sau ›"]);
    r = await run(r.state, { kind: "text", text: "7" }); // a day from another page, typed
    expect(r.state.step).toMatchObject({ name: "time", date: "2026-11-10" });
  });

  it("groups many times by part of day, then pages them with ‹ › and 'Buổi khác'", async () => {
    let r = await toDays();
    r = await run(r.state, tap(r, "Thứ 4, 04/11"));
    expect(titles(r)).toEqual(["Sáng · 4 giờ", "Chiều · 5 giờ", "Tối · 2 giờ", "Ngày khác"]);
    r = await run(r.state, tap(r, "Chiều · 5 giờ"));
    expect(titles(r)).toEqual(["13:00", "14:00", "15:00", "15:30", "16:30"]);
    expect(text(r)).toContain("buổi chiều");
    r = await run(r.state, tap(r, "15:30"));
    expect(r.state.step.name).toBe("confirm");
  });

  it("'mai 15h' picks tomorrow 15:00 directly; '14h45' offers the nearest times", async () => {
    let r = await toDays();
    r = await run(r.state, { kind: "text", text: "mai 15h" });
    expect(r.state.step).toMatchObject({ name: "confirm", startsAt: vn("2026-11-04", "15:00") });
    r = await toDays();
    r = await run(r.state, { kind: "text", text: "thứ 5 lúc 14h45" });
    expect(text(r)).toContain("14:45");
    expect(titles(r)).toEqual(["14:00", "15:00", "15:30", "Ngày khác"]);
  });

  it("'thứ 7 sáng' opens Saturday morning; a full day says so and shows the days", async () => {
    let r = await toDays();
    r = await run(r.state, { kind: "text", text: "thứ 7 sáng" });
    expect(r.state.step).toMatchObject({ name: "time", date: "2026-11-07", part: "morning" });
    expect(titles(r)).toEqual(["09:00", "09:30", "10:00", "11:00", "Buổi khác"]);
    r = await toDays();
    r = await run(r.state, { kind: "text", text: "thứ 2" }); // 09/11 has no free time
    expect(r.replies.map((x) => (x.kind === "text" ? x.text : "")).join("\n")).toContain(
      "không còn giờ trống",
    );
    expect(r.state.step.name).toBe("day");
  });
});
