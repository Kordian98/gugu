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

/** Zalo bot: an optional second service (booking engine M6.8, at most two in the bot). */

const NOW = new Date("2026-12-01T03:00:00Z");
const BOOKING: BotBooking = {
  id: "0194c2a0-0000-7000-8000-000000000001",
  ref: "AB12CD",
  startsAt: "2026-12-02T07:30:00.000Z",
  serviceId: "svc-gel",
  variantId: null,
  second: { serviceId: "svc-pedi", variantId: null },
  staffId: "st-an",
  serviceName: "Gel nails + Pedicure",
  staffName: "An",
  priceMinor: 450_000,
  priceMaxMinor: null,
  status: "confirmed",
};

function ports(multiService: boolean) {
  const seen: { days: Selection[]; book: Selection[] } = { days: [], book: [] };
  const p: BotPorts = {
    salon: {
      name: "Lotus Nails",
      timeZone: "Asia/Ho_Chi_Minh",
      hideStaffChoice: false,
      multiService,
    },
    customer: { name: "Mai", phone: "+84901234567" },
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
          id: "svc-pedi",
          name: "Pedicure",
          priceMinor: 200_000,
          priceMaxMinor: null,
          durationMinutes: 45,
          variants: [],
        },
        {
          id: "svc-hair",
          name: "Haircut",
          priceMinor: 150_000,
          priceMaxMinor: null,
          durationMinutes: 45,
          variants: [
            {
              id: "var-long",
              name: "Long",
              priceMinor: 300_000,
              priceMaxMinor: 350_000,
              durationMinutes: 60,
            },
          ],
        },
      ]),
    staffFor: () => Promise.resolve([{ id: "st-an", name: "An" }]),
    days: (sel) => {
      seen.days.push(sel);
      return Promise.resolve(["2026-12-02"]);
    },
    slots: () => Promise.resolve(["2026-12-02T07:30:00.000Z"]),
    explainNoDays: () => Promise.resolve({ reason: "fully_booked", windowDays: 60, earliest: [] }),
    upcoming: () => Promise.resolve([BOOKING]),
    book: (sel, startsAt) => {
      seen.book.push(sel);
      return Promise.resolve({ ok: true, pending: false, booking: { ...BOOKING, startsAt } });
    },
    cancel: () => Promise.resolve("ok"),
    reschedule: (_id, startsAt) => Promise.resolve({ ok: true, booking: { ...BOOKING, startsAt } }),
    confirmAttendance: () => Promise.resolve("ok"),
  };
  return { p, seen };
}

const { t } = createI18n("vi");
const deps = {
  now: NOW,
  newId: () => crypto.randomUUID(),
  t: (k: string, v?: Record<string, string | number>) => t(`zalo:${k}`, v ?? {}),
  locale: "vi" as const,
};
const step = (s: BotState | null, input: BotInput, p: BotPorts) => runBot(s, input, p, deps);
const last = (r: BotResult): Extract<BotReply, { kind: "text" }> => {
  const reply = r.replies.at(-1);
  if (reply?.kind !== "text") throw new Error("expected a text reply");
  return reply;
};
const tap = (r: BotResult, title: string): BotInput => {
  const b = last(r).buttons.find((x) => x.title === title);
  if (!b) throw new Error(`no button "${title}" in ${JSON.stringify(last(r).buttons)}`);
  return { kind: "payload", payload: b.payload };
};

