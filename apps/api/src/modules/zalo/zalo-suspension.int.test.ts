// Salon suspended by GuGu (q89, ADR-0010) on the Zalo side, against the local stack and the
// built-in emulator (TEST_DATABASE_URL only): the bot stops booking and answers once per 24 h
// with a neutral "contact the salon" notice (no GuGu, no links), webhooks are still stored, the
// inbox stays readable while staff replies are refused, queued sends and ZBS templates are skipped
// at send time, reminders are skipped and still go out after unsuspend while due. Two salons: the
// other salon's bot keeps working.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  problemSchema,
  SALON_SUSPENDED_ERROR,
  zaloConversationListSchema,
  zaloMessageListSchema,
} from "@gugu/contracts";
import { createBookableSalon, type BookableSalonFixture } from "../../../test/factories/booking";
import { bearerFor, testEmail } from "../../../test/factories/identity";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../infrastructure/queue/queue.service";
import { QUEUES } from "../../infrastructure/queue/queues";
import { BookingClock } from "../bookings/bookings.facade";
import { SubscriptionsFacade } from "../subscriptions/subscriptions.facade";
import { InboundService } from "./application/inbound.service";
import { InboxService } from "./application/inbox.service";
import { OutboundService } from "./application/outbound.service";
import { ZaloClock } from "./application/zalo-clock";
import { ZaloJobs } from "./application/zalo-jobs";
import { ZaloEmulatorController, type EmulatorEvent } from "./emulator/emulator.controller";
import { EmulatorStore, type OutboxEntry } from "./emulator/emulator-store";
import { ZaloWorkerModule } from "./zalo.module";

let now = new Date("2026-12-01T01:00:00Z"); // 08:00 in Ho Chi Minh City
const clock = { now: () => new Date(now) };
const HOUR = 3_600_000;

interface Tenant {
  s: BookableSalonFixture;
  owner: string;
  oaId: string;
  userId: string;
}

