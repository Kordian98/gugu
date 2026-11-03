// Notifications (topic 11) against the local stack: TEST_DATABASE_URL (guarded by
// vitest.integration.config.ts), TEST_REDIS_DB and Mailpit. The worker side runs inline: outbox
// events go to the real NotificationEventsHandler, due deliveries to the real SenderService, the
// clock is fake. Covers: GuGu never emails a salon's customer for any event (X26, q85/q86/q87),
// team bell + email with dedup on replay and crash, settings, the Zalo-only timeline, bell scopes,
// reconciliation, retries and per-salon cost.
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingMessagesSchema,
  customerDetailSchema,
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
import { countMailsTo, waitForMail } from "../../../test/mailpit";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { AppConfig } from "../../infrastructure/config/app-config";
import { mailAddressOf } from "../../infrastructure/mail/mail.service";
import type { DomainEvent } from "../../infrastructure/outbox/domain-events";
import { appendOutbox } from "../../infrastructure/outbox/outbox.writer";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../infrastructure/queue/queue.service";
import { QUEUES } from "../../infrastructure/queue/queues";
import { BookingClock } from "../bookings/bookings.facade";
import { NotificationEventsHandler } from "./application/notification-events.handler";
import { NotifyClock } from "./application/notify-clock";
import { ReconcileService } from "./application/reconcile.service";
import { EMAIL_PROVIDER, SenderService } from "./application/sender.service";
import { PermanentChannelError } from "./channels/channel";
import { NotificationsWorkerModule } from "./notifications.module";

let now = new Date("2026-12-01T01:00:00Z"); // 08:00 in Ho Chi Minh City
const clock = { now: () => new Date(now) };
const mailpit = `http://127.0.0.1:${process.env["MAILPIT_UI_PORT"] ?? "18025"}/api/v1`;

