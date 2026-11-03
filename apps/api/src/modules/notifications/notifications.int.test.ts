// Notifications by email (topic 11) against the local stack: TEST_DATABASE_URL (guarded by
// vitest.integration.config.ts), Valkey DB 15 and Mailpit. The worker side runs inline: outbox
// events go to the real NotificationEventsHandler, due deliveries to the real SenderService, the
// clock is fake. Covers Mailpit delivery, dedup on replay and crash, the reminder schedule after a
// reschedule and a cancellation, the Zalo-first gate, settings, timeline, bell and scopes.
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingMessagesSchema,
  inboxSchema,
  notificationSettingsSchema,
  salonBookingSchema,
} from "@gugu/contracts";
import {
  createBookableSalon,
  type BookableSalonFixture,
  vnAt,
} from "../../../test/factories/booking";
import { addSalonMember, bearerFor, testEmail } from "../../../test/factories/identity";
import { countMailsTo } from "../../../test/mailpit";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import type { DomainEvent } from "../../infrastructure/outbox/domain-events";
import { appendOutbox } from "../../infrastructure/outbox/outbox.writer";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../infrastructure/queue/queue.service";
import { QUEUES } from "../../infrastructure/queue/queues";
import { BookingClock } from "../bookings/bookings.facade";
import { NotificationEventsHandler } from "./application/notification-events.handler";
import { NotifyClock } from "./application/notify-clock";
import { RemindersService } from "./application/reminders.service";
import { EMAIL_PROVIDER, SenderService } from "./application/sender.service";
import { PermanentChannelError } from "./channels/channel";
import { AppConfig } from "../../infrastructure/config/app-config";
import { mailAddressOf } from "../../infrastructure/mail/mail.service";
import { NotificationsWorkerModule } from "./notifications.module";

let now = new Date("2026-12-01T01:00:00Z"); // 08:00 in Ho Chi Minh City
const clock = { now: () => new Date(now) };
const mailpit = `http://127.0.0.1:${process.env["MAILPIT_UI_PORT"] ?? "18025"}/api/v1`;

interface FullMail {
  messageId: string;
  subject: string;
  text: string;
  fromName: string;
  replyTo: string[];
  attachments: { FileName: string; ContentType: string }[];
}

/** Newest email to `to` with sender name, reply-to and attachments (Mailpit API). */
async function mailTo(to: string, timeoutMs = 5_000): Promise<FullMail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const id = ((await res.json()) as { messages: { ID: string }[] }).messages[0]?.ID;
    if (id) {
      const m = (await (await fetch(`${mailpit}/message/${id}`)).json()) as {
        MessageID: string;
        Subject: string;
        Text: string;
        From: { Name: string };
        ReplyTo: { Address: string }[];
        Attachments: { FileName: string; ContentType: string }[];
      };
      return {
        messageId: m.MessageID,
        subject: m.Subject,
        text: m.Text,
        fromName: m.From.Name,
        replyTo: m.ReplyTo.map((r) => r.Address),
        attachments: m.Attachments,
      };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`no email to ${to}`);
}