describe("Zalo on a suspended salon (q89, emulator, end to end)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: EmulatorStore;
  let emulator: ZaloEmulatorController;
  let admin: string;
  let a: Tenant;

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
    await clearRateLimits(app);
    const user = await prisma.user.create({
      data: {
        email: testEmail("zalo-susp-admin"),
        emailVerifiedAt: new Date(),
        platformRole: "super_admin",
        profile: { create: {} },
      },
    });
    admin = await bearerFor(app, user.id);
  });

  afterAll(async () => {
    await app.get(QueueService).queue(QUEUES.zalo).obliterate({ force: true });
    await app.close();
  });

  beforeEach(async () => {
    now = new Date("2026-12-01T01:00:00Z");
    a = await tenant();
  });

  const http = () => request(app.getHttpServer() as Server);
  const base = (t: Tenant) => `/api/v1/salons/${t.s.salonId}/zalo`;

  async function tenant(): Promise<Tenant> {
    const s = await createBookableSalon(prisma);
    await app.get(SubscriptionsFacade).startTrial({ salonId: s.salonId });
    return {
      s,
      owner: await bearerFor(app, s.ownerUserId),
      oaId: `oa_${Math.random().toString(36).slice(2, 10)}`,
      userId: `u_${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  const admin_ = (salonId: string, action: "suspend" | "unsuspend") =>
    http()
      .post(`/api/v1/admin/salons/${salonId}/${action}`)
      .set("authorization", admin)
      .send({ reason: "Zalo suspension integration test" })
      .expect(200);
  const suspend = (t: Tenant) => admin_(t.s.salonId, "suspend");
  const unsuspend = (t: Tenant) => admin_(t.s.salonId, "unsuspend");

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

  async function connect(t: Tenant): Promise<void> {
    const start = await http()
      .post(`${base(t)}/connection/start`)
      .set("authorization", t.owner)
      .send({ locale: "vi" })
      .expect(200);
    const authorize = new URL((start.body as { authorizeUrl: string }).authorizeUrl);
    const consent = await http()
      .get("/api/v1/dev/zalo-emulator/oauth/approve")
      .query({
        redirect_uri: authorize.searchParams.get("redirect_uri"),
        code_challenge: authorize.searchParams.get("code_challenge"),
        state: authorize.searchParams.get("state"),
        oa_id: t.oaId,
        oa_name: "Lotus Nails",
        decision: "allow",
      })
      .expect(302);
    const back = new URL(consent.headers["location"] as string);
    const done = await http().get(`${back.pathname}${back.search}`).expect(302);
    expect(done.headers["location"]).toContain("zalo=connected");
  }

  async function say(
    t: Tenant,
    event: Omit<EmulatorEvent, "oaId" | "userId">,
  ): Promise<OutboxEntry[]> {
    const before = (await store.outbox(t.oaId, t.userId)).length;
    const res = await emulator.deliver({ oaId: t.oaId, userId: t.userId, ...event });
    expect(res.status).toBe(200);
    await drain();
    return (await store.outbox(t.oaId, t.userId)).slice(before);
  }

  const texts = (out: OutboxEntry[]) =>
    out.map((e) => (e.message?.kind === "text" ? e.message.text : ""));
  const lastText = (out: OutboxEntry[]) => {
    const m = out.at(-1)?.message;
    if (m?.kind !== "text") throw new Error(`expected a text message, got ${JSON.stringify(out)}`);
    return m;
  };
  async function tap(t: Tenant, out: OutboxEntry[], title: string): Promise<OutboxEntry[]> {
    const button = lastText(out).buttons.find((b) => b.title === title);
    if (!button) throw new Error(`no "${title}" in ${JSON.stringify(lastText(out).buttons)}`);
    return say(t, { event: "user_send_text", text: button.payload });
  }

  async function bookViaBot(t: Tenant): Promise<string> {
    let out = await say(t, { event: "follow", name: "Mai" });
    out = await tap(t, out, "Đặt lịch");
    out = await tap(t, out, "Sơn gel");
    out = await tap(t, out, "Dài");
    out = await tap(t, out, "Ai cũng được");
    out = await tap(t, out, "Thứ 4, 02/12");
    const morning = lastText(out).buttons.find((b) => b.title.startsWith("Sáng"));
    out = await say(t, { event: "user_send_text", text: morning?.payload ?? "" });
    out = await tap(t, out, "09:00");
    out = await say(t, { event: "user_submit_info", name: "Mai", phone: "0901234567" });
    await tap(t, out, "Xác nhận");
    return (await prisma.booking.findFirstOrThrow({ where: { salonId: t.s.salonId } })).id;
  }

  /** The neutral notice speaks as the salon: never GuGu, never a link. */
  function expectNeutral(text: string) {
    expect(text).toContain("liên hệ trực tiếp với salon");
    expect(text).not.toMatch(/gugu/i);
    expect(text).not.toMatch(/https?:|www\.|\.vn\b|\.com\b|zalo\.me/i);
  }

  it("stops booking: one neutral reply per conversation per 24 h, webhooks still stored", async () => {
    await prisma.salon.update({
      where: { id: a.s.salonId },
      data: { phoneE164: "+84281234567" },
    });
    await connect(a);
    let out = await say(a, { event: "follow", name: "Mai" });
    expect(lastText(out).buttons[0]?.title).toBe("Đặt lịch"); // the bot works before
    await suspend(a);

    out = await tap(a, out, "Đặt lịch");
    expect(out).toHaveLength(1);
    const notice = lastText(out);
    expectNeutral(notice.text);
    expect(notice.text).toContain("0281 234 567"); // the salon's own number, as printed
    expect(notice.buttons).toEqual([]);

    // Further messages within 24 h: stored for staff, no second reply, no booking steps.
    out = await say(a, { event: "user_send_text", text: "Đặt lịch" });
    expect(out).toHaveLength(0);
    out = await say(a, { event: "user_submit_info", name: "Mai", phone: "0901234567" });
    expect(out).toHaveLength(0);
    out = await say(a, { event: "user_send_text", text: "gg|g|book" });
    expect(out).toHaveLength(0);
    expect(await prisma.booking.count({ where: { salonId: a.s.salonId } })).toBe(0);

    const events = await prisma.zaloWebhookEvent.findMany({ where: { salonId: a.s.salonId } });
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.status === "processed")).toBe(true);
    const conv = await prisma.zaloConversation.findFirstOrThrow({
      where: { salonId: a.s.salonId },
    });
    expect(
      await prisma.zaloMessage.count({
        where: { conversationId: conv.id, direction: "inbound" },
      }),
    ).toBe(5);
    expect(
      await prisma.zaloFunnelEvent.count({
        where: { conversationId: conv.id, event: "bot_unavailable", reason: "salon_suspended" },
      }),
    ).toBe(4);
    expect(
      await prisma.zaloSendLog.count({
        where: { salonId: a.s.salonId, purpose: "suspended_notice" },
      }),
    ).toBe(1);

    // A day later the next message gets the notice once more.
    now = new Date(now.getTime() + 24 * HOUR);
    out = await say(a, { event: "user_send_text", text: "xin chào" });
    expect(texts(out)).toHaveLength(1);
    expectNeutral(lastText(out).text);

    // After unsuspend the bot books again.
    await unsuspend(a);
    out = await say(a, { event: "user_send_text", text: "Đặt lịch" });
    expect(lastText(out).buttons[0]?.title).toBe("Sơn gel");
  });

  it("keeps the inbox readable and refuses staff replies with salon.suspended", async () => {
    await connect(a);
    await say(a, { event: "follow", name: "Mai" });
    await suspend(a);
    await say(a, { event: "user_send_text", text: "Còn chỗ chiều nay không?" });

    // Read-only: the list and the history load although a suspended salon is granted nothing.
    const list = zaloConversationListSchema.parse(
      (
        await http()
          .get(`${base(a)}/conversations`)
          .set("authorization", a.owner)
          .expect(200)
      ).body,
    );
    const conv = list.items[0];
    expect(conv).toBeDefined();
    const id = conv?.id ?? "";
    await http()
      .get(`${base(a)}/conversations/${id}`)
      .set("authorization", a.owner)
      .expect(200);
    const history = zaloMessageListSchema.parse(
      (
        await http()
          .get(`${base(a)}/conversations/${id}/messages`)
          .set("authorization", a.owner)
          .expect(200)
      ).body,
    );
    expect(history.items.some((m) => m.text === "Còn chỗ chiều nay không?")).toBe(true);

    const before = (await store.outbox(a.oaId, a.userId)).length;
    for (const path of ["messages", "take-over", "release", "read"]) {
      const res = await http()
        .post(`${base(a)}/conversations/${id}/${path}`)
        .set("authorization", a.owner)
        .send({ text: "Dạ còn ạ" });
      expect(res.status).toBe(403);
      expect(problemSchema.parse(res.body).code).toBe(SALON_SUSPENDED_ERROR);
    }
    // The service refuses too, whoever calls it (not only behind the HTTP guard).
    await expect(
      app.get(InboxService).reply(
        {
          salonId: a.s.salonId,
          organizationId: a.s.organizationId,
          role: "owner",
          permissions: new Set(),
        },
        a.s.ownerUserId,
        id,
        "Dạ còn ạ",
      ),
    ).rejects.toMatchObject({ code: SALON_SUSPENDED_ERROR });
    await drain();
    expect(await store.outbox(a.oaId, a.userId)).toHaveLength(before);
    expect(
      await prisma.zaloSendLog.count({ where: { salonId: a.s.salonId, purpose: "staff_reply" } }),
    ).toBe(0);
  });

  it("skips sends queued before the suspension (chat and ZBS template) at send time", async () => {
    await connect(a);
    await say(a, { event: "follow", name: "Mai" });
    const conv = await prisma.zaloConversation.findFirstOrThrow({
      where: { salonId: a.s.salonId },
    });
    await prisma.zaloOaConnection.update({
      where: { salonId: a.s.salonId },
      data: { templateIds: { booking_reminder: "tpl-reminder" } },
    });
    // Queued (not yet sent) when GuGu suspends the salon.
    const logIds = await app.get(OutboundService).record(a.s.salonId, [
      {
        channel: "cs",
        purpose: "staff_reply",
        conversationId: conv.id,
        sender: "staff",
        message: { kind: "text", text: "Dạ salon nhận lịch ạ", buttons: [] },
      },
      {
        channel: "template",
        purpose: "booking_update",
        conversationId: conv.id,
        bookingId: conv.id,
        templateKey: "booking_reminder",
        phoneE164: "+84901234567",
        data: {
          customer_name: "Mai",
          booking_code: "ABC123",
          service_name: "Sơn gel",
          booking_time: "09:00",
          salon_name: "Booking Salon",
        },
        previewText: "Nhắc lịch",
        dedupKey: `booking_update:test-${conv.id}`,
      },
    ]);
    await suspend(a);
    const before = (await store.outbox(a.oaId, a.userId)).length;
    await drain();
    expect(await store.outbox(a.oaId, a.userId)).toHaveLength(before);
    const logs = await prisma.zaloSendLog.findMany({ where: { id: { in: logIds } } });
    expect(logs.map((l) => [l.channel, l.status, l.errorCode])).toEqual(
      expect.arrayContaining([
        ["cs", "rejected", "salon_suspended"],
        ["template", "rejected", "salon_suspended"],
      ]),
    );
    expect(logs.every((l) => l.costEstimateVnd === 0)).toBe(true);
  });

  it("skips reminders while suspended; after unsuspend the one still due goes out, the past one not", async () => {
    await connect(a);
    const bookingId = await bookViaBot(a); // Wed 02/12 09:00 local = 02:00Z
    await suspend(a);

    // 23.5 h ahead: the 24 h reminder is due but the salon is suspended.
    now = new Date("2026-12-01T02:30:00Z");
    const before = (await store.outbox(a.oaId, a.userId)).length;
    await app.get(ZaloJobs).minute();
    await app.get(ZaloJobs).minute(); // a second scan logs nothing new
    await drain();
    expect(await store.outbox(a.oaId, a.userId)).toHaveLength(before);
    const skipped = await prisma.zaloSendLog.findMany({ where: { bookingId } });
    expect(skipped.map((l) => [l.purpose, l.status, l.errorCode, l.dedupKey])).toEqual([
      ["reminder_24h", "rejected", "salon_suspended", `reminder_24h:${bookingId}:salon_suspended`],
    ]);

    // 1.5 h ahead, still suspended: the 2 h reminder is skipped too.
    now = new Date("2026-12-02T00:30:00Z");
    await app.get(ZaloJobs).minute();
    await drain();
    expect(await store.outbox(a.oaId, a.userId)).toHaveLength(before);

    // Unsuspended 1 h 20 min ahead: the 2 h reminder is still due and goes out once; the 24 h
    // reminder's moment is past and it is never sent.
    await unsuspend(a);
    now = new Date("2026-12-02T00:40:00Z");
    await app.get(ZaloJobs).minute();
    await drain();
    await app.get(ZaloJobs).minute();
    await drain();
    const out = (await store.outbox(a.oaId, a.userId)).slice(before);
    expect(out).toHaveLength(1);
    expect(lastText(out).text).toContain("Nhắc lịch");
    const sent = await prisma.zaloSendLog.findMany({ where: { bookingId, status: "sent" } });
    expect(sent.map((l) => l.purpose)).toEqual(["reminder_2h"]);
  });

  it("a reminder queued right before the suspension is skipped, then sent after unsuspend while due", async () => {
    await connect(a);
    const bookingId = await bookViaBot(a);
    now = new Date("2026-12-01T02:30:00Z");
    await app.get(ZaloJobs).minute(); // queued, not sent yet (no drain)
    await suspend(a);
    const before = (await store.outbox(a.oaId, a.userId)).length;
    await drain();
    expect(await store.outbox(a.oaId, a.userId)).toHaveLength(before);
    const parked = await prisma.zaloSendLog.findFirstOrThrow({
      where: { bookingId, purpose: "reminder_24h" },
    });
    expect(parked).toMatchObject({ status: "rejected", errorCode: "salon_suspended" });
    expect(parked.dedupKey).toBe(`reminder_24h:${bookingId}:salon_suspended:${parked.id}`);

    await unsuspend(a);
    now = new Date("2026-12-01T03:00:00Z");
    await app.get(ZaloJobs).minute();
    await drain();
    expect(
      await prisma.zaloSendLog.count({
        where: { bookingId, purpose: "reminder_24h", status: "sent" },
      }),
    ).toBe(1);
  });

  it("isolates tenants: suspending one salon leaves another salon's bot booking", async () => {
    const b = await tenant();
    await connect(a);
    await connect(b);
    await suspend(a);
    const outA = await say(a, { event: "follow", name: "Mai" });
    expectNeutral(lastText(outA).text);
    const bookingId = await bookViaBot(b);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).salonId).toBe(
      b.s.salonId,
    );
    expect(
      await prisma.zaloSendLog.count({ where: { salonId: b.s.salonId, status: "rejected" } }),
    ).toBe(0);
    expect(await prisma.booking.count({ where: { salonId: a.s.salonId } })).toBe(0);
  });
});
