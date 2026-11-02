// Integration against the local stack: outbox relay (04-S5), CRM "book anyway?" rule check and
// override_required errors (q18), account-deletion anonymisation of bookings (q71).
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookingCheckSchema, salonBookingSchema } from "@gugu/contracts";
import {
  type BookableSalonFixture,
  createBookableSalon,
  vnAt,
} from "../../../test/factories/booking";
import { addSalonMember, bearerFor } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { OutboxRelay } from "../../infrastructure/outbox/outbox.relay";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../infrastructure/queue/queue.service";
import { QUEUES } from "../../infrastructure/queue/queues";
import { BookingClock } from "./application/booking-clock";
import { BookingAnonymiser, BookingsModule } from "./bookings.facade";

const DAY = "2026-12-02";
let now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };
const body = (res: { body: unknown }) =>
  res.body as { id: string; code: string; errors?: { path: string; code: string }[] };

describe("outbox relay, rule overrides, anonymisation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, BookingsModule] })
      .overrideProvider(BookingClock)
      .useValue(clock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    now = new Date("2026-12-01T08:00:00+07:00");
    await clearRateLimits(app);
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
  });

  const book = (patch: Record<string, unknown> = {}, auth = owner) =>
    request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", auth)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "10:00"),
        customer: { name: "Phạm Lan", phone: "0909 111 222" },
        source: "phone",
        ...patch,
      });
  const check = (q: Record<string, string>, auth = owner) =>
    request(http(app))
      .get(`/api/v1/salons/${s.salonId}/booking-check`)
      .query({ serviceId: s.serviceId, staffId: s.staffIds[0], ...q })
      .set("authorization", auth)
      .expect(200)
      .then((r) => bookingCheckSchema.parse(r.body));

  it("relay publishes committed events once, as jobs keyed by event id", async () => {
    const relay = app.get(OutboxRelay);
    await relay.publishPending(); // drain anything older
    const created = body(await book().expect(201));
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: created.id, type: "booking.created" },
    });
    // The create path already kicked the relay; publish explicitly (no worker in this test).
    const first = await relay.publishPending();
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    if (first.published === 0) expect(row.publishedAt).not.toBeNull();
    expect(row.publishedAt).not.toBeNull();
    const job = await app.get(QueueService).queue(QUEUES.outbox).getJob(event.id);
    expect(job?.data).toMatchObject({
      id: event.id,
      type: "booking.created",
      aggregateId: created.id,
    });
    expect((await relay.publishPending()).published).toBe(0);
  });

  it("booking-check and 409 override_required tell the CRM which overrides would help", async () => {
    expect(await check({ startsAt: vnAt(DAY, "11:00") })).toEqual({
      bookable: true,
      requiredOverrides: [],
      blocked: false,
      canOverride: true,
    });
    expect(await check({ startsAt: vnAt(DAY, "20:00") })).toMatchObject({
      bookable: false,
      requiredOverrides: ["hours"],
      blocked: false,
    });
    const res = body(await book({ startsAt: vnAt(DAY, "20:00"), source: "walk_in" }).expect(409));
    expect(res.code).toBe("booking.override_required");
    expect(res.errors).toEqual([{ path: "overrides", code: "hours" }]);
    await book({
      startsAt: vnAt(DAY, "20:00"),
      source: "walk_in",
      overrides: ["hours"],
      overrideReason: "khách quen đến muộn",
    }).expect(201);
    // Now that time is taken: nothing helps.
    expect(await check({ startsAt: vnAt(DAY, "20:00") })).toMatchObject({
      blocked: true,
      requiredOverrides: [],
    });
    expect(
      body(
        await book({
          startsAt: vnAt(DAY, "20:00"),
          overrides: ["hours"],
          overrideReason: "x x x",
        }).expect(409),
      ).code,
    ).toBe("booking.slot_taken");
    // Staff can see the check but not override.
    const staffUser = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUser },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[0] },
      data: { salonMemberId: member.id },
    });
    const staff = await bearerFor(app, staffUser);
    expect(await check({ startsAt: vnAt(DAY, "21:00") }, staff)).toMatchObject({
      requiredOverrides: ["hours"],
      canOverride: false,
    });
  });

  it("q71: deleting the account cancels upcoming bookings and anonymises all, idempotently", async () => {
    // A phone no other test uses (the hook matches across salons by phone).
    const digits = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
    const local = `090${digits}`;
    const e164 = `+8490${digits}`;
    const upcoming = body(await book({ customer: { name: "Phạm Lan", phone: local } }).expect(201));
    now = new Date(vnAt(DAY, "09:00"));
    const other = body(
      await book({
        startsAt: vnAt(DAY, "15:00"),
        customer: { name: "Khác", phone: "0911 000 999" },
      }).expect(201),
    );
    now = new Date("2026-12-01T08:00:00+07:00");
    const past = await prisma.booking.update({
      where: { id: other.id },
      data: { customerPhoneE164: e164, customerName: "Phạm Lan" },
    });
    const userId = (await prisma.user.create({ data: { phoneE164: null } })).id;

    const result = await app.get(BookingAnonymiser).anonymiseCustomer({ userId, phoneE164: e164 });
    expect(result).toEqual({ cancelled: 2, anonymised: 2 });
    const rows = await prisma.booking.findMany({ where: { id: { in: [upcoming.id, past.id] } } });
    for (const r of rows) {
      expect(r).toMatchObject({
        status: "cancelled_by_customer",
        customerName: "[deleted]",
        customerPhoneE164: null,
        customerPhoneHash: null,
        customerNote: null,
      });
      expect(r.customerAnonymisedAt).not.toBeNull();
    }
    const last = await prisma.bookingStatusHistory.findFirstOrThrow({
      where: { bookingId: upcoming.id },
      orderBy: { occurredAt: "desc" },
    });
    expect(last).toMatchObject({ actorType: "system", reasonCode: "account_deleted" });
    const view = salonBookingSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/bookings/${upcoming.id}`)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(view).toMatchObject({
      customerAnonymised: true,
      customer: { name: "[deleted]", phone: null },
    });
    expect(await app.get(BookingAnonymiser).anonymiseCustomer({ userId, phoneE164: e164 })).toEqual(
      {
        cancelled: 0,
        anonymised: 0,
      },
    );
  });
});