describe("notifications by email (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let handler: NotificationEventsHandler;
  let sender: SenderService;
  let s: BookableSalonFixture;
  let owner: string;
  let receptionistId: string;
  let staffAId: string;
  let staffBId: string;
  const handled = new Set<string>();

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, NotificationsWorkerModule],
    })
      .overrideProvider(NotifyClock)
      .useValue(clock)
      .overrideProvider(BookingClock)
      .useValue(clock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    handler = app.get(NotificationEventsHandler);
    sender = app.get(SenderService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.get(QueueService).queue(QUEUES.notify).obliterate({ force: true });
    await app.close();
  });

  beforeEach(async () => {
    now = new Date("2026-12-01T01:00:00Z");
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
    receptionistId = await addSalonMember(prisma, s.salonId, "receptionist");
    staffAId = await addSalonMember(prisma, s.salonId, "staff");
    staffBId = await addSalonMember(prisma, s.salonId, "staff");
    for (const [userId, staffId] of [
      [staffAId, s.staffIds[0]],
      [staffBId, s.staffIds[1]],
    ] as const) {
      const member = await prisma.salonMember.findFirstOrThrow({
        where: { salonId: s.salonId, userId },
      });
      await prisma.staffProfile.update({
        where: { id: staffId },
        data: { salonMemberId: member.id },
      });
    }
    // Team emails follow the member's own language.
    await prisma.user.update({ where: { id: staffAId }, data: { preferredLocale: "en" } });
  });

  const http = () => request(app.getHttpServer() as Server);
  const api = (path: string) => `/api/v1/salons/${s.salonId}${path}`;
  let seq = 0;
  const key = () => `notify-int-${String(Date.now())}-${String(seq++)}`;

  /** Runs the outbox consumer for this salon's not-yet-handled events (like the relay would). */
  async function pump(replay = false): Promise<void> {
    const events = await prisma.outboxEvent.findMany({
      where: { salonId: s.salonId },
      orderBy: { occurredAt: "asc" },
    });
    for (const e of events) {
      if (handled.has(e.id) && !replay) continue;
      handled.add(e.id);
      const event: DomainEvent = {
        id: e.id,
        salonId: e.salonId,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        type: e.type,
        payload: e.payload as Record<string, unknown>,
        occurredAt: e.occurredAt.toISOString(),
      };
      await handler.handle(event);
    }
  }

  /** Runs the send worker for every due delivery of this salon. */
  async function sendDue(audience?: "customer" | "team"): Promise<string[]> {
    const due = await prisma.notificationDelivery.findMany({
      where: {
        salonId: s.salonId,
        channel: "email",
        ...(audience ? { audience } : {}),
        status: { in: ["queued", "scheduled"] },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
    const kinds: string[] = [];
    for (const d of due) kinds.push((await sender.send(d.id, true)).kind);
    return kinds;
  }

  async function book(
    email: string | null,
    startsAt = vnAt("2026-12-04", "10:00"),
    staffId: string = s.staffIds[0],
    phone = "0912 345 678",
  ): Promise<string> {
    const res = await http()
      .post(api("/bookings"))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({
        serviceId: s.serviceId,
        staffId,
        startsAt,
        source: "phone",
        customer: { name: "Nguyễn Thị Lan", phone, ...(email ? { email } : {}) },
      })
      .expect(201);
    return salonBookingSchema.parse(res.body).id;
  }

  const deliveries = (bookingId: string) =>
    prisma.notificationDelivery.findMany({
      where: { salonId: s.salonId, bookingId },
      // Rows of one event share the fake clock's time: order by planned send time, then id.
      orderBy: [{ createdAt: "asc" }, { scheduledFor: "asc" }, { id: "asc" }],
    });

  it("confirms a staff-entered booking by email from the salon, with an .ics, and notifies the team", async () => {
    await prisma.notificationSettings.create({
      data: { salonId: s.salonId, replyToEmail: "hello@lotus.test" },
    });
    const customer = testEmail("customer");
    const bookingId = await book(customer);
    await pump();
    expect(await sendDue()).toEqual(expect.arrayContaining(["sent"]));

    const mail = await mailTo(customer);
    expect(mail.subject).toBe("Lịch hẹn tại Booking Salon đã được xác nhận");
    expect(mail.fromName).toBe("Booking Salon");
    expect(mail.replyTo).toEqual(["hello@lotus.test"]);
    expect(mail.text).toContain("Nguyễn Thị Lan");
    expect(mail.text).not.toMatch(/gugu/i);
    expect(mail.attachments).toEqual([
      expect.objectContaining({ FileName: "appointment.ics", ContentType: "text/calendar" }),
    ]);

    const rows = await deliveries(bookingId);
    const customerRow = rows.find(
      (r) => r.audience === "customer" && r.event === "booking.confirmed",
    );
    expect(customerRow).toMatchObject({
      event: "booking.confirmed",
      status: "sent",
      units: 1,
      costEstimateVnd: app.get(AppConfig).env.NOTIFY_EMAIL_COST_VND,
      salonId: s.salonId,
      fallbackOf: null,
    });
    // The worker job id is the idempotency key.
    const job = await app
      .get(QueueService)
      .queue(QUEUES.notify)
      .getJob(customerRow?.idempotencyKey ?? "");
    expect(job?.data).toEqual({ deliveryId: customerRow?.id });

    // Team: the actor (owner) is excluded; staff A (own booking) and the receptionist get it;
    // staff B (someone else's booking, own-scope) does not.
    const inbox = await prisma.notification.findMany({ where: { salonId: s.salonId, bookingId } });
    expect(inbox.map((n) => n.userId).sort()).toEqual([receptionistId, staffAId].sort());
    const staffMail = await prisma.user.findUniqueOrThrow({ where: { id: staffAId } });
    expect((await mailTo(staffMail.email ?? "")).subject).toMatch(/^New booking /); // staff A: en
    const recMail = await prisma.user.findUniqueOrThrow({ where: { id: receptionistId } });
    expect((await mailTo(recMail.email ?? "")).subject).toMatch(/^Lịch hẹn mới /);
    const ownerMail = await prisma.user.findUniqueOrThrow({ where: { id: s.ownerUserId } });
    expect(await countMailsTo(ownerMail.email ?? "")).toBe(0);
  });

  it("sends exactly once when the event is replayed and when a worker crashes mid-send", async () => {
    const customer = testEmail("dup");
    const bookingId = await book(customer);
    await pump();
    await pump(true); // duplicate outbox delivery
    await pump(true);
    const rows = await deliveries(bookingId);
    const confirmation = rows.filter((r) => r.event === "booking.confirmed");
    expect(confirmation).toHaveLength(1);
    expect(await prisma.notification.count({ where: { salonId: s.salonId, bookingId } })).toBe(2);

    // Worker A claims the delivery and dies before sending (lease held, status queued).
    const id = confirmation[0]?.id ?? "";
    await prisma.notificationDelivery.update({
      where: { id },
      data: { lockedUntil: new Date(now.getTime() + 60_000) },
    });
    expect((await sender.send(id, false)).kind).toBe("noop"); // the retry waits for the lease
    now = new Date(now.getTime() + 3 * 60_000);
    const [a, b] = await Promise.all([sender.send(id, false), sender.send(id, false)]);
    expect([a.kind, b.kind].sort()).toEqual(["noop", "sent"]);
    expect((await sender.send(id, false)).kind).toBe("noop");
    // Delivery is at-least-once across a crash *after* SMTP accepted (documented); a resend
    // carries the same deterministic Message-ID so mail systems can recognise it.
    expect((await mailTo(customer)).messageId).toBe(
      `${confirmation[0]?.idempotencyKey ?? ""}@${mailAddressOf(app.get(AppConfig).env.MAIL_FROM).split("@")[1] ?? ""}`,
    );
    expect(await countMailsTo(customer)).toBe(1);
  });

  it("re-plans reminders on reschedule and drops them on cancel (fake clock)", async () => {
    const customer = testEmail("remind");
    const bookingId = await book(customer, vnAt("2026-12-04", "10:00"));
    await pump();
    await sendDue(); // the confirmation
    let reminders = (await deliveries(bookingId)).filter((r) => r.event === "booking.reminder");
    expect(reminders.map((r) => [r.variant, r.status, r.scheduledFor?.toISOString()])).toEqual([
      ["1440m", "scheduled", vnAt("2026-12-03", "10:00")],
      ["120m", "scheduled", vnAt("2026-12-04", "08:00")],
    ]);
    const old24 = reminders[0]?.id ?? "";

    await http()
      .post(api(`/bookings/${bookingId}/reschedule`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ startsAt: vnAt("2026-12-05", "15:00") })
      .expect(200);
    await pump();
    reminders = (await deliveries(bookingId)).filter((r) => r.event === "booking.reminder");
    expect(reminders.filter((r) => r.status === "skipped").map((r) => r.reason)).toEqual([
      "superseded",
      "superseded",
    ]);
    const fresh = reminders.filter((r) => r.status === "scheduled");
    expect(fresh.map((r) => [r.variant, r.entityVersion, r.scheduledFor?.toISOString()])).toEqual([
      ["1440m", 2, vnAt("2026-12-04", "15:00")],
      ["120m", 2, vnAt("2026-12-05", "13:00")],
    ]);

    // At the old 24 h moment nothing goes out for the old time.
    now = new Date(vnAt("2026-12-03", "10:01"));
    expect((await sender.send(old24, true)).kind).toBe("noop");
    await sendDue();
    const before = await countMailsTo(customer);

    // At the new 24 h moment the reminder goes out once, for the new time.
    now = new Date(vnAt("2026-12-04", "15:00"));
    await sendDue();
    await sendDue();
    expect(await countMailsTo(customer)).toBe(before + 1);
    expect((await mailTo(customer)).subject).toContain("Nhắc lịch hẹn");

    // Cancel by the salon: the pending 2 h reminder is dropped and never sends.
    await http()
      .post(api(`/bookings/${bookingId}/transitions`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ to: "cancelled_by_salon", reason: "Salon đóng cửa" })
      .expect(200);
    await pump();
    const two = (await deliveries(bookingId)).find(
      (r) => r.event === "booking.reminder" && r.variant === "120m" && r.entityVersion === 2,
    );
    expect(two).toMatchObject({ status: "skipped", reason: "stale" });
    now = new Date(vnAt("2026-12-05", "13:00"));
    expect((await sender.send(two?.id ?? "", true)).kind).toBe("noop");
    await sendDue(); // the cancellation email
    const cancelMail = await mailTo(customer);
    expect(cancelMail.subject).toBe("Lịch hẹn tại Booking Salon đã bị hủy");
    // Never the reason typed by staff.
    expect(cancelMail.text).not.toContain("Salon đóng cửa");
  });

  it("drops a stale reminder in the worker even if its job survives (version check)", async () => {
    const customer = testEmail("stale");
    const bookingId = await book(customer);
    await pump();
    const r = (await deliveries(bookingId)).find((d) => d.variant === "1440m");
    // The booking changes without our planner seeing it yet (event not pumped).
    await prisma.booking.update({ where: { id: bookingId }, data: { version: { increment: 1 } } });
    now = new Date(vnAt("2026-12-03", "10:00"));
    expect(await sender.send(r?.id ?? "", true)).toEqual({ kind: "skipped", reason: "stale" });
  });

  it("uses Zalo first: skips email when Zalo delivered, falls back when Zalo refused", async () => {
    await prisma.zaloOaConnection.create({
      data: {
        salonId: s.salonId,
        oaId: `oa_${Math.random().toString(36).slice(2, 10)}`,
        oaName: "Lotus OA",
        connectedByUserId: s.ownerUserId,
        // Fixture only: never used to call Zalo (no worker sends in this test).
        accessTokenEnc: "enc",
        refreshTokenEnc: "enc",
        accessExpiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });
    await prisma.zaloConversation.create({
      data: {
        salonId: s.salonId,
        oaId: "oa_x",
        zaloUserId: `u_${Math.random().toString(36).slice(2, 10)}`,
        phoneE164: "+84912345678",
      },
    });
    const viaZalo = testEmail("zalo-ok");
    const refused = testEmail("zalo-refused");
    const b1 = await book(viaZalo, vnAt("2026-12-04", "10:00"));
    const b2 = await book(refused, vnAt("2026-12-04", "11:00"), s.staffIds[1]);
    await pump();
    for (const bookingId of [b1, b2]) {
      const row = (await deliveries(bookingId)).find((r) => r.event === "booking.confirmed");
      expect(row).toMatchObject({ status: "queued", fallbackOf: "zalo_template" });
    }
    const zaloKey = async (bookingId: string) => {
      const row = (await deliveries(bookingId)).find((r) => r.event === "booking.confirmed");
      return (row?.meta as { zaloDedupKey: string }).zaloDedupKey;
    };
    // What module `zalo` logged for these events.
    await prisma.zaloSendLog.createMany({
      data: [
        {
          salonId: s.salonId,
          bookingId: b1,
          channel: "template",
          purpose: "booking_confirmation",
          dedupKey: await zaloKey(b1),
          status: "sent",
        },
        {
          salonId: s.salonId,
          bookingId: b2,
          channel: "template",
          purpose: "booking_confirmation",
          dedupKey: await zaloKey(b2),
          status: "rejected",
          errorCode: "no_template",
        },
      ],
    });
    expect(await sendDue("customer")).toEqual([]); // still inside the grace period
    now = new Date(now.getTime() + 2 * 60_000);
    await sendDue();
    expect((await deliveries(b1)).find((r) => r.event === "booking.confirmed")).toMatchObject({
      status: "skipped",
      reason: "sent_via_zalo",
    });
    expect(await countMailsTo(viaZalo)).toBe(0);
    expect((await mailTo(refused)).subject).toContain("đã được xác nhận");

    // The CRM timeline shows both channels for b2.
    const res = await http()
      .get(api(`/bookings/${b2}/messages`))
      .set("authorization", owner)
      .expect(200);
    const timeline = bookingMessagesSchema.parse(res.body);
    expect(timeline.items.map((i) => [i.channel, i.status, i.fallback])).toEqual(
      expect.arrayContaining([
        ["email", "sent", true],
        ["zalo_template", "rejected", false],
      ]),
    );
    expect(JSON.stringify(timeline)).not.toContain(refused);
  });

  it("logs a skip when the customer has neither Zalo nor email, and honours disabled events", async () => {
    const none = await book(null);
    await pump();
    expect((await deliveries(none)).filter((r) => r.audience === "customer")).toEqual([
      expect.objectContaining({ status: "skipped", reason: "no_contact" }),
    ]);

    const put = await http()
      .put(api("/notifications/settings"))
      .set("authorization", owner)
      .send({
        events: [{ event: "booking.confirmed", email: false }],
        reminderOffsetsMinutes: [180],
        replyToEmail: null,
      })
      .expect(200);
    const saved = notificationSettingsSchema.parse(put.body);
    expect(saved.reminderOffsetsMinutes).toEqual([180]);
    expect(saved.events.find((e) => e.event === "booking.confirmed")?.email).toBe(false);
    const customer = testEmail("off");
    const b = await book(customer, vnAt("2026-12-04", "14:00"));
    await pump();
    const rows = await deliveries(b);
    expect(rows.find((r) => r.event === "booking.confirmed")).toMatchObject({
      status: "skipped",
      reason: "disabled",
    });
    expect(rows.filter((r) => r.event === "booking.reminder").map((r) => r.variant)).toEqual([
      "180m",
    ]);
    expect(
      await prisma.auditLog.count({
        where: { salonId: s.salonId, action: "notifications.settings_updated" },
      }),
    ).toBe(1);
  });

  it("validates settings and enforces the permission matrix", async () => {
    const res = await http()
      .get(api("/notifications/settings"))
      .set("authorization", owner)
      .expect(200);
    const settings = notificationSettingsSchema.parse(res.body);
    expect(settings.reminderOffsetsMinutes).toEqual([1440, 120]);
    expect(settings.zaloConnected).toBe(false);
    const body = { events: [], reminderOffsetsMinutes: [1440, 120], replyToEmail: null };
    for (const bad of [
      { ...body, reminderOffsetsMinutes: [20] },
      { ...body, reminderOffsetsMinutes: [60, 120, 180, 240] },
      { ...body, reminderOffsetsMinutes: [60, 60] },
      { ...body, replyToEmail: "not-an-email" },
    ]) {
      await http()
        .put(api("/notifications/settings"))
        .set("authorization", owner)
        .send(bad)
        .expect(400);
    }
    const receptionist = await bearerFor(app, receptionistId);
    await http()
      .put(api("/notifications/settings"))
      .set("authorization", receptionist)
      .send(body)
      .expect(403);
  });

  it("scopes the timeline and the bell to what the member may see", async () => {
    const bookingId = await book(testEmail("scope"), vnAt("2026-12-04", "10:00"), s.staffIds[0]);
    await pump();
    const staffA = await bearerFor(app, staffAId);
    const staffB = await bearerFor(app, staffBId);
    await http()
      .get(api(`/bookings/${bookingId}/messages`))
      .set("authorization", staffA)
      .expect(200);
    await http()
      .get(api(`/bookings/${bookingId}/messages`))
      .set("authorization", staffB)
      .expect(404);

    const inboxA = inboxSchema.parse(
      (await http().get(api("/notifications/inbox")).set("authorization", staffA).expect(200)).body,
    );
    expect(inboxA.unread).toBe(1);
    expect(inboxA.items[0]).toMatchObject({
      event: "salon.booking_received",
      booking: { id: bookingId, customerName: "Nguyễn Thị Lan" },
    });
    expect(JSON.stringify(inboxA)).not.toMatch(/\+84|0912/);
    const inboxB = inboxSchema.parse(
      (await http().get(api("/notifications/inbox")).set("authorization", staffB).expect(200)).body,
    );
    expect(inboxB.items).toEqual([]);

    // Marking read only touches the caller's items.
    await http()
      .post(api("/notifications/inbox/read"))
      .set("authorization", staffB)
      .send({ ids: [inboxA.items[0]?.id] })
      .expect(204);
    await http()
      .post(api("/notifications/inbox/read"))
      .set("authorization", staffA)
      .send({})
      .expect(204);
    const after = inboxSchema.parse(
      (await http().get(api("/notifications/inbox")).set("authorization", staffA).expect(200)).body,
    );
    expect(after.unread).toBe(0);

    // Muting own email copies.
    await http()
      .put(api("/notifications/me"))
      .set("authorization", staffA)
      .send({ emailEnabled: false })
      .expect(200);
    const other = await book(testEmail("mute"), vnAt("2026-12-04", "13:00"), s.staffIds[0]);
    await pump();
    const mine = (await deliveries(other)).find(
      (r) => r.recipientUserId === staffAId && r.channel === "email",
    );
    expect(mine).toMatchObject({ status: "skipped", reason: "muted" });
  });

  it("tells the inbox team about a Zalo hand-off, not staff without inbox access", async () => {
    const conv = await prisma.zaloConversation.create({
      data: { salonId: s.salonId, oaId: "oa_h", zaloUserId: `u_${String(Date.now())}` },
    });
    await prisma.$transaction((tx) =>
      appendOutbox(tx, {
        salonId: s.salonId,
        aggregateType: "zalo_conversation",
        aggregateId: conv.id,
        type: "zalo.handoff_requested",
        payload: { conversationId: conv.id },
      }),
    );
    await pump();
    const items = await prisma.notification.findMany({
      where: { salonId: s.salonId, conversationId: conv.id },
    });
    expect(items.map((i) => i.userId).sort()).toEqual([s.ownerUserId, receptionistId].sort());
    await sendDue();
    const rec = await prisma.user.findUniqueOrThrow({ where: { id: receptionistId } });
    expect((await mailTo(rec.email ?? "")).subject).toContain("Khách đang chờ trên Zalo");
  });

  it("re-checks team access at send time (removed member gets nothing)", async () => {
    await book(testEmail("removed"));
    await pump();
    await prisma.salonMember.updateMany({
      where: { salonId: s.salonId, userId: receptionistId },
      data: { status: "removed" },
    });
    await sendDue();
    const row = await prisma.notificationDelivery.findFirst({
      where: { salonId: s.salonId, recipientUserId: receptionistId, channel: "email" },
    });
    expect(row).toMatchObject({ status: "skipped", reason: "not_member" });
  });

  it("rebuilds lost reminder jobs on reconciliation (Redis loss)", async () => {
    const bookingId = await book(testEmail("reconcile"), vnAt("2026-12-02", "10:00"));
    await pump();
    const queue = app.get(QueueService).queue(QUEUES.notify);
    const reminder = (await deliveries(bookingId)).find((r) => r.variant === "1440m");
    expect(await queue.getJob(reminder?.idempotencyKey ?? "")).toBeDefined();
    await queue.obliterate({ force: true });
    expect(await queue.getJob(reminder?.idempotencyKey ?? "")).toBeUndefined();
    const result = await app.get(RemindersService).reconcile();
    expect(result.requeued).toBeGreaterThan(0);
    const job = await queue.getJob(reminder?.idempotencyKey ?? "");
    expect(job?.data).toEqual({ deliveryId: reminder?.id });
    // Reconciling again changes nothing (same rows, same job ids).
    await app.get(RemindersService).reconcile();
    expect(
      (await deliveries(bookingId)).filter((r) => r.event === "booking.reminder"),
    ).toHaveLength(2);
  });

  it("lets Zalo send the reminder and falls back to email only when Zalo did not", async () => {
    await prisma.zaloOaConnection.create({
      data: {
        salonId: s.salonId,
        oaId: `oa_${Math.random().toString(36).slice(2, 10)}`,
        oaName: "Lotus OA",
        connectedByUserId: s.ownerUserId,
        accessTokenEnc: "enc",
        refreshTokenEnc: "enc",
        accessExpiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });
    await prisma.zaloConversation.create({
      data: {
        salonId: s.salonId,
        oaId: "oa_r",
        zaloUserId: `u_${Math.random().toString(36).slice(2, 10)}`,
        phoneE164: "+84912345678",
      },
    });
    const customer = testEmail("zalo-reminder");
    const bookingId = await book(customer, vnAt("2026-12-04", "10:00"));
    await pump();
    const rows = (await deliveries(bookingId)).filter((r) => r.event === "booking.reminder");
    const r24 = rows.find((r) => r.variant === "1440m");
    const r2 = rows.find((r) => r.variant === "120m");
    // 24 h: Zalo has not logged anything yet → wait; then Zalo sent → email skipped.
    now = new Date(vnAt("2026-12-03", "10:00"));
    expect((await sender.send(r24?.id ?? "", false)).kind).toBe("deferred");
    await prisma.zaloSendLog.create({
      data: {
        salonId: s.salonId,
        bookingId,
        channel: "template",
        purpose: "reminder_24h",
        dedupKey: `reminder_24h:${bookingId}`,
        status: "sent",
      },
    });
    now = new Date(vnAt("2026-12-03", "10:01"));
    expect(await sender.send(r24?.id ?? "", false)).toEqual({
      kind: "skipped",
      reason: "sent_via_zalo",
    });
    // 2 h: Zalo refused (window closed, no template) → the email reminder goes out as fallback.
    await prisma.zaloSendLog.create({
      data: {
        salonId: s.salonId,
        bookingId,
        channel: "cs",
        purpose: "reminder_2h",
        dedupKey: `reminder_2h:${bookingId}`,
        status: "rejected",
        errorCode: "window_closed",
      },
    });
    now = new Date(vnAt("2026-12-04", "08:00"));
    expect((await sender.send(r2?.id ?? "", false)).kind).toBe("sent");
    expect(
      await prisma.notificationDelivery.findUnique({ where: { id: r2?.id ?? "" } }),
    ).toMatchObject({
      status: "sent",
      fallbackOf: "zalo_template",
    });
    expect((await mailTo(customer)).subject).toContain("Nhắc lịch hẹn");
  });

  it("retries transient provider errors, fails on the last attempt or a permanent error", async () => {
    const provider = app.get<{ send: (m: unknown) => Promise<unknown> }>(EMAIL_PROVIDER);
    const bookingId = await book(testEmail("flaky"));
    await pump();
    const row = (await deliveries(bookingId)).find((r) => r.event === "booking.confirmed");
    const id = row?.id ?? "";
    const spy = vi.spyOn(provider, "send").mockRejectedValue(new Error("ECONNRESET"));
    await expect(sender.send(id, false)).rejects.toThrow("ECONNRESET");
    expect(await prisma.notificationDelivery.findUnique({ where: { id } })).toMatchObject({
      status: "queued",
      lockedUntil: null,
      attempts: 1,
      units: 0,
      costEstimateVnd: 0,
    });
    expect(await sender.send(id, true)).toEqual({ kind: "failed", reason: "provider_error" });
    expect(await prisma.notificationDelivery.findUnique({ where: { id } })).toMatchObject({
      status: "failed",
      reason: "provider_error",
      lockedUntil: null,
      reservedAt: null,
      units: 0,
      costEstimateVnd: 0,
    });

    const other = await book(testEmail("bounce"), vnAt("2026-12-04", "12:00"));
    await pump();
    const bounce = (await deliveries(other)).find((r) => r.event === "booking.confirmed");
    spy.mockRejectedValueOnce(new PermanentChannelError("smtp_550"));
    expect(await sender.send(bounce?.id ?? "", false)).toEqual({
      kind: "failed",
      reason: "smtp_550",
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(
      await prisma.notificationDelivery.findUnique({ where: { id: bounce?.id ?? "" } }),
    ).toMatchObject({ status: "failed", reason: "smtp_550", lockedUntil: null, units: 0 });

    // A failure while deciding (e.g. Zalo lookup) releases the lease for the retry.
    const third = await book(testEmail("decide"), vnAt("2026-12-04", "13:00"));
    await pump();
    const d3 = (await deliveries(third)).find((r) => r.event === "booking.confirmed");
    vi.spyOn(prisma.booking, "findFirst").mockRejectedValueOnce(new Error("db down"));
    await expect(sender.send(d3?.id ?? "", false)).rejects.toThrow("db down");
    expect(
      await prisma.notificationDelivery.findUnique({ where: { id: d3?.id ?? "" } }),
    ).toMatchObject({ status: "queued", lockedUntil: null });
  });

  it("drops a reminder in the worker after a cancel or move the planner has not seen yet", async () => {
    const customer = testEmail("unplanned");
    const bookingId = await book(customer, vnAt("2026-12-04", "10:00"));
    await pump();
    await sendDue();
    const before = await countMailsTo(customer);
    const r2 = (await deliveries(bookingId)).find((r) => r.variant === "120m");
    await http()
      .post(api(`/bookings/${bookingId}/transitions`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ to: "cancelled_by_salon", reason: "x" })
      .expect(200);
    // No pump(): the reminder row is still scheduled; only the worker's own check stops it.
    now = new Date(vnAt("2026-12-04", "08:00"));
    expect(await sender.send(r2?.id ?? "", true)).toEqual({ kind: "skipped", reason: "stale" });

    const moved = await book(customer, vnAt("2026-12-05", "10:00"));
    await pump();
    const m24 = (await deliveries(moved)).find((r) => r.variant === "1440m");
    await http()
      .post(api(`/bookings/${moved}/reschedule`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ startsAt: vnAt("2026-12-05", "15:00") })
      .expect(200);
    now = new Date(vnAt("2026-12-04", "10:00"));
    expect(await sender.send(m24?.id ?? "", true)).toEqual({ kind: "skipped", reason: "stale" });
    expect(await countMailsTo(customer)).toBe(before); // no reminder went out
  });

  it("caps customer emails per address per day and logs the skip", async () => {
    const victim = testEmail("victim");
    const cap = app.get(AppConfig).env.NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY;
    let skipped = 0;
    for (let i = 0; i <= cap; i++) {
      const hour = String(9 + (i % 9)).padStart(2, "0");
      const day = `2026-12-${String(5 + Math.floor(i / 9)).padStart(2, "0")}`;
      const id = await book(victim, vnAt(day, `${hour}:00`), s.staffIds[i % 2]);
      await pump();
      await sendDue("customer");
      const row = (await deliveries(id)).find((r) => r.event === "booking.confirmed");
      if (row?.reason === "cap") skipped++;
    }
    expect(skipped).toBe(1);
    expect(await countMailsTo(victim)).toBe(cap);
  });

  /** Temporarily lower a cap (config is read at send time). */
  async function withCap<T>(
    name:
      | "NOTIFY_CUSTOMER_EMAILS_PER_SALON_DAY"
      | "NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY"
      | "NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY_ALL_SALONS",
    value: number,
    run: () => Promise<T>,
  ): Promise<T> {
    const env = app.get(AppConfig).env as Record<string, unknown>;
    const before = env[name];
    env[name] = value;
    try {
      return await run();
    } finally {
      env[name] = before;
    }
  }

  it("counts Gmail aliases of one mailbox against one cap", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const aliases = [
      `lan${tag}@gmail.com`,
      `lan${tag}+spa@gmail.com`,
      `l.a.n${tag}@googlemail.com`,
    ];
    const kinds = await withCap("NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY", 2, async () => {
      const out: string[] = [];
      for (const [i, email] of aliases.entries()) {
        const id = await book(email, vnAt("2026-12-04", `${String(10 + i)}:00`), s.staffIds[i % 2]);
        await pump();
        const row = (await deliveries(id)).find((r) => r.event === "booking.confirmed");
        out.push((await sender.send(row?.id ?? "", true)).kind);
      }
      return out;
    });
    expect(kinds).toEqual(["sent", "sent", "skipped"]);
    const keys = await prisma.notificationDelivery.findMany({
      where: { salonId: s.salonId, event: "booking.confirmed", recipientKey: { not: null } },
      select: { recipientKey: true },
    });
    expect(new Set(keys.map((k) => k.recipientKey)).size).toBe(1);
    // The log stores a hash, never the address.
    expect(JSON.stringify(keys)).not.toContain("gmail");
  });

  it("caps across salons per mailbox", async () => {
    const victim = `x${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const first = await book(victim);
    await pump();
    const r1 = (await deliveries(first)).find((r) => r.event === "booking.confirmed");
    // Another salon already emailed this mailbox today.
    const other = await createBookableSalon(prisma);
    await prisma.notificationDelivery.create({
      data: {
        salonId: other.salonId,
        event: "booking.confirmed",
        audience: "customer",
        channel: "email",
        idempotencyKey: `other-${String(Date.now())}`,
        status: "sent",
        recipientKey: (await import("./domain/recipient-key")).recipientKey(victim),
        reservedAt: now,
        sentAt: now,
      },
    });
    const kind = await withCap("NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY_ALL_SALONS", 1, () =>
      sender.send(r1?.id ?? "", true),
    );
    expect(kind).toEqual({ kind: "skipped", reason: "cap" });
  });

  it("caps per salon and lets the 24 h window slide", async () => {
    const addrs = [testEmail("s1"), testEmail("s2"), testEmail("s3")];
    const kinds = await withCap("NOTIFY_CUSTOMER_EMAILS_PER_SALON_DAY", 2, async () => {
      const out: string[] = [];
      for (const [i, email] of addrs.entries()) {
        const id = await book(email, vnAt("2026-12-04", `${String(10 + i)}:00`), s.staffIds[i % 2]);
        await pump();
        const row = (await deliveries(id)).find((r) => r.event === "booking.confirmed");
        out.push((await sender.send(row?.id ?? "", true)).kind);
      }
      // A day later the window has moved on: the salon may send again.
      now = new Date(now.getTime() + 86_400_000 + 60_000);
      const later = await book(addrs[2] ?? "", vnAt("2026-12-06", "10:00"));
      await pump();
      const row = (await deliveries(later)).find((r) => r.event === "booking.confirmed");
      out.push((await sender.send(row?.id ?? "", true)).kind);
      return out;
    });
    expect(kinds).toEqual(["sent", "sent", "skipped", "sent"]);
  });

  it("reserves the quota atomically when sends run in parallel", async () => {
    const victim = `p${Math.random().toString(36).slice(2, 8)}@example.test`;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await book(victim, vnAt("2026-12-04", `${String(10 + i)}:00`), s.staffIds[i % 2]);
      await pump();
      const row = (await deliveries(id)).find((r) => r.event === "booking.confirmed");
      ids.push(row?.id ?? "");
    }
    const results = await withCap("NOTIFY_CUSTOMER_EMAILS_PER_ADDRESS_DAY", 1, () =>
      Promise.all(ids.map((id) => sender.send(id, true))),
    );
    expect(results.filter((r) => r.kind === "sent")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "skipped")).toHaveLength(3);
    await mailTo(victim);
    expect(await countMailsTo(victim)).toBe(1);
  });

  it("hides the reply-to from non-editors and keeps bell counts and reads per member", async () => {
    await prisma.notificationSettings.create({
      data: { salonId: s.salonId, replyToEmail: "hello@lotus.test" },
    });
    const receptionist = await bearerFor(app, receptionistId);
    const asRec = notificationSettingsSchema.parse(
      (await http().get(api("/notifications/settings")).set("authorization", receptionist)).body,
    );
    expect(asRec.replyToEmail).toBeNull();
    const asOwner = notificationSettingsSchema.parse(
      (await http().get(api("/notifications/settings")).set("authorization", owner)).body,
    );
    expect(asOwner.replyToEmail).toBe("hello@lotus.test");

    // Staff A loses the booking (moved to Mai): the badge no longer counts it.
    const bookingId = await book(testEmail("moved"), vnAt("2026-12-04", "10:00"), s.staffIds[0]);
    await pump();
    const staffA = await bearerFor(app, staffAId);
    const read = async () =>
      inboxSchema.parse(
        (await http().get(api("/notifications/inbox")).set("authorization", staffA)).body,
      );
    expect((await read()).unread).toBe(1);
    await prisma.booking.update({ where: { id: bookingId }, data: { staffId: s.staffIds[1] } });
    const after = await read();
    expect(after.unread).toBe(0);
    expect(after.items).toEqual([]);

    // Another salon's owner cannot mark this salon's items read (their own salon id is checked).
    const other = await createBookableSalon(prisma);
    const otherOwner = await bearerFor(app, other.ownerUserId);
    const recItems = await prisma.notification.findMany({
      where: { salonId: s.salonId, userId: receptionistId },
    });
    await http()
      .post(`/api/v1/salons/${other.salonId}/notifications/inbox/read`)
      .set("authorization", otherOwner)
      .send({ ids: recItems.map((i) => i.id) })
      .expect(204);
    await http()
      .post(api("/notifications/inbox/read"))
      .set("authorization", otherOwner)
      .send({})
      .expect(404);
    expect(
      await prisma.notification.count({
        where: { salonId: s.salonId, userId: receptionistId, readAt: null },
      }),
    ).toBe(recItems.length);
  });

  it("keeps the delivery log per salon (cost tracked) and never leaks across salons", async () => {
    const other = await createBookableSalon(prisma);
    const bookingId = await book(testEmail("tenant"));
    await pump();
    await sendDue();
    const otherOwner = await bearerFor(app, other.ownerUserId);
    await http()
      .get(`/api/v1/salons/${other.salonId}/bookings/${bookingId}/messages`)
      .set("authorization", otherOwner)
      .expect(404);
    const cost = await prisma.notificationDelivery.aggregate({
      where: { salonId: s.salonId, status: "sent", channel: "email" },
      _sum: { units: true, costEstimateVnd: true },
    });
    expect(cost._sum.units).toBeGreaterThan(0);
    expect(cost._sum.costEstimateVnd).toBe(
      (cost._sum.units ?? 0) * app.get(AppConfig).env.NOTIFY_EMAIL_COST_VND,
    );
    const unpaid = await prisma.notificationDelivery.aggregate({
      where: { salonId: s.salonId, status: { in: ["skipped", "failed", "scheduled"] } },
      _sum: { units: true, costEstimateVnd: true },
    });
    expect(unpaid._sum.units ?? 0).toBe(0);
    expect(unpaid._sum.costEstimateVnd ?? 0).toBe(0);
  });
});
