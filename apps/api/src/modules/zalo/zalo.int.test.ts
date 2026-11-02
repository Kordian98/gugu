// Integration against the local stack + the built-in Zalo emulator (topic 09, X24): connect an OA,
// chat with the booking bot, book, get a reminder, cancel from the reminder button; windows, quotas,
// hand-off, token refresh, signatures, idempotency, disconnect and tenant isolation.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { zaloConnectionSchema, zaloConversationListSchema, zaloStatsSchema } from "@gugu/contracts";
import { createBookableSalon, type BookableSalonFixture } from "../../../test/factories/booking";
import { bearerFor, createSalonFixture } from "../../../test/factories/identity";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { AppConfig } from "../../infrastructure/config/app-config";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../infrastructure/queue/queue.service";
import { QUEUES } from "../../infrastructure/queue/queues";
import { BookingClock } from "../bookings/bookings.facade";
import { SubscriptionsFacade } from "../subscriptions/subscriptions.facade";
import { InboundService } from "./application/inbound.service";
import { OutboundService } from "./application/outbound.service";
import { ZaloClock } from "./application/zalo-clock";
import { ZaloJobs } from "./application/zalo-jobs";
import { computeZaloSignature } from "./domain/signature";
import { ZaloEmulatorController, type EmulatorEvent } from "./emulator/emulator.controller";
import { EMULATOR_APP_ID, EmulatorStore, type OutboxEntry } from "./emulator/emulator-store";
import { ZaloWorkerModule } from "./zalo.module";

let now = new Date("2026-12-01T01:00:00Z"); // 08:00 in Ho Chi Minh City
const clock = { now: () => new Date(now) };
const advance = (ms: number) => (now = new Date(now.getTime() + ms));
const HOUR = 3_600_000;

