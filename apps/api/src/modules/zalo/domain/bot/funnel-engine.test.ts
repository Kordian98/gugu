// Funnel tracking in the bot (owner request 2026-11-03) and "why nothing is free" answers
// (topic 07 unavailableReason). Events carry steps and reasons only — no text, no personal data.
import { createI18n } from "@gugu/localization";
import { describe, expect, it } from "vitest";
import type { FunnelEventInput } from "../funnel";
import { expireSession, runBot } from "./engine";
import type { BotInput, BotPorts, BotResult, BotState, NoDaysExplanation } from "./types";

const NOW = new Date("2026-11-03T01:00:00Z");
const MIN = 60_000;
const vn = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const ports = (o: Partial<BotPorts> = {}): BotPorts => ({
  salon: { name: "Lotus", timeZone: "Asia/Ho_Chi_Minh", hideStaffChoice: false },
  customer: { name: "Mai", phone: null },
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
  staffFor: () =>
    Promise.resolve([
      { id: "a", name: "An" },
      { id: "b", name: "Bình" },
    ]),
  days: () => Promise.resolve(["2026-11-04"]),
  slots: () => Promise.resolve([vn("2026-11-04", "10:00"), vn("2026-11-04", "11:00")]),
  upcoming: () => Promise.resolve([]),
  book: () =>
    Promise.resolve({
      ok: true as const,
      pending: false,
      booking: {
        id: "0194c2a0-0000-7000-8000-000000000009",
        ref: "X",
        startsAt: vn("2026-11-04", "10:00"),
        serviceId: "svc",
        variantId: null,
        staffId: "a",
        serviceName: "Gel",
        staffName: "An",
        priceMinor: 1,
        priceMaxMinor: null,
        status: "confirmed",
      },
    }),
  cancel: () => Promise.resolve("ok" as const),
  reschedule: () => Promise.resolve({ ok: false as const, reason: "failed" as const }),
  confirmAttendance: () => Promise.resolve("ok" as const),
  explainNoDays: () => Promise.resolve({ reason: "fully_booked", windowDays: 60, earliest: [] }),
  ...o,
});
const { t } = createI18n("vi");
let n = 0;
const run = (s: BotState | null, input: BotInput, p: BotPorts, now = NOW) =>
  runBot(s, input, p, {
    now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    locale: "vi",
    t: (k, v) => t(`zalo:${k}`, v ?? {}),
  });
const events = (r: BotResult): FunnelEventInput[] =>
  r.effects.flatMap((e) => (e.type === "funnel" ? [e.event] : []));
const tap = (r: BotResult, title: string): BotInput => {
  const m = r.replies.at(-1);
  const b = m?.kind === "text" ? m.buttons.find((x) => x.title.startsWith(title)) : undefined;
  if (!b) throw new Error(`no ${title}`);
  return { kind: "payload", payload: b.payload };
};

