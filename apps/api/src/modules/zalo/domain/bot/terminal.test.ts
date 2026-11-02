// Regression (owner bug 2026-11-03): after a refusal/abort the customer could not book again.
// Every terminal message must offer "Đặt lịch lại" + "Menu", and both must restart the flow.
import { createI18n } from "@gugu/localization";
import { describe, expect, it } from "vitest";
import { runBot } from "./engine";
import { bookingPayload, globalPayload } from "./payload";
import type { BotBooking, BotInput, BotPorts, BotResult, BotState } from "./types";

const NOW = new Date("2026-12-01T03:00:00Z");
const ID = "0194c2a0-0000-7000-8000-000000000001";
const booking: BotBooking = {
  id: ID,
  ref: "AB12CD",
  startsAt: "2026-12-02T07:30:00.000Z",
  serviceId: "svc",
  variantId: null,
  staffId: "st",
  serviceName: "Gel",
  staffName: "An",
  priceMinor: 100_000,
  priceMaxMinor: null,
  status: "confirmed",
};
const ports = (o: Partial<BotPorts> = {}): BotPorts => ({
  salon: { name: "Lotus", timeZone: "Asia/Ho_Chi_Minh", hideStaffChoice: true },
  customer: { name: "Mai", phone: "+84901234567" },
  services: () =>
    Promise.resolve([
      {
        id: "svc",
        name: "Gel",
        priceMinor: 100_000,
        priceMaxMinor: null,
        durationMinutes: 30,
        variants: [],
      },
    ]),
  staffFor: () => Promise.resolve([]),
  days: () => Promise.resolve(["2026-12-02"]),
  slots: () => Promise.resolve(["2026-12-02T07:30:00.000Z"]),
  upcoming: () => Promise.resolve([booking]),
  book: () => Promise.resolve({ ok: true as const, pending: false, booking }),
  cancel: () => Promise.resolve("ok" as const),
  reschedule: () => Promise.resolve({ ok: true as const, booking }),
  confirmAttendance: () => Promise.resolve("ok" as const),
  explainNoDays: () =>
    Promise.resolve({ reason: "fully_booked" as const, windowDays: 60, earliest: [] }),
  ...o,
});
const { t } = createI18n("vi");
const run = (s: BotState | null, input: BotInput, p: BotPorts) =>
  runBot(s, input, p, {
    now: NOW,
    newId: () => crypto.randomUUID(),
    locale: "vi",
    t: (k, v) => t(`zalo:${k}`, v ?? {}),
  });
const confirmState: BotState = {
  v: 1,
  seq: 4,
  step: {
    name: "confirm",
    sel: { serviceId: "svc", variantId: null, staffId: null },
    startsAt: "2026-12-02T07:30:00.000Z",
  },
  options: ["confirm", "change", "abort"],
  items: 0,
  at: NOW.toISOString(),
};
const buttons = (r: BotResult) => {
  const last = r.replies.at(-1);
  return last?.kind === "text" ? last.buttons.map((b) => b.title) : [];
};

async function expectRestartable(r: BotResult, p: BotPorts) {
  expect(buttons(r)).toEqual(expect.arrayContaining(["Đặt lịch lại", "Menu"]));
  expect(r.state.step.name).toBe("idle");
  const again = await run(r.state, { kind: "payload", payload: globalPayload("book") }, p);
  expect(again.state.step.name).toBe("service");
  const menu = await run(r.state, { kind: "text", text: "menu" }, p);
  expect(buttons(menu)).toEqual(["Đặt lịch", "Lịch hẹn của tôi", "Gặp nhân viên"]);
  const hi = await run(r.state, { kind: "text", text: "xin chào" }, p);
  expect(buttons(hi)[0]).toBe("Đặt lịch");
}

