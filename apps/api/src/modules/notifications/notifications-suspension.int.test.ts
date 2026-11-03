// Customer notifications of a salon suspended by GuGu (q89, ADR-0010), against the local stack
// (TEST_DATABASE_URL, Valkey DB 15, Mailpit), fake clock, worker inline. Confirmations and
// reminders are re-checked at send time: while suspended they are logged `skipped` with reason
// `salon_suspended`; after unsuspend a reminder whose time is still to come goes out, one whose
// time fell inside the suspension does not. Team notifications are not affected.
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { salonBookingSchema } from "@gugu/contracts";
import {
  createBookableSalon,
  type BookableSalonFixture,
  vnAt,
} from "../../../test/factories/booking";
import { addSalonMember, bearerFor, testEmail } from "../../../test/factories/identity";
import { countMailsTo } from "../../../test/mailpit";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import type { DomainEvent } from "../../infrastructure/outbox/domain-events";
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

describe("customer notifications of a suspended salon (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let handler: NotificationEventsHandler;
  let sender: SenderService;
  let admin: string;
  let s: BookableSalonFixture;
  let owner: string;
  let seq = 0;

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
    await clearRateLimits(app);
    const user = await prisma.user.create({
      data: {
        email: testEmail("notify-susp-admin"),
        emailVerifiedAt: new Date(),
        platformRole: "super_admin",
        profile: { create: {} },
      },
    });
    admin = await bearerFor(app, user.id);
  });

  afterAll(async () => {
    await app.get(QueueService).queue(QUEUES.notify).obliterate({ force: true });
    await app.close();
  });

  beforeEach(async () => {
    now = new Date("2026-12-01T01:00:00Z");
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
  });

  const http = () => request(app.getHttpServer() as Server);
  const adminAction = (action: "suspend" | "unsuspend") =>
    http()
      .post(`/api/v1/admin/salons/${s.salonId}/${action}`)
      .set("authorization", admin)
      .send({ reason: "Notification suspension integration test" })
      .expect(200);

  /** Runs the outbox consumer for this salon's events (like the relay would). */
  async function pump(): Promise<void> {
    const events = await prisma.outboxEvent.findMany({
      where: { salonId: s.salonId },
      orderBy: { occurredAt: "asc" },
    });
    for (const e of events) {
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

  /** Runs the send worker for every due customer delivery of this salon. */
  async function sendDue(): Promise<void> {
    const due = await prisma.notificationDelivery.findMany({
      where: {
        salonId: s.salonId,
        audience: "customer",
        channel: "email",
        status: { in: ["queued", "scheduled"] },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
    for (const d of due) await sender.send(d.id, true);
  }

  async function book(email: string): Promise<string> {
    const res = await http()
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `notify-susp-${String(Date.now())}-${String(seq++)}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt("2026-12-04", "10:00"),
        source: "phone",
        customer: { name: "Nguyễn Thị Lan", phone: "0912 345 678", email },
      })
      .expect(201);
    return salonBookingSchema.parse(res.body).id;
  }

  const customerRows = (bookingId: string) =>
    prisma.notificationDelivery.findMany({
      where: { salonId: s.salonId, bookingId, audience: "customer" },
      orderBy: [{ createdAt: "asc" }, { scheduledFor: "asc" }, { id: "asc" }],
    });

  it("skips the confirmation and the reminder due while suspended; sends the later one after unsuspend", async () => {
    const customer = testEmail("susp-customer");
    const bookingId = await book(customer);
    await pump();
    await adminAction("suspend");

    // The confirmation planned before the suspension is re-checked at send time.
    await sendDue();
    const confirmation = (await customerRows(bookingId)).find(
      (r) => r.event === "booking.confirmed",
    );
    expect(confirmation).toMatchObject({ status: "skipped", reason: "salon_suspended" });

    // The 24 h reminder's time comes while suspended: skipped, never sent later.
    now = new Date(vnAt("2026-12-03", "10:00"));
    await sendDue();
    let reminders = (await customerRows(bookingId)).filter((r) => r.event === "booking.reminder");
    expect(reminders.map((r) => [r.variant, r.status, r.reason])).toEqual([
      ["1440m", "skipped", "salon_suspended"],
      ["120m", "scheduled", null],
    ]);

    await adminAction("unsuspend");
    now = new Date(vnAt("2026-12-03", "10:05"));
    await sendDue();
    expect(await countMailsTo(customer)).toBe(0);

    // The 2 h reminder is still to come after unsuspend: it goes out, once.
    now = new Date(vnAt("2026-12-04", "08:00"));
    await sendDue();
    await sendDue();
    reminders = (await customerRows(bookingId)).filter((r) => r.event === "booking.reminder");
    expect(reminders.map((r) => [r.variant, r.status])).toEqual([
      ["1440m", "skipped"],
      ["120m", "sent"],
    ]);
    expect(await countMailsTo(customer)).toBe(1);
  });

  it("leaves other salons' customers alone (tenant isolation)", async () => {
    const other = s;
    const otherCustomer = testEmail("susp-other");
    const otherBooking = await book(otherCustomer);
    await pump();

    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
    await adminAction("suspend");

    s = other;
    await sendDue();
    expect(
      (await customerRows(otherBooking)).find((r) => r.event === "booking.confirmed"),
    ).toMatchObject({ status: "sent" });
    expect(await countMailsTo(otherCustomer)).toBe(1);
  });
  it("keeps team notifications going while the salon is suspended (only customers are paused)", async () => {
    // The booked staff member has an account: they get the team email about the new booking.
    const staffUserId = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUserId },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[0] },
      data: { salonMemberId: member.id },
    });
    const customer = testEmail("susp-team-customer");
    const bookingId = await book(customer);
    await pump();
    await adminAction("suspend");
    const team = await prisma.notificationDelivery.findMany({
      where: { salonId: s.salonId, bookingId, audience: "team", channel: "email" },
    });
    expect(team.length, `team deliveries for booking ${bookingId}`).toBeGreaterThan(0);
    for (const d of team) await sender.send(d.id, true);
    const after = await prisma.notificationDelivery.findMany({
      where: { id: { in: team.map((d) => d.id) } },
    });
    expect(after.map((d) => [d.event, d.status, d.reason])).toEqual(
      team.map((d) => [d.event, "sent", null]),
    );
    // The customer side of the same booking stays paused.
    await sendDue();
    expect(await countMailsTo(customer)).toBe(0);
  });
});