describe("funnel events from the bot", () => {
  it("tracks a booked session: started → service → staff → slot → phone → confirm → booked", async () => {
    const p = ports();
    const all: FunnelEventInput[] = [];
    let r = await run(null, { kind: "payload", payload: "gg|g|book" }, p);
    all.push(...events(r));
    for (const step of ["Gel", "An", "Thứ 4", "10:00"]) {
      r = await run(r.state, tap(r, step), p);
      all.push(...events(r));
    }
    r = await run(
      r.state,
      { kind: "user_info", phone: "0901234567", name: "Mai" },
      { ...p, customer: { name: "Mai", phone: null } },
    );
    all.push(...events(r));
    r = await run(r.state, tap(r, "Xác nhận"), {
      ...p,
      customer: { name: "Mai", phone: "+84901234567" },
    });
    all.push(...events(r));
    expect(all.map((e) => [e.event, e.step ?? e.reason ?? null])).toEqual([
      ["session_started", "service"],
      ["step_reached", "service"],
      ["step_reached", "staff"],
      ["step_reached", "slot"],
      ["step_reached", "phone"],
      ["step_reached", "confirm"],
      ["booked", null],
    ]);
    expect(new Set(all.map((e) => e.sessionId)).size).toBe(1);
    expect(r.state.session).toBeNull();
  });

  it("an attempt left silent for 30 min ends 'abandoned' at its step — by the sweep or the next message", async () => {
    const p = ports();
    let r = await run(null, { kind: "payload", payload: "gg|g|book" }, p);
    r = await run(r.state, tap(r, "Gel"), p);
    const later = new Date(NOW.getTime() + 31 * MIN);
    expect(expireSession(r.state, new Date(NOW.getTime() + 10 * MIN))).toBeNull();
    const swept = expireSession(r.state, later);
    expect(swept?.effects).toEqual([
      {
        type: "funnel",
        event: {
          event: "session_ended",
          sessionId: r.state.session?.id,
          step: "staff",
          reason: "abandoned",
        },
      },
    ]);
    expect(swept?.state.session).toBeNull();
    const next = await run(r.state, { kind: "text", text: "xin chào" }, p, later);
    expect(events(next)).toContainEqual(
      expect.objectContaining({ event: "session_ended", step: "staff", reason: "abandoned" }),
    );
  });

  it("the last problem becomes the reason: slot taken / not understood, then silence", async () => {
    const p = ports({
      book: () => Promise.resolve({ ok: false as const, reason: "slot_taken" as const }),
    });
    const confirm: BotState = {
      v: 1,
      seq: 2,
      options: ["confirm", "change", "abort"],
      items: 0,
      at: NOW.toISOString(),
      step: {
        name: "confirm",
        sel: { serviceId: "svc", variantId: null, staffId: null },
        startsAt: vn("2026-11-04", "10:00"),
      },
      session: { id: "00000000-0000-4000-8000-0000000000aa", step: "confirm", issue: null },
    };
    const r = await run(
      confirm,
      { kind: "payload", payload: "gg|2|0" },
      { ...p, customer: { name: "M", phone: "+84901234567" } },
    );
    expect(events(r)).toContainEqual(expect.objectContaining({ event: "slot_taken" }));
    expect(expireSession(r.state, new Date(NOW.getTime() + 40 * MIN))?.effects[0]).toMatchObject({
      event: { reason: "slot_taken", step: "confirm" },
    });
    const typed = await run(r.state, { kind: "text", text: "giá bao nhiêu" }, p);
    expect(events(typed)).toContainEqual(expect.objectContaining({ event: "not_understood" }));
  });

  it("ends with explicit reasons: hand-off, cancelled at confirm", async () => {
    const p = ports();
    let r = await run(null, { kind: "payload", payload: "gg|g|book" }, p);
    const staff = await run(r.state, { kind: "payload", payload: "gg|g|staff" }, p);
    expect(events(staff)).toContainEqual(
      expect.objectContaining({ event: "session_ended", reason: "handoff", step: "service" }),
    );
    const confirm: BotState = {
      v: 1,
      seq: 3,
      options: ["confirm", "change", "abort"],
      items: 0,
      at: NOW.toISOString(),
      step: {
        name: "confirm",
        sel: { serviceId: "svc", variantId: null, staffId: null },
        startsAt: vn("2026-11-04", "10:00"),
      },
      session: { id: "00000000-0000-4000-8000-0000000000bb", step: "confirm", issue: null },
    };
    r = await run(confirm, { kind: "payload", payload: "gg|3|2" }, p);
    expect(events(r)).toContainEqual(
      expect.objectContaining({ event: "session_ended", reason: "cancelled" }),
    );
  });
});

describe("why nothing is free (unavailableReason)", () => {
  const toDays = async (why: NoDaysExplanation) => {
    const p = ports({
      days: () => Promise.resolve([]),
      explainNoDays: () => Promise.resolve(why),
      staffFor: () => Promise.resolve([]),
    });
    const r = await run(null, { kind: "payload", payload: "gg|g|book" }, p);
    return run(r.state, tap(r, "Gel"), p);
  };
  const texts = (r: BotResult) =>
    r.replies.map((x) => (x.kind === "text" ? x.text : "")).join("\n");

  it("setup problems: tells the customer to call, notifies staff, funnel 'not_bookable'", async () => {
    for (const reason of ["no_staff_assigned", "no_working_hours", "no_resource"] as const) {
      const r = await toDays({ reason, windowDays: 60, earliest: [] });
      expect(texts(r)).toContain("gọi điện cho salon");
      expect(r.effects).toContainEqual({ type: "setup_issue", reason });
      expect(events(r)).toContainEqual(
        expect.objectContaining({ event: "session_ended", reason: "not_bookable" }),
      );
    }
  });

  it("outside the booking window says how far ahead the salon books", async () => {
    const r = await toDays({ reason: "outside_booking_window", windowDays: 3, earliest: [] });
    expect(texts(r)).toContain("trước tối đa 3 ngày");
  });

  it("fully booked offers the earliest free times as buttons, which book directly", async () => {
    const r = await toDays({
      reason: "fully_booked",
      windowDays: 60,
      earliest: [vn("2026-11-20", "10:00"), vn("2026-11-21", "15:00")],
    });
    const m = r.replies.at(-1);
    expect(m?.kind === "text" ? m.buttons.map((b) => b.title) : []).toEqual([
      "10:00 · 20/11",
      "15:00 · 21/11",
      "Gặp nhân viên",
      "Menu",
    ]);
    const picked = await run(
      r.state,
      tap(r, "10:00 · 20/11"),
      ports({ customer: { name: "M", phone: "+84901234567" } }),
    );
    expect(picked.state.step).toMatchObject({
      name: "confirm",
      startsAt: vn("2026-11-20", "10:00"),
    });
  });
});