/** Message-ID of the newest email to `to` (Mailpit API). */
async function messageIdTo(to: string): Promise<string> {
  await waitForMail(to);
  const res = await fetch(`${mailpit}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const id = ((await res.json()) as { messages: { ID: string }[] }).messages[0]?.ID ?? "";
  return ((await (await fetch(`${mailpit}/message/${id}`)).json()) as { MessageID: string })
    .MessageID;
}

describe("notifications (integration)", () => {
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

  /** Runs the send worker for every due email delivery of this salon. */
  async function sendDue(): Promise<string[]> {
    const due = await prisma.notificationDelivery.findMany({
      where: {
        salonId: s.salonId,
        channel: "email",
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
    startsAt = vnAt("2026-12-04", "10:00"),
    staffId: string = s.staffIds[0],
    phone = "0912 345 678",
    extra: Record<string, unknown> = {},
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
        customer: { name: "Nguyễn Thị Lan", phone, ...extra },
      })
      .expect(201);
    return salonBookingSchema.parse(res.body).id;
  }

  const deliveries = (bookingId: string) =>
    prisma.notificationDelivery.findMany({
      where: { salonId: s.salonId, bookingId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

  /** Email of every team member of this salon (the only addresses GuGu may email). */
  async function teamAddresses(): Promise<Set<string>> {
    const users = await prisma.user.findMany({
      where: { id: { in: [s.ownerUserId, receptionistId, staffAId, staffBId] } },
      select: { email: true },
    });
    return new Set(users.map((u) => (u.email ?? "").toLowerCase()));
  }

  it("never emails the customer for any event — confirmed, rescheduled, cancelled, reminders (X26)", async () => {
    // q87: the salon stored the client's email on the profile. GuGu must still never use it.
    const customer = testEmail("never-customer");
    const created = await http()
      .post(api("/customers"))
      .set("authorization", owner)
      .send({ displayName: "Nguyễn Thị Lan", phone: "0912 345 678", email: customer })
      .expect(201);
    const profile = customerDetailSchema.parse(
      (
        await http()
          .get(api(`/customers/${(created.body as { id: string }).id}`))
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(profile.email).toBe(customer);

    // An old client still sending `customer.email` on the booking: ignored, nothing stored.
    const bookingId = await book(vnAt("2026-12-04", "10:00"), s.staffIds[0], "0912 345 678", {
      email: customer,
    });
    const view = await http()
      .get(api(`/bookings/${bookingId}`))
      .set("authorization", owner);
    expect(JSON.stringify(view.body)).not.toContain(customer);
    await pump();
    await sendDue();

    // Reschedule, and a second booking cancelled by the salon.
    await http()
      .post(api(`/bookings/${bookingId}/reschedule`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ startsAt: vnAt("2026-12-05", "15:00") })
      .expect(200);
    const second = await book(vnAt("2026-12-04", "13:00"));
    await pump();
    await http()
      .post(api(`/bookings/${second}/transitions`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ to: "cancelled_by_salon", reason: "Salon đóng cửa" })
      .expect(200);
    await pump();
    await sendDue();

    // Walk the fake clock through every reminder moment (24 h, 2 h) and reconcile each time.
    for (const at of [
      vnAt("2026-12-03", "13:00"),
      vnAt("2026-12-04", "11:00"),
      vnAt("2026-12-04", "15:00"),
      vnAt("2026-12-05", "13:00"),
      vnAt("2026-12-05", "14:59"),
    ]) {
      now = new Date(at);
      await app.get(ReconcileService).reconcile();
      await pump(true);
      await sendDue();
    }

    expect(await countMailsTo(customer)).toBe(0);
    // This module's send log has no customer row at all — planned, skipped or sent.
    expect(
      await prisma.notificationDelivery.count({
        where: { salonId: s.salonId, audience: "customer" },
      }),
    ).toBe(0);
    // Every email this salon's notifications produced went to a team member.
    const team = await teamAddresses();
    const sent = await prisma.notificationDelivery.findMany({
      where: { salonId: s.salonId, channel: "email", status: "sent" },
      select: { recipientUserId: true, audience: true },
    });
    expect(sent.length).toBeGreaterThan(0);
    for (const d of sent) {
      expect(d.audience).toBe("team");
      const u = await prisma.user.findUniqueOrThrow({ where: { id: d.recipientUserId ?? "" } });
      expect(team.has((u.email ?? "").toLowerCase())).toBe(true);
    }
  });

  it("rejects a customer row in the send log at the database level", async () => {
    await expect(
      prisma.notificationDelivery.create({
        data: {
          salonId: s.salonId,
          event: "booking.confirmed",
          audience: "customer",
          channel: "email",
          idempotencyKey: `cust-${String(Date.now())}`,
          status: "queued",
        },
      }),
    ).rejects.toThrow(/notification_deliveries_valid/);
    // The worker also refuses anything but a team email (defence in depth).
    const row = await prisma.notificationDelivery.create({
      data: {
        salonId: s.salonId,
        event: "salon.booking_received",
        audience: "team",
        recipientUserId: receptionistId,
        channel: "in_app",
        idempotencyKey: `inapp-${String(Date.now())}`,
        status: "queued",
      },
    });
    expect(await sender.send(row.id, true)).toEqual({ kind: "noop" });
  });

  it("notifies the team (bell + email in their language), not the actor, with job id = key", async () => {
    const bookingId = await book();
    await pump();
    expect(await sendDue()).toEqual(expect.arrayContaining(["sent"]));

    // Team: the actor (owner) is excluded; staff A (own booking) and the receptionist get it;
    // staff B (someone else's booking, own-scope) does not.
    const inbox = await prisma.notification.findMany({ where: { salonId: s.salonId, bookingId } });
    expect(inbox.map((n) => n.userId).sort()).toEqual([receptionistId, staffAId].sort());
    const staffMail = await prisma.user.findUniqueOrThrow({ where: { id: staffAId } });
    expect((await waitForMail(staffMail.email ?? "")).subject).toMatch(/^New booking /);
    const recMail = await prisma.user.findUniqueOrThrow({ where: { id: receptionistId } });
    expect((await waitForMail(recMail.email ?? "")).subject).toMatch(/^Lịch hẹn mới /);
    const ownerMail = await prisma.user.findUniqueOrThrow({ where: { id: s.ownerUserId } });
    expect(await countMailsTo(ownerMail.email ?? "")).toBe(0);

    const row = (await deliveries(bookingId)).find(
      (r) => r.recipientUserId === receptionistId && r.channel === "email",
    );
    expect(row).toMatchObject({
      status: "sent",
      units: 1,
      costEstimateVnd: app.get(AppConfig).env.NOTIFY_EMAIL_COST_VND,
      salonId: s.salonId,
    });
    const job = await app
      .get(QueueService)
      .queue(QUEUES.notify)
      .getJob(row?.idempotencyKey ?? "");
    expect(job?.data).toEqual({ deliveryId: row?.id });
  });

  it("sends exactly once when the event is replayed and when a worker crashes mid-send", async () => {
    const bookingId = await book();
    await pump();
    await pump(true); // duplicate outbox delivery
    await pump(true);
    const rows = await deliveries(bookingId);
    const recEmail = rows.filter(
      (r) => r.recipientUserId === receptionistId && r.channel === "email",
    );
    expect(recEmail).toHaveLength(1);
    expect(await prisma.notification.count({ where: { salonId: s.salonId, bookingId } })).toBe(2);

    // Worker A claims the delivery and dies before sending (lease held, status queued).
    const id = recEmail[0]?.id ?? "";
    await prisma.notificationDelivery.update({
      where: { id },
      data: { lockedUntil: new Date(now.getTime() + 60_000) },
    });
    expect((await sender.send(id, false)).kind).toBe("noop"); // the retry waits for the lease
    now = new Date(now.getTime() + 3 * 60_000);
    const [a, b] = await Promise.all([sender.send(id, false), sender.send(id, false)]);
    expect([a.kind, b.kind].sort()).toEqual(["noop", "sent"]);
    expect((await sender.send(id, false)).kind).toBe("noop");
    const rec = await prisma.user.findUniqueOrThrow({ where: { id: receptionistId } });
    const domain = mailAddressOf(app.get(AppConfig).env.MAIL_FROM).split("@")[1] ?? "";
    expect(await messageIdTo(rec.email ?? "")).toBe(
      `${recEmail[0]?.idempotencyKey ?? ""}@${domain}`,
    );
    expect(await countMailsTo(rec.email ?? "")).toBe(1);
  });

  it("shows team settings and the salon's Zalo state; validates and enforces permissions", async () => {
    const res = await http()
      .get(api("/notifications/settings"))
      .set("authorization", owner)
      .expect(200);
    const settings = notificationSettingsSchema.parse(res.body);
    expect(settings.events.map((e) => e.event)).toEqual([
      "salon.booking_received",
      "salon.booking_rescheduled",
      "salon.booking_cancelled",
      "salon.zalo_handoff",
    ]);
    expect(settings.zalo).toEqual({ connected: false, reminder24h: false, reminder2h: false });
    expect(JSON.stringify(settings)).not.toMatch(/replyTo|reminderOffsets|booking\.confirmed/);

    for (const bad of [
      { events: [{ event: "booking.confirmed", email: true, inApp: true }] },
      {
        events: [
          { event: "salon.booking_received", email: true, inApp: true },
          { event: "salon.booking_received", email: false, inApp: true },
        ],
      },
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
      .send({ events: [] })
      .expect(403);

    const put = await http()
      .put(api("/notifications/settings"))
      .set("authorization", owner)
      .send({ events: [{ event: "salon.booking_received", email: false, inApp: true }] })
      .expect(200);
    const saved = notificationSettingsSchema.parse(put.body);
    expect(saved.events.find((e) => e.event === "salon.booking_received")).toEqual({
      event: "salon.booking_received",
      email: false,
      inApp: true,
    });
    const bookingId = await book(vnAt("2026-12-04", "14:00"));
    await pump();
    const rows = await deliveries(bookingId);
    expect(rows.some((r) => r.channel === "email")).toBe(false);
    expect(rows.filter((r) => r.channel === "in_app")).toHaveLength(2);
    expect(
      await prisma.auditLog.count({
        where: { salonId: s.salonId, action: "notifications.settings_updated" },
      }),
    ).toBe(1);

    // Zalo connected: its reminder switches are shown (read-only here).
    await prisma.zaloOaConnection.create({
      data: {
        salonId: s.salonId,
        oaId: `oa_${Math.random().toString(36).slice(2, 10)}`,
        oaName: "Lotus OA",
        connectedByUserId: s.ownerUserId,
        accessTokenEnc: "enc",
        refreshTokenEnc: "enc",
        accessExpiresAt: new Date("2027-01-01T00:00:00Z"),
        reminder2h: false,
      },
    });
    const withZalo = notificationSettingsSchema.parse(
      (await http().get(api("/notifications/settings")).set("authorization", receptionist)).body,
    );
    expect(withZalo.zalo).toEqual({ connected: true, reminder24h: true, reminder2h: false });
  });

  it("shows only Zalo deliveries on the timeline and says when Zalo cannot reach the customer", async () => {
    const bookingId = await book(vnAt("2026-12-04", "10:00"));
    await pump();
    const timeline = async (id: string) =>
      bookingMessagesSchema.parse(
        (
          await http()
            .get(api(`/bookings/${id}/messages`))
            .set("authorization", owner)
            .expect(200)
        ).body,
      );
    expect(await timeline(bookingId)).toEqual({ items: [], zaloReach: "not_connected" });

    await prisma.zaloOaConnection.create({
      data: {
        salonId: s.salonId,
        oaId: `oa_${Math.random().toString(36).slice(2, 10)}`,
        oaName: "Lotus OA",
        connectedByUserId: s.ownerUserId,
        // Fixture only: never used to call Zalo (no Zalo worker in this test).
        accessTokenEnc: "enc",
        refreshTokenEnc: "enc",
        accessExpiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });
    expect((await timeline(bookingId)).zaloReach).toBe("not_linked");
    await prisma.zaloConversation.create({
      data: {
        salonId: s.salonId,
        oaId: "oa_x",
        zaloUserId: `u_${Math.random().toString(36).slice(2, 10)}`,
        phoneE164: "+84912345678",
      },
    });
    await prisma.zaloSendLog.createMany({
      data: [
        {
          salonId: s.salonId,
          bookingId,
          channel: "template",
          purpose: "booking_confirmation",
          dedupKey: `booking_update:${key()}`,
          status: "sent",
          sentAt: now,
        },
        {
          salonId: s.salonId,
          bookingId,
          channel: "cs",
          purpose: "reminder_2h",
          dedupKey: `reminder_2h:${bookingId}`,
          status: "rejected",
          errorCode: "window_closed",
        },
      ],
    });
    const t = await timeline(bookingId);
    expect(t.zaloReach).toBe("reachable");
    expect(t.items.map((i) => [i.channel, i.kind, i.status, i.reason, i.offsetMinutes])).toEqual(
      expect.arrayContaining([
        ["zalo_template", "booking_confirmation", "sent", null, null],
        ["zalo_chat", "reminder_2h", "rejected", "window_closed", 120],
      ]),
    );
    expect(t.items).toHaveLength(2);
    expect(JSON.stringify(t)).not.toMatch(/\+84|0912|email/);

    // Scope: own-scope staff see their own bookings only; another salon gets 404.
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
    const other = await createBookableSalon(prisma);
    await http()
      .get(`/api/v1/salons/${other.salonId}/bookings/${bookingId}/messages`)
      .set("authorization", await bearerFor(app, other.ownerUserId))
      .expect(404);
  });

  it("scopes the bell to what the member may see and keeps reads per member", async () => {
    const bookingId = await book(vnAt("2026-12-04", "10:00"), s.staffIds[0]);
    await pump();
    const staffA = await bearerFor(app, staffAId);
    const staffB = await bearerFor(app, staffBId);
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
    const other = await book(vnAt("2026-12-04", "13:00"), s.staffIds[0]);
    await pump();
    const mine = (await deliveries(other)).find(
      (r) => r.recipientUserId === staffAId && r.channel === "email",
    );
    expect(mine).toMatchObject({ status: "skipped", reason: "muted" });

    // Staff A loses a booking (moved to Mai): the badge no longer counts it.
    const moved = await book(vnAt("2026-12-04", "15:00"), s.staffIds[0]);
    await pump();
    const read = async () =>
      inboxSchema.parse(
        (await http().get(api("/notifications/inbox")).set("authorization", staffA)).body,
      );
    expect((await read()).unread).toBe(2);
    await prisma.booking.update({ where: { id: moved }, data: { staffId: s.staffIds[1] } });
    await prisma.bookingService.updateMany({
      where: { bookingId: moved },
      data: { staffId: s.staffIds[1] },
    });
    expect((await read()).unread).toBe(1);

    // Another salon's owner cannot mark this salon's items read.
    const otherSalon = await createBookableSalon(prisma);
    const otherOwner = await bearerFor(app, otherSalon.ownerUserId);
    const recItems = await prisma.notification.findMany({
      where: { salonId: s.salonId, userId: receptionistId },
    });
    await http()
      .post(`/api/v1/salons/${otherSalon.salonId}/notifications/inbox/read`)
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
    expect((await waitForMail(rec.email ?? "")).subject).toContain("Khách đang chờ trên Zalo");
  });

  it("re-checks team access at send time (removed member gets nothing)", async () => {
    await book();
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

  it("rebuilds lost team email jobs on reconciliation (Redis loss)", async () => {
    const bookingId = await book();
    await pump();
    const queue = app.get(QueueService).queue(QUEUES.notify);
    const row = (await deliveries(bookingId)).find((r) => r.channel === "email");
    expect(await queue.getJob(row?.idempotencyKey ?? "")).toBeDefined();
    await queue.obliterate({ force: true });
    expect(await queue.getJob(row?.idempotencyKey ?? "")).toBeUndefined();
    const result = await app.get(ReconcileService).reconcile();
    expect(result.requeued).toBeGreaterThan(0);
    expect((await queue.getJob(row?.idempotencyKey ?? ""))?.data).toEqual({ deliveryId: row?.id });
    // Reconciling again changes nothing (same rows, same job ids).
    await app.get(ReconcileService).reconcile();
    expect((await deliveries(bookingId)).filter((r) => r.channel === "email")).toHaveLength(2);
  });

  it("retries transient provider errors, fails on the last attempt or a permanent error", async () => {
    const provider = app.get<{ send: (m: unknown) => Promise<unknown> }>(EMAIL_PROVIDER);
    const emailRow = async (bookingId: string) =>
      (await deliveries(bookingId)).find(
        (r) => r.recipientUserId === receptionistId && r.channel === "email",
      );
    const bookingId = await book();
    await pump();
    const id = (await emailRow(bookingId))?.id ?? "";
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
      units: 0,
    });

    const other = await book(vnAt("2026-12-04", "12:00"));
    await pump();
    const bounce = await emailRow(other);
    spy.mockRejectedValueOnce(new PermanentChannelError("smtp_550"));
    expect(await sender.send(bounce?.id ?? "", false)).toEqual({
      kind: "failed",
      reason: "smtp_550",
    });
    expect(spy).toHaveBeenCalledTimes(3);

    // A failure while deciding (e.g. DB hiccup) releases the lease for the retry.
    const third = await book(vnAt("2026-12-04", "13:00"));
    await pump();
    const d3 = await emailRow(third);
    vi.spyOn(prisma.booking, "findFirst").mockRejectedValueOnce(new Error("db down"));
    await expect(sender.send(d3?.id ?? "", false)).rejects.toThrow("db down");
    expect(
      await prisma.notificationDelivery.findUnique({ where: { id: d3?.id ?? "" } }),
    ).toMatchObject({ status: "queued", lockedUntil: null });
  });

  it("keeps the delivery log per salon with cost on every paid send", async () => {
    await book();
    await pump();
    await sendDue();
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