describe("Zalo bot: second service (M6.8)", () => {
  it("offers a second service, books both and shows both in the summary", async () => {
    const { p, seen } = ports(true);
    let r = await step(null, { kind: "payload", payload: globalPayload("book") }, p);
    r = await step(r.state, tap(r, "Gel nails"), p);
    expect(r.state.step.name).toBe("add_more");
    expect(last(r).buttons.map((b) => b.title)).toEqual(["Thêm dịch vụ", "Không, chọn ngày"]);
    r = await step(r.state, tap(r, "Thêm dịch vụ"), p);
    // The first service is not offered again.
    expect(last(r).buttons.map((b) => b.title)).toEqual(["Pedicure", "Haircut"]);
    r = await step(r.state, { kind: "text", text: "1" }, p);
    expect(r.state.step).toMatchObject({
      name: "day",
      sel: { serviceId: "svc-gel", second: { serviceId: "svc-pedi", variantId: null } },
    });
    expect(seen.days.at(-1)?.second?.serviceId).toBe("svc-pedi");
    r = await step(r.state, tap(r, "Thứ 4, 02/12"), p);
    r = await step(r.state, tap(r, "14:30"), p);
    expect(r.state.step.name).toBe("confirm");
    expect(last(r).text).toContain("Gel nails + Pedicure");
    expect(last(r).text).toContain("450.000đ");
    r = await step(r.state, tap(r, "Xác nhận"), p);
    expect(seen.book).toHaveLength(1);
    expect(seen.book[0]?.second).toEqual({ serviceId: "svc-pedi", variantId: null });
  });

  it("asks for the second service's variant; price becomes a range", async () => {
    const { p } = ports(true);
    let r = await step(null, { kind: "payload", payload: globalPayload("book") }, p);
    r = await step(r.state, tap(r, "Gel nails"), p);
    r = await step(r.state, tap(r, "Thêm dịch vụ"), p);
    r = await step(r.state, tap(r, "Haircut"), p);
    expect(r.state.step.name).toBe("variant2");
    r = await step(r.state, tap(r, "Long"), p);
    expect(r.state.step).toMatchObject({ sel: { second: { variantId: "var-long" } } });
    r = await step(r.state, tap(r, "Thứ 4, 02/12"), p);
    r = await step(r.state, tap(r, "14:30"), p);
    expect(last(r).text).toContain("Gel nails + Haircut (Long)");
    expect(last(r).text).toMatch(/550\.000đ\s*[–-]\s*600\.000đ/);
  });

  it("skipping goes straight to days with one service", async () => {
    const { p } = ports(true);
    let r = await step(null, { kind: "payload", payload: globalPayload("book") }, p);
    r = await step(r.state, tap(r, "Gel nails"), p);
    r = await step(r.state, tap(r, "Không, chọn ngày"), p);
    expect(r.state.step).toMatchObject({ name: "day", sel: { serviceId: "svc-gel" } });
    expect((r.state.step as { sel: Selection }).sel.second).toBeUndefined();
  });

  it("flag off: no second-service question (single service as before)", async () => {
    const { p } = ports(false);
    let r = await step(null, { kind: "payload", payload: globalPayload("book") }, p);
    r = await step(r.state, tap(r, "Gel nails"), p);
    expect(r.state.step.name).toBe("day");
  });

  it("rescheduling a two-service booking keeps both services", async () => {
    const { p, seen } = ports(true);
    const r = await step(
      null,
      { kind: "payload", payload: bookingPayload("resched", BOOKING.id) },
      p,
    );
    expect(r.state.step).toMatchObject({ name: "day", rescheduleId: BOOKING.id });
    expect(seen.days.at(-1)?.second).toEqual({ serviceId: "svc-pedi", variantId: null });
  });

  it("a chain of three or more services (CRM-booked) goes to the salon, not the bot", async () => {
    const { p, seen } = ports(true);
    const rescheduled: string[] = [];
    const withChain: BotPorts = {
      ...p,
      upcoming: () => Promise.resolve([{ ...BOOKING, serviceCount: 3 }]),
      reschedule: (id, startsAt) => {
        rescheduled.push(id);
        return p.reschedule(id, startsAt);
      },
    };
    const r = await step(
      null,
      { kind: "payload", payload: bookingPayload("resched", BOOKING.id) },
      withChain,
    );
    const texts = r.replies.flatMap((x) => (x.kind === "text" ? [x.text] : []));
    expect(texts).toContain(t("zalo:bot.rescheduleContactSalon"));
    expect(r.effects).toContainEqual({ type: "handoff" });
    expect(r.state.step.name).toBe("idle");
    expect(seen.days).toHaveLength(0);
    expect(rescheduled).toHaveLength(0);
  });
});
