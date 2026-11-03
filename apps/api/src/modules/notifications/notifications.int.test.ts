// Notifications by email (topic 11) against the local stack: TEST_DATABASE_URL (guarded by
// vitest.integration.config.ts), Valkey DB 15 and Mailpit. The worker side runs inline: outbox
// events go to the real NotificationEventsHandler, due deliveries to the real SenderService, the
// clock is fake. Covers Mailpit delivery, dedup on replay and crash, the reminder schedule after a
// reschedule and a cancellation, the Zalo-first gate, settings, timeline, bell and scopes.
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
import { SenderService } from "./application/sender.service";
import { NotificationsWorkerModule } from "./notifications.module";

let now = new Date("2026-12-01T01:00:00Z"); // 08:00 in Ho Chi Minh City
const clock = { now: () => new Date(now) };
const mailpit = `http://127.0.0.1:${process.env["MAILPIT_UI_PORT"] ?? "18025"}/api/v1`;

interface FullMail {
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
        Subject: string;
        Text: string;
        From: { Name: string };
        ReplyTo: { Address: string }[];
        Attachments: { FileName: string; ContentType: string }[];
      };
      return {
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
      orderBy: { createdAt: "asc" },
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
    const customerRow = rows.find((r) => r.audience === "customer");
    expect(customerRow).toMatchObject({
      event: "booking.confirmed",
      status: "sent",
      units: 1,
      costEstimateVnd: 3,
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
    expect((await mailTo(staffMail.email ?? "")).subject).toMatch(/^Lịch hẹn mới /);
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
    await mailTo(customer);
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
    expect(cost._sum.costEstimateVnd).toBe((cost._sum.units ?? 0) * 3);
  });
});
