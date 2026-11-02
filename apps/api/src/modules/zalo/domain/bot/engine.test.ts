import { createI18n } from "@gugu/localization";
import { describe, expect, it } from "vitest";
import { runBot } from "./engine";
import { bookingPayload, globalPayload } from "./payload";
import type {
  BotBooking,
  BotInput,
  BotPorts,
  BotReply,
  BotResult,
  BotState,
  Selection,
} from "./types";

const NOW = new Date("2026-12-01T03:00:00Z"); // 10:00 in Ho Chi Minh City
const SALON = { name: "Lotus Nails", timeZone: "Asia/Ho_Chi_Minh", hideStaffChoice: false };
const BOOKING_ID = "0194c2a0-0000-7000-8000-000000000001";

function fakePorts(overrides: Partial<BotPorts> = {}) {
  const calls: { book: unknown[]; cancel: string[]; reschedule: unknown[] } = {
    book: [],
    cancel: [],
    reschedule: [],
  };
  const booking: BotBooking = {
    id: BOOKING_ID,
    ref: "AB12CD",
    startsAt: "2026-12-02T07:30:00.000Z",
    serviceId: "svc-gel",
    variantId: null,
    staffId: "st-an",
    serviceName: "Gel nails",
    staffName: "An",
    priceMinor: 250_000,
    priceMaxMinor: null,
    status: "confirmed",
  };
  const ports: BotPorts = {
    salon: SALON,
    customer: { name: "Mai", phone: null },
    services: () =>
      Promise.resolve([
        {
          id: "svc-gel",
          name: "Gel nails",
          priceMinor: 250_000,
          priceMaxMinor: null,
          durationMinutes: 60,
          variants: [],
        },
        {
          id: "svc-hair",
          name: "Haircut",
          priceMinor: 150_000,
          priceMaxMinor: 300_000,
          durationMinutes: 45,
          variants: [
            {
              id: "var-short",
              name: "Short",
              priceMinor: 150_000,
              priceMaxMinor: null,
              durationMinutes: 30,
            },
            {
              id: "var-long",
              name: "Long",
              priceMinor: 300_000,
              priceMaxMinor: null,
              durationMinutes: 60,
            },
          ],
        },
      ]),
    staffFor: () =>
      Promise.resolve([
        { id: "st-an", name: "An" },
        { id: "st-binh", name: "Bình" },
      ]),
    days: () =>
      Promise.resolve(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]),
    slots: () =>
      Promise.resolve([
        "2026-12-02T07:00:00.000Z",
        "2026-12-02T07:30:00.000Z",
        "2026-12-02T08:00:00.000Z",
        "2026-12-02T08:30:00.000Z",
      ]),
    upcoming: () => Promise.resolve([booking]),
    book: (sel: Selection, startsAt: string, phone: string, name: string) => {
      calls.book.push({ sel, startsAt, phone, name });
      return Promise.resolve({
        ok: true as const,
        pending: false,
        booking: { ...booking, startsAt },
      });
    },
    cancel: (id: string) => {
      calls.cancel.push(id);
      return Promise.resolve("ok" as const);
    },
    reschedule: (id: string, startsAt: string) => {
      calls.reschedule.push({ id, startsAt });
      return Promise.resolve({ ok: true as const, booking: { ...booking, startsAt } });
    },
    confirmAttendance: () => Promise.resolve("ok" as const),
    ...overrides,
  };
  return { ports, calls };
}

const { t } = createI18n("vi");
const deps = (now = NOW) => ({
  now,
  t: (k: string, v?: Record<string, string | number>) => t(`zalo:${k}`, v ?? {}),
  locale: "vi" as const,
});

async function step(state: BotState | null, input: BotInput, ports: BotPorts, now = NOW) {
  return runBot(state, input, ports, deps(now));
}

const last = (r: BotResult): Extract<BotReply, { kind: "text" }> => {
  const reply = r.replies.at(-1);
  if (reply?.kind !== "text") throw new Error("expected a text reply");
  return reply;
};
const tap = (r: BotResult, title: string): BotInput => {
  const button = last(r).buttons.find((b) => b.title === title);
  if (!button) throw new Error(`no button "${title}" in ${JSON.stringify(last(r).buttons)}`);
  return { kind: "payload", payload: button.payload };
};
const allText = (r: BotResult) =>
  r.replies.map((x) => (x.kind === "text" ? x.text : `${x.title} ${x.subtitle}`)).join("\n");