describe("terminal messages always lead back into the flow", () => {
  it("hand-off (asked for staff)", async () => {
    const p = ports();
    const r = await run(null, { kind: "payload", payload: globalPayload("staff") }, p);
    expect(r.effects).toContainEqual({ type: "handoff" });
    await expectRestartable(r, p);
  });

  it("salon has no bookable services (the owner's case)", async () => {
    const p = ports({ services: () => Promise.resolve([]) });
    const r = await run(null, { kind: "payload", payload: globalPayload("book") }, p);
    expect(r.effects).toContainEqual({ type: "handoff" });
    expect(buttons(r)).toEqual(expect.arrayContaining(["Đặt lịch lại", "Menu"]));
    expect((await run(r.state, { kind: "text", text: "menu" }, p)).replies.length).toBeGreaterThan(
      0,
    );
  });

  it("no free slot in the next 7 days", async () => {
    const p = ports({ days: () => Promise.resolve([]) });
    const r = await run(null, { kind: "payload", payload: globalPayload("book") }, p);
    const picked = await run(
      r.state,
      { kind: "payload", payload: `gg|${String(r.state.seq)}|0` },
      p,
    );
    expect(buttons(picked)).toEqual(["Gặp nhân viên", "Đặt lịch lại", "Menu"]);
    await expectRestartable(picked, p);
  });

  it("booking refused by the engine (failed) and active-booking limit", async () => {
    const failed = ports({
      book: () => Promise.resolve({ ok: false as const, reason: "failed" as const }),
    });
    await expectRestartable(
      await run(confirmState, { kind: "payload", payload: "gg|4|0" }, failed),
      failed,
    );
    const limit = ports({
      book: () => Promise.resolve({ ok: false as const, reason: "limit_reached" as const }),
    });
    const r = await run(confirmState, { kind: "payload", payload: "gg|4|0" }, limit);
    expect(r.effects).not.toContainEqual({ type: "handoff" });
    expect(buttons(r)).toEqual(["Lịch hẹn của tôi", "Đặt lịch lại", "Menu"]);
    await expectRestartable(r, limit);
  });

  it("slot taken at confirm keeps the flow; menu still works", async () => {
    const p = ports({
      book: () => Promise.resolve({ ok: false as const, reason: "slot_taken" as const }),
    });
    const r = await run(confirmState, { kind: "payload", payload: "gg|4|0" }, p);
    expect(r.state.step.name).toBe("time");
    const menu = await run(r.state, { kind: "text", text: "menu" }, p);
    expect(buttons(menu)[0]).toBe("Đặt lịch");
  });

  it("cancel at confirm returns to the menu", async () => {
    const p = ports();
    const r = await run(confirmState, { kind: "payload", payload: "gg|4|2" }, p);
    expect(buttons(r)[0]).toBe("Đặt lịch");
  });

  it("booked, cancelled, rescheduled, attendance confirmed, cancel too late", async () => {
    const p = ports();
    await expectRestartable(await run(confirmState, { kind: "payload", payload: "gg|4|0" }, p), p);
    const ask = await run(null, { kind: "payload", payload: bookingPayload("cancel", ID) }, p);
    await expectRestartable(
      await run(ask.state, { kind: "payload", payload: `gg|${String(ask.state.seq)}|0` }, p),
      p,
    );
    const days = await run(null, { kind: "payload", payload: bookingPayload("resched", ID) }, p);
    const times = await run(
      days.state,
      { kind: "payload", payload: `gg|${String(days.state.seq)}|0` },
      p,
    );
    await expectRestartable(
      await run(times.state, { kind: "payload", payload: `gg|${String(times.state.seq)}|0` }, p),
      p,
    );
    await expectRestartable(
      await run(null, { kind: "payload", payload: bookingPayload("confirm", ID) }, p),
      p,
    );
    const late = ports({ cancel: () => Promise.resolve("too_late" as const) });
    const ask2 = await run(null, { kind: "payload", payload: bookingPayload("cancel", ID) }, late);
    await expectRestartable(
      await run(ask2.state, { kind: "payload", payload: `gg|${String(ask2.state.seq)}|0` }, late),
      late,
    );
  });
});