describe("Zalo integration (emulator, end to end)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: EmulatorStore;
  let emulator: ZaloEmulatorController;
  let s: BookableSalonFixture;
  let owner: string;
  let oaId: string;
  let userId: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    process.env["ZALO_CLIENT"] = "emulated";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ZaloWorkerModule] })
      .overrideProvider(ZaloClock)
      .useValue(clock)
      .overrideProvider(BookingClock)
      .useValue(clock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication({ rawBody: true }));
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
    store = app.get(EmulatorStore);
    EmulatorStore.webhookUrl = `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
    emulator = app.get(ZaloEmulatorController);
  });

  afterAll(async () => {
    await app.get(QueueService).queue(QUEUES.zalo).obliterate({ force: true });
    await app.close();
  });

  beforeEach(async () => {
    now = new Date("2026-12-01T01:00:00Z");
    s = await createBookableSalon(prisma);
    await app.get(SubscriptionsFacade).startTrial({ salonId: s.salonId });
    owner = await bearerFor(app, s.ownerUserId);
    oaId = `oa_${Math.random().toString(36).slice(2, 10)}`;
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
  });

  const http = () => request(app.getHttpServer() as Server);
  const base = () => `/api/v1/salons/${s.salonId}/zalo`;

  /** Runs the worker side inline: pending webhook events, then queued sends, until quiet. */
  async function drain(): Promise<void> {
    for (let round = 0; round < 5; round++) {
      const events = await prisma.zaloWebhookEvent.findMany({
        where: { status: "received" },
        orderBy: { receivedAt: "asc" },
      });
      for (const e of events) await app.get(InboundService).process(e.id);
      const logs = await prisma.zaloSendLog.findMany({
        where: { status: "queued" },
        orderBy: { createdAt: "asc" },
      });
      for (const l of logs) await app.get(OutboundService).processBatch(l.salonId, [l.id], true);
      if (events.length === 0 && logs.length === 0) return;
    }
  }

  async function connect(): Promise<void> {
    const start = await http()
      .post(`${base()}/connection/start`)
      .set("authorization", owner)
      .send({ locale: "vi" })
      .expect(200);
    const authorize = new URL((start.body as { authorizeUrl: string }).authorizeUrl);
    expect(authorize.pathname).toBe("/api/v1/dev/zalo-emulator/oauth/permission");
    const consent = await http()
      .get("/api/v1/dev/zalo-emulator/oauth/approve")
      .query({
        redirect_uri: authorize.searchParams.get("redirect_uri"),
        code_challenge: authorize.searchParams.get("code_challenge"),
        state: authorize.searchParams.get("state"),
        oa_id: oaId,
        oa_name: "Lotus Nails",
        decision: "allow",
      })
      .expect(302);
    const back = new URL(consent.headers["location"] as string);
    const done = await http().get(`${back.pathname}${back.search}`).expect(302);
    expect(done.headers["location"]).toContain("zalo=connected");
  }

  async function say(event: Omit<EmulatorEvent, "oaId" | "userId">): Promise<OutboxEntry[]> {
    const before = (await store.outbox(oaId, userId)).length;
    const res = await emulator.deliver({ oaId, userId, ...event });
    expect(res.status).toBe(200);
    await drain();
    return (await store.outbox(oaId, userId)).slice(before);
  }

  const lastText = (out: OutboxEntry[]) => {
    const m = out.at(-1)?.message;
    if (m?.kind !== "text") throw new Error(`expected a text message, got ${JSON.stringify(out)}`);
    return m;
  };
  async function tap(out: OutboxEntry[], title: string): Promise<OutboxEntry[]> {
    const button = lastText(out).buttons.find((b) => b.title === title);
    if (!button) throw new Error(`no "${title}" in ${JSON.stringify(lastText(out).buttons)}`);
    return say({ event: "user_send_text", text: button.payload });
  }

  async function bookViaBot(): Promise<string> {
    let out = await say({ event: "follow", name: "Mai" });
    expect(lastText(out).text).toContain("Booking Salon");
    out = await tap(out, "Đặt lịch");
    out = await tap(out, "Sơn gel");
    out = await tap(out, "Dài");
    out = await tap(out, "Ai cũng được");
    out = await tap(out, "Thứ 4, 02/12");
    // Many free times: pick the part of the day first, then the time.
    const morning = lastText(out).buttons.find((b) => b.title.startsWith("Sáng"));
    expect(morning).toBeDefined();
    out = await say({ event: "user_send_text", text: morning?.payload ?? "" });
    out = await tap(out, "09:00");
    expect(out.some((e) => e.message?.kind === "request_info")).toBe(true);
    out = await say({ event: "user_submit_info", name: "Mai", phone: "0901234567" });
    expect(lastText(out).text).toContain("Sơn gel (Dài)");
    out = await tap(out, "Xác nhận");
    const booking = await prisma.booking.findFirstOrThrow({ where: { salonId: s.salonId } });
    expect(out.map((e) => e.message?.kind === "text" && e.message.text).join("\n")).toContain(
      booking.referenceCode,
    );
    return booking.id;
  }

  it("connects an OA, books through the bot, reminds 24 h ahead and cancels from the reminder", async () => {
    await connect();
    const status = zaloConnectionSchema.parse(
      (await http().get(`${base()}/connection`).set("authorization", owner).expect(200)).body,
    );
    expect(status).toMatchObject({
      mode: "emulated",
      status: "connected",
      oaId,
      oaName: "Lotus Nails",
    });
    const row = await prisma.zaloOaConnection.findUniqueOrThrow({ where: { salonId: s.salonId } });
    expect(row.accessTokenEnc).toMatch(/^v1\./);

    const bookingId = await bookViaBot();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking).toMatchObject({
      source: "zalo_oa",
      status: "confirmed",
      customerPhoneE164: "+84901234567",
    });
    expect(booking.startsAt.toISOString()).toBe("2026-12-02T02:00:00.000Z");
    expect(await prisma.zaloBookingLink.count({ where: { bookingId } })).toBe(1);
    expect(
      await prisma.zaloStaffNotification.count({
        where: { salonId: s.salonId, kind: "booking_created" },
      }),
    ).toBe(1);

    // 23.5 h before the appointment: the 24 h reminder goes out as a chat message with buttons.
    now = new Date("2026-12-01T02:30:00Z");
    await app.get(ZaloJobs).minute();
    await drain();
    const reminder = lastText(await store.outbox(oaId, userId));
    expect(reminder.text).toContain("Nhắc lịch");
    expect(reminder.buttons.map((b) => b.title)).toEqual(["Tôi sẽ đến", "Đổi giờ", "Hủy"]);
    await app.get(ZaloJobs).minute(); // a second scan never sends twice
    await drain();
    expect(await prisma.zaloSendLog.count({ where: { purpose: "reminder_24h", bookingId } })).toBe(
      1,
    );

    let out = await tap([{ message: reminder } as OutboxEntry], "Hủy");
    out = await tap(out, "Có, hủy lịch");
    expect(lastText(out).text).toContain("Đã hủy");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe(
      "cancelled_by_customer",
    );
    expect(
      await prisma.zaloStaffNotification.count({
        where: { salonId: s.salonId, kind: "booking_cancelled" },
      }),
    ).toBe(1);

    const log = await http().get(`${base()}/send-log`).set("authorization", owner).expect(200);
    expect(
      (log.body as { items: { status: string }[] }).items.every((i) => i.status === "sent"),
    ).toBe(true);
  });

  it("regression: after a refusal + hand-off, a greeting or 'Đặt lịch' restarts the bot", async () => {
    await connect();
    await prisma.service.updateMany({ where: { salonId: s.salonId }, data: { isActive: false } });
    let out = await say({ event: "follow" });
    out = await tap(out, "Đặt lịch");
    expect(lastText(out).text).toContain("Nhân viên sẽ trả lời");
    expect(lastText(out).buttons.map((b) => b.title)).toEqual(["Đặt lịch lại", "Menu"]);
    out = await say({ event: "user_send_text", text: "xin chào" });
    expect(lastText(out).buttons[0]?.title).toBe("Đặt lịch");
    const conv = await prisma.zaloConversation.findFirstOrThrow({ where: { salonId: s.salonId } });
    expect(conv.mode).toBe("bot");
    await prisma.service.updateMany({ where: { salonId: s.salonId }, data: { isActive: true } });
    out = await tap(out, "Đặt lịch");
    expect(lastText(out).buttons[0]?.title).toBe("Sơn gel");
  });

  it("after an explicit staff take-over, 'menu' shows a notice and 'Quay lại trợ lý' resumes the bot", async () => {
    await connect();
    await say({ event: "follow" });
    const conv = await prisma.zaloConversation.findFirstOrThrow({ where: { salonId: s.salonId } });
    await http()
      .post(`${base()}/conversations/${conv.id}/take-over`)
      .set("authorization", owner)
      .expect(204);
    let out = await say({ event: "user_send_text", text: "menu" });
    expect(lastText(out).text).toContain("Nhân viên của salon đang trò chuyện");
    out = await say({ event: "user_send_text", text: "cảm ơn" });
    expect(out).toHaveLength(0);
    out = await say({ event: "user_send_text", text: "gg|g|bot" });
    expect(lastText(out).buttons[0]?.title).toBe("Đặt lịch");
    expect((await prisma.zaloConversation.findUniqueOrThrow({ where: { id: conv.id } })).mode).toBe(
      "bot",
    );
  });

  it("lists a waiting customer in 'needs attention' and auto-releases to the bot after the quiet time", async () => {
    await connect();
    let out = await say({ event: "follow" });
    out = await tap(out, "Gặp nhân viên");
    await say({ event: "user_send_text", text: "Cho mình hỏi giá nhuộm" });
    const attention = (
      await http().get(`${base()}/attention`).set("authorization", owner).expect(200)
    ).body as {
      waiting: number;
      items: { lastMessages: { text: string | null }[]; assigned: boolean }[];
    };
    expect(attention.waiting).toBe(1);
    expect(attention.items[0]?.assigned).toBe(false);
    expect(attention.items[0]?.lastMessages.map((m) => m.text)).toContain("Cho mình hỏi giá nhuộm");

    advance(31 * 60_000);
    await app.get(ZaloJobs).minute();
    const conv = await prisma.zaloConversation.findFirstOrThrow({ where: { salonId: s.salonId } });
    expect(conv).toMatchObject({ mode: "bot", staffNoticeAt: null, handoffRequestedAt: null });
    expect(
      await prisma.zaloMessage.count({ where: { conversationId: conv.id, kind: "auto_released" } }),
    ).toBe(1);
    expect(
      (
        (await http().get(`${base()}/attention`).set("authorization", owner)).body as {
          waiting: number;
        }
      ).waiting,
    ).toBe(0);
    out = await say({ event: "user_send_text", text: "alo" });
    expect(lastText(out).buttons[0]?.title).toBe("Đặt lịch");
  });

  it("counts the Zalo funnel: bookings, abandoned attempts (inactivity sweep), hand-offs, reasons", async () => {
    await connect();
    const main = userId;
    await bookViaBot(); // customer 1: books

    // customer 2: starts, picks the service, then goes silent.
    userId = `${main}-b`;
    let out = await say({ event: "follow" });
    out = await tap(out, "Đặt lịch");
    await tap(out, "Sơn gel");
    // customer 3: asks for staff straight away (no booking attempt).
    userId = `${main}-c`;
    await say({ event: "user_send_text", text: "cho mình gặp nhân viên" });
    // customer 4: starts, types something the bot doesn't understand, then leaves.
    userId = `${main}-d`;
    await say({ event: "user_send_text", text: "đặt lịch" });
    await say({ event: "user_send_text", text: "bao nhiêu tiền vậy" });
    userId = main;

    advance(31 * 60_000);
    await app.get(ZaloJobs).minute(); // closes the two silent attempts as abandoned

    const res = await http()
      .get(`${base()}/stats?from=2026-12-01&to=2026-12-01`)
      .set("authorization", owner)
      .expect(200);
    const stats = zaloStatsSchema.parse(res.body);
    expect(stats.contacts).toMatchObject({
      uniqueCustomers: 4,
      newFollowers: 2,
      conversationsStarted: 4,
    });
    expect(stats.funnel).toMatchObject({ sessions: 3, bookings: 1, inProgress: 0 });
    expect(stats.funnel.conversionRate).toBeCloseTo(1 / 3, 3);
    expect(stats.funnel.steps.map((x) => [x.step, x.reached])).toEqual([
      ["service", 3],
      ["staff", 1], // customer 2 stopped at the variant choice (part of the service step)
      ["slot", 1],
      ["phone", 1],
      ["confirm", 1],
    ]);
    expect(stats.lostReasons).toEqual(
      expect.arrayContaining([
        { reason: "abandoned:service", count: 1 },
        { reason: "not_understood", count: 1 },
      ]),
    );
    expect(stats.notUnderstood).toBe(1);
    expect(stats.staff.handoffs).toBe(1);
    expect(stats.costs.freeMessages).toBeGreaterThan(0);
    // Aggregates only: nothing in the payload names a customer.
    expect(JSON.stringify(stats)).not.toMatch(/Mai|0901234567|\+84/);

    // Staff without analytics.read can't see it; other salons get 404.
    const other = await createSalonFixture(prisma, "Other Salon");
    await http()
      .get(`/api/v1/salons/${s.salonId}/zalo/stats?from=2026-12-01&to=2026-12-01`)
      .set("authorization", await bearerFor(app, other.ownerUserId))
      .expect(404);
  });

  it("hands off to staff, acknowledges once, lets staff reply and release back to the bot", async () => {
    await connect();
    let out = await say({ event: "follow" });
    out = await tap(out, "Gặp nhân viên");
    expect(lastText(out).text).toContain("Nhân viên sẽ trả lời");
    out = await say({ event: "user_send_text", text: "Cho mình hỏi giá gội đầu" });
    // Never silently ignored: one notice with "back to the assistant", then quiet for staff.
    expect(lastText(out).text).toContain("Nhân viên của salon");
    expect(lastText(out).buttons.map((b) => b.title)).toEqual(["Quay lại trợ lý"]);
    out = await say({ event: "user_send_text", text: "Còn chỗ không ạ?" });
    expect(out).toHaveLength(0);

    const list = zaloConversationListSchema.parse(
      (
        await http()
          .get(`${base()}/conversations?filter=needs_staff`)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    const conv = list.items[0];
    expect(conv).toMatchObject({ mode: "staff", window: "free", unreadCount: 2, phone: null });
    await http()
      .post(`${base()}/conversations/${conv?.id ?? ""}/messages`)
      .set("authorization", owner)
      .send({ text: "Dạ 80.000đ ạ" })
      .expect(202);
    await drain();
    expect(lastText(await store.outbox(oaId, userId)).text).toBe("Dạ 80.000đ ạ");

    await http()
      .post(`${base()}/conversations/${conv?.id ?? ""}/release`)
      .set("authorization", owner)
      .expect(204);
    out = await say({ event: "user_send_text", text: "menu" });
    expect(lastText(out).buttons[0]?.title).toBe("Đặt lịch");
  });

  it("enforces the 48 h / 7 d window: paid after 48 h, closed after 7 d (staff reply 422, reminder by template)", async () => {
    await connect();
    await bookViaBot();
    const conv = await prisma.zaloConversation.findFirstOrThrow({ where: { salonId: s.salonId } });

    advance(3 * 24 * HOUR);
    await http()
      .post(`${base()}/conversations/${conv.id}/messages`)
      .set("authorization", owner)
      .send({ text: "Hi" })
      .expect(202);
    await drain();
    const paid = await prisma.zaloSendLog.findFirstOrThrow({
      where: { purpose: "staff_reply" },
      orderBy: { createdAt: "desc" },
    });
    expect(paid).toMatchObject({ status: "sent", tier: "paid", costEstimateVnd: 55 });

    advance(5 * 24 * HOUR);
    const closed = await http()
      .post(`${base()}/conversations/${conv.id}/messages`)
      .set("authorization", owner)
      .send({ text: "Hi again" })
      .expect(422);
    expect((closed.body as { code: string }).code).toBe("zalo.window_closed");

    // A staff-entered booking for this customer, reminded outside the window: template message.
    await http()
      .patch(`${base()}/settings`)
      .set("authorization", owner)
      .send({ templateIds: { booking_reminder: "tpl-rem-1", booking_confirmation: "tpl-conf-1" } })
      .expect(204);
    const start = new Date(now.getTime() + 20 * HOUR);
    const staffBooking = await prisma.booking.create({
      data: {
        salonId: s.salonId,
        referenceCode: "ZZ9999",
        status: "confirmed",
        source: "phone",
        createdByActorType: "salon_member",
        customerName: "Mai",
        customerPhoneE164: "+84901234567",
        staffId: s.staffIds[0],
        startsAt: start,
        endsAt: new Date(start.getTime() + HOUR),
        totalPriceMinor: 200_000n,
        createdAt: new Date(now.getTime() - 48 * HOUR),
      },
    });
    await prisma.bookingService.create({
      data: {
        salonId: s.salonId,
        bookingId: staffBooking.id,
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: start,
        endsAt: new Date(start.getTime() + HOUR),
        name: { vi: "Sơn gel", en: "Gel polish" },
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        priceMinor: 200_000n,
      },
    });
    await app.get(ZaloJobs).minute();
    await drain();
    const tpl = await prisma.zaloSendLog.findFirstOrThrow({
      where: { bookingId: staffBooking.id },
    });
    expect(tpl).toMatchObject({
      channel: "template",
      tier: "template",
      status: "sent",
      costEstimateVnd: 200,
    });
    const sent = (await store.outbox(oaId)).filter((e) => e.channel === "template").at(-1);
    expect(sent).toMatchObject({ templateId: "tpl-rem-1", phone: "+84901234567" });
    expect(sent?.data).toMatchObject({ booking_code: "ZZ9999", salon_name: "Booking Salon" });
  });

  it("rejects templates over the monthly cap and logs why", async () => {
    await connect();
    await bookViaBot();
    await http()
      .patch(`${base()}/settings`)
      .set("authorization", owner)
      .send({ monthlyTemplateCap: 0, templateIds: { booking_reminder: "tpl-rem-1" } })
      .expect(204);
    advance(9 * 24 * HOUR); // window closed
    const out = app.get(OutboundService);
    const conv = await prisma.zaloConversation.findFirstOrThrow({ where: { salonId: s.salonId } });
    const booking = await prisma.booking.findFirstOrThrow({ where: { salonId: s.salonId } });
    const [id] = await out.send(s.salonId, [
      {
        channel: "template",
        purpose: "reminder_24h",
        conversationId: conv.id,
        bookingId: booking.id,
        templateKey: "booking_reminder",
        phoneE164: "+84901234567",
        data: {
          customer_name: "Mai",
          booking_code: "X",
          service_name: "S",
          booking_time: "09:00",
          salon_name: "B",
        },
        previewText: "x",
        dedupKey: `cap-test-${userId}`,
      },
    ]);
    await drain();
    expect(await prisma.zaloSendLog.findUniqueOrThrow({ where: { id: id ?? "" } })).toMatchObject({
      status: "rejected",
      errorCode: "quota_exceeded",
    });
  });

  it("refreshes expired tokens, and moves to needs_reauth when Zalo rejects them", async () => {
    await connect();
    await say({ event: "follow" });
    const first = await prisma.zaloOaConnection.findUniqueOrThrow({
      where: { salonId: s.salonId },
    });
    advance(26 * HOUR); // emulated access tokens live 25 h
    await say({ event: "user_send_text", text: "menu" });
    const refreshed = await prisma.zaloOaConnection.findUniqueOrThrow({
      where: { salonId: s.salonId },
    });
    expect(refreshed.status).toBe("connected");
    expect(refreshed.accessTokenEnc).not.toBe(first.accessTokenEnc);
    expect(lastText(await store.outbox(oaId, userId)).buttons[0]?.title).toBe("Đặt lịch");

    await store.setFaults(oaId, { expireTokens: true });
    await say({ event: "user_send_text", text: "menu" });
    await store.setFaults(oaId, {});
    const broken = await prisma.zaloOaConnection.findUniqueOrThrow({
      where: { salonId: s.salonId },
    });
    expect(broken.status).toBe("needs_reauth");
    expect(
      await prisma.zaloStaffNotification.count({
        where: { salonId: s.salonId, kind: "connection_needs_reauth" },
      }),
    ).toBe(1);
  });

  it("retries transient Zalo failures with the queue's backoff and sends once", async () => {
    await connect();
    await store.setFaults(oaId, { failNext: 1 });
    await emulator.deliver({ oaId, userId, event: "follow" });
    const event = await prisma.zaloWebhookEvent.findFirstOrThrow({ where: { oaId } });
    await app.get(InboundService).process(event.id);
    const log = await prisma.zaloSendLog.findFirstOrThrow({ where: { salonId: s.salonId } });
    await expect(app.get(OutboundService).processBatch(s.salonId, [log.id], false)).rejects.toThrow(
      /503/,
    );
    expect(await prisma.zaloSendLog.findUniqueOrThrow({ where: { id: log.id } })).toMatchObject({
      status: "queued",
      attempts: 1,
    });
    await app.get(OutboundService).processBatch(s.salonId, [log.id], false);
    expect(await prisma.zaloSendLog.findUniqueOrThrow({ where: { id: log.id } })).toMatchObject({
      status: "sent",
      attempts: 2,
    });
    expect(await store.outbox(oaId, userId)).toHaveLength(1);
  });

  it("verifies signatures and stores each event once", async () => {
    await connect();
    const payload = JSON.stringify({
      app_id: EMULATOR_APP_ID,
      event_name: "user_send_text",
      timestamp: String(now.getTime()),
      sender: { id: userId },
      recipient: { id: oaId },
      message: { msg_id: `m-${userId}`, text: "xin chào" },
    });
    const post = (signature: string) =>
      http()
        .post("/api/v1/integrations/zalo/webhook")
        .set("content-type", "application/json")
        .set("x-zevent-signature", signature)
        .send(payload);
    await post("mac=" + "0".repeat(64)).expect(401);
    const mac = computeZaloSignature({
      appId: EMULATOR_APP_ID,
      rawBody: payload,
      timestamp: String(now.getTime()),
      secret: app.get(AppConfig).env.ZALO_OA_SECRET_KEY,
    });
    await post(`mac=${mac}`).expect(200);
    await post(`mac=${mac}`).expect(200);
    expect(await prisma.zaloWebhookEvent.count({ where: { oaId } })).toBe(1);
    await drain();
    expect(
      await prisma.zaloMessage.count({ where: { salonId: s.salonId, direction: "inbound" } }),
    ).toBe(1);
  });

  it("disconnect stops all messaging; other tenants cannot see the inbox", async () => {
    await connect();
    await say({ event: "follow" });
    const conv = await prisma.zaloConversation.findFirstOrThrow({ where: { salonId: s.salonId } });

    const other = await createSalonFixture(prisma, "Other Salon");
    const otherOwner = await bearerFor(app, other.ownerUserId);
    await http().get(`${base()}/conversations`).set("authorization", otherOwner).expect(404);
    await app.get(SubscriptionsFacade).startTrial({ salonId: other.salonId });
    await http()
      .get(`/api/v1/salons/${other.salonId}/zalo/conversations/${conv.id}/messages`)
      .set("authorization", otherOwner)
      .expect(404);

    await http().post(`${base()}/connection/disconnect`).set("authorization", owner).expect(204);
    const res = await emulator.deliver({ oaId, userId, event: "user_send_text", text: "menu" });
    expect(res.body).toEqual({ ok: true });
    await drain();
    expect(await prisma.zaloWebhookEvent.count({ where: { oaId, status: "received" } })).toBe(0);
    const row = await prisma.zaloOaConnection.findUniqueOrThrow({ where: { salonId: s.salonId } });
    expect(row).toMatchObject({
      status: "disconnected",
      accessTokenEnc: null,
      refreshTokenEnc: null,
    });
    expect(
      (await http().get(`${base()}/connection`).set("authorization", owner)).body,
    ).toMatchObject({
      status: "disconnected",
      oaId: null,
    });
  });
});