describe("booking bot state machine", () => {
  it("greets a new follower as the salon, with the main menu", async () => {
    const { ports } = fakePorts();
    const r = await step(null, { kind: "follow" }, ports);
    expect(last(r).text).toContain("Lotus Nails");
    expect(last(r).text).toContain("Mai");
    expect(last(r).buttons.map((b) => b.title)).toEqual([
      "Đặt lịch",
      "Lịch hẹn của tôi",
      "Gặp nhân viên",
    ]);
    expect(allText(r)).not.toMatch(/gugu/i);
  });

  it("books end to end: service → staff → day → time → phone → confirm", async () => {
    const { ports, calls } = fakePorts();
    let r = await step(null, { kind: "text", text: "xin chào" }, ports);
    r = await step(r.state, tap(r, "Đặt lịch"), ports);
    expect(last(r).text).toContain("1. Gel nails · 250.000đ · 60 phút");
    r = await step(r.state, tap(r, "Gel nails"), ports);
    expect(last(r).buttons.map((b) => b.title)).toEqual(["An", "Bình", "Ai cũng được"]);
    r = await step(r.state, tap(r, "Ai cũng được"), ports);
    expect(r.state.step.name).toBe("day");
    expect(last(r).buttons).toHaveLength(5); // all 5 free days fit as buttons
    r = await step(r.state, { kind: "text", text: "2" }, ports); // typed number picks 02/12
    expect(r.state.step).toMatchObject({ name: "time", date: "2026-12-02" });
    expect(last(r).buttons.map((b) => b.title)).toEqual([
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "Ngày khác",
    ]);
    r = await step(r.state, tap(r, "14:30"), ports);
    expect(r.state.step.name).toBe("phone");
    expect(r.replies[0]?.kind).toBe("request_info");
    r = await step(r.state, { kind: "text", text: "0901 234 567" }, ports);
    expect(r.effects).toContainEqual({ type: "contact", phone: "+84901234567", name: null });
    expect(last(r).text).toContain("Gel nails");
    expect(last(r).text).toContain("Nhân viên bất kỳ");
    // Phone known from here on (the service persists it from the contact effect).
    ports.customer.phone = "+84901234567";
    r = await step(r.state, tap(r, "Xác nhận"), ports);
    expect(calls.book).toEqual([
      {
        sel: { serviceId: "svc-gel", variantId: null, staffId: null },
        startsAt: "2026-12-02T07:30:00.000Z",
        phone: "+84901234567",
        name: "Mai",
      },
    ]);
    expect(r.effects).toContainEqual({
      type: "notify",
      kind: "booking_created",
      bookingId: BOOKING_ID,
    });
    expect(allText(r)).toContain("AB12CD");
    expect(r.state.step.name).toBe("idle");
  });

  it("asks for a variant and accepts the shared-info form instead of a typed phone", async () => {
    const { ports } = fakePorts({ staffFor: () => Promise.resolve([{ id: "st-an", name: "An" }]) });
    let r = await step(null, { kind: "payload", payload: globalPayload("book") }, ports);
    r = await step(r.state, tap(r, "Haircut"), ports);
    expect(last(r).buttons.map((b) => b.title)).toEqual(["Short", "Long"]);
    r = await step(r.state, tap(r, "Long"), ports); // one staff → straight to days
    expect(r.state.step).toMatchObject({
      name: "day",
      sel: { variantId: "var-long", staffId: null },
    });
    r = await step(r.state, tap(r, "Thứ 4, 02/12"), ports);
    r = await step(r.state, tap(r, "15:00"), ports);
    r = await step(r.state, { kind: "user_info", phone: "84912345678", name: "Mai Anh" }, ports);
    expect(r.effects).toContainEqual({ type: "contact", phone: "+84912345678", name: "Mai Anh" });
    expect(r.state.step.name).toBe("confirm");
  });

  it("rejects an invalid phone and stays on the phone step", async () => {
    const { ports } = fakePorts();
    const state: BotState = {
      v: 1,
      seq: 3,
      step: {
        name: "phone",
        sel: { serviceId: "svc-gel", variantId: null, staffId: null },
        startsAt: "2026-12-02T07:00:00.000Z",
      },
      options: [],
      items: 0,
      at: NOW.toISOString(),
    };
    const r = await step(state, { kind: "text", text: "12345" }, ports);
    expect(allText(r)).toContain("chưa đúng");
    expect(r.state.step.name).toBe("phone");
  });

  it("offers other times when the slot was taken meanwhile", async () => {
    const { ports } = fakePorts({
      book: () => Promise.resolve({ ok: false as const, reason: "slot_taken" as const }),
    });
    ports.customer.phone = "+84901234567";
    const state: BotState = {
      v: 1,
      seq: 7,
      step: {
        name: "confirm",
        sel: { serviceId: "svc-gel", variantId: null, staffId: null },
        startsAt: "2026-12-02T07:00:00.000Z",
      },
      options: ["confirm", "change", "abort"],
      items: 0,
      at: NOW.toISOString(),
    };
    const r = await step(state, { kind: "payload", payload: "gg|7|0" }, ports);
    expect(allText(r)).toContain("vừa có người đặt");
    expect(r.state.step).toMatchObject({ name: "time", date: "2026-12-02" });
  });

  it("ignores taps on old messages and repeats the current step", async () => {
    const { ports, calls } = fakePorts();
    ports.customer.phone = "+84901234567";
    const state: BotState = {
      v: 1,
      seq: 9,
      step: {
        name: "confirm",
        sel: { serviceId: "svc-gel", variantId: null, staffId: null },
        startsAt: "2026-12-02T07:00:00.000Z",
      },
      options: ["confirm", "change", "abort"],
      items: 0,
      at: NOW.toISOString(),
    };
    const r = await step(state, { kind: "payload", payload: "gg|8|0" }, ports);
    expect(calls.book).toHaveLength(0);
    expect(r.state.step.name).toBe("confirm");
  });

  it("restarts at the menu after 30 minutes of silence", async () => {
    const { ports } = fakePorts();
    const state: BotState = {
      v: 1,
      seq: 2,
      step: { name: "service", page: 0 },
      options: ["svc:svc-gel"],
      items: 1,
      at: new Date(NOW.getTime() - 31 * 60_000).toISOString(),
    };
    const r = await step(state, { kind: "text", text: "1" }, ports);
    expect(r.state.step.name).toBe("idle");
  });

  it("hands off to staff on request and on unknown text keeps the flow", async () => {
    const { ports } = fakePorts();
    let r = await step(null, { kind: "text", text: "cho mình gặp nhân viên" }, ports);
    expect(r.effects).toEqual([{ type: "handoff" }]);
    r = await step(
      { ...r.state, step: { name: "service", page: 0 } },
      { kind: "text", text: "giá bao nhiêu vậy" },
      ports,
    );
    expect(allText(r)).toContain("chưa hiểu");
    expect(r.state.step.name).toBe("service");
  });

  it("cancels, reschedules and confirms attendance from my bookings / reminder buttons", async () => {
    const { ports, calls } = fakePorts();
    let r = await step(null, { kind: "payload", payload: globalPayload("mine") }, ports);
    expect(last(r).text).toContain("AB12CD");
    r = await step(r.state, tap(r, "Hủy AB12CD"), ports);
    r = await step(r.state, tap(r, "Có, hủy lịch"), ports);
    expect(calls.cancel).toEqual([BOOKING_ID]);
    expect(r.effects).toContainEqual({
      type: "notify",
      kind: "booking_cancelled",
      bookingId: BOOKING_ID,
    });

    r = await step(
      null,
      { kind: "payload", payload: bookingPayload("resched", BOOKING_ID) },
      ports,
    );
    expect(r.state.step).toMatchObject({
      name: "day",
      rescheduleId: BOOKING_ID,
      sel: { staffId: "st-an" },
    });
    r = await step(r.state, tap(r, "Thứ 4, 02/12"), ports);
    r = await step(r.state, tap(r, "15:00"), ports);
    expect(calls.reschedule).toEqual([{ id: BOOKING_ID, startsAt: "2026-12-02T08:00:00.000Z" }]);
    expect(r.effects).toContainEqual({
      type: "notify",
      kind: "booking_rescheduled",
      bookingId: BOOKING_ID,
    });

    r = await step(
      null,
      { kind: "payload", payload: bookingPayload("confirm", BOOKING_ID) },
      ports,
    );
    expect(r.effects).toContainEqual({
      type: "notify",
      kind: "booking_confirmed",
      bookingId: BOOKING_ID,
    });
  });

  it("hands off when cancelling is too late", async () => {
    const { ports } = fakePorts({ cancel: () => Promise.resolve("too_late" as const) });
    const r = await step(
      {
        v: 1,
        seq: 1,
        step: { name: "cancel_confirm", bookingId: BOOKING_ID },
        options: ["cancelyes", "cancelno"],
        items: 0,
        at: NOW.toISOString(),
      },
      { kind: "payload", payload: "gg|1|0" },
      ports,
    );
    expect(r.effects).toContainEqual({ type: "handoff" });
  });

  it("speaks English when the salon bot locale is en", async () => {
    const { ports } = fakePorts();
    const en = createI18n("en");
    const r = await runBot(null, { kind: "follow" }, ports, {
      now: NOW,
      locale: "en",
      t: (k, v) => en.t(`zalo:${k}`, v ?? {}),
    });
    expect(last(r).buttons.map((b) => b.title)).toEqual([
      "Book",
      "My appointments",
      "Talk to staff",
    ]);
  });
});
