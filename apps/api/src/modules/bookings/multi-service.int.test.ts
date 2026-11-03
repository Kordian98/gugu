// Integration against the local stack: multi-service bookings (topic 06 M6.8) — availability for a
// chain, create with the same or another staff member per line, snapshots per line, reschedule
// of the whole chain, cancel, own-calendar scope, the feature flag, the availability cache, and
// the race harness (chains vs single bookings, no double-booking).
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  availabilitySchema,
  bookingCheckSchema,
  bookingFeaturesSchema,
  problemSchema,
  salonBookingListSchema,
  salonBookingSchema,
} from "@gugu/contracts";
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
import { AppConfig } from "../../infrastructure/config/app-config";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { BookingClock } from "./application/booking-clock";
import { BookingsModule } from "./bookings.facade";

const DAY = "2026-12-02";
const now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };

interface OccRow {
  staff_id: string | null;
  unit_id: string | null;
  s: Date;
  e: Date;
  active: boolean;
}

describe("multi-service bookings (integration, M6.8)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;
  /** Pedicure: 45 min, 5 min prep, 150.000đ; both staff do it. */
  let pediId: string;
  let linh: string;
  let mai: string;

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
    await clearRateLimits(app);
    s = await createBookableSalon(prisma); // gel 30 min + 10 min after-buffer, 200.000đ
    [linh, mai] = s.staffIds;
    owner = await bearerFor(app, s.ownerUserId);
    const pedi = await prisma.service.create({
      data: {
        salonId: s.salonId,
        name: { vi: "Chăm sóc móng chân", en: "Pedicure" },
        priceAmountMinor: 150_000n,
        durationMinutes: 45,
        bufferBeforeMinutes: 5,
      },
    });
    pediId = pedi.id;
    await prisma.staffService.createMany({
      data: s.staffIds.map((staffId) => ({ salonId: s.salonId, staffId, serviceId: pedi.id })),
    });
  });

  const key = () => `ms-${randomUUID()}`;
  const api = (path: string) => `/api/v1/salons/${s.salonId}${path}`;
  const chainBody = (patch: Record<string, unknown> = {}, pediStaff: string | null = mai) => ({
    serviceId: s.serviceId,
    staffId: linh,
    startsAt: vnAt(DAY, "10:00"),
    nextServices: [{ serviceId: pediId, staffId: pediStaff }],
    customer: { name: "Nguyễn Thị Hoa", phone: "0912 000 111" },
    source: "phone",
    ...patch,
  });
  const create = (body: Record<string, unknown>, auth = owner) =>
    request(http(app))
      .post(api("/bookings"))
      .set("authorization", auth)
      .set("idempotency-key", key())
      .send(body);
  const single = (staffId: string, hhmm: string) =>
    create({
      serviceId: s.serviceId,
      staffId,
      startsAt: vnAt(DAY, hhmm),
      customer: null,
      source: "walk_in",
    });
  const occupancy = (bookingId: string) =>
    prisma.$queryRaw<OccRow[]>`
      SELECT staff_id, resource_unit_id AS unit_id, lower(period) AS s, upper(period) AS e, active
      FROM booking_occupancy WHERE booking_id = ${bookingId}::uuid ORDER BY lower(period), staff_id`;
  const availability = async (q: Record<string, string>, auth = owner) =>
    availabilitySchema.parse(
      (
        await request(http(app))
          .get(api("/availability"))
          .query({ serviceId: s.serviceId, from: DAY, to: DAY, ...q })
          .set("authorization", auth)
          .expect(200)
      ).body,
    );
  const starts = (a: { days: { slots: { startsAt: string }[] }[] }) =>
    a.days.flatMap((d) => d.slots.map((x) => x.startsAt));
  const pediNext = (staffId: string | null = mai) =>
    JSON.stringify([{ serviceId: pediId, staffId }]);

  it("same staff back-to-back: one booking, two lines, snapshots per line, touching occupancy", async () => {
    const res = await create(chainBody({}, null)).expect(201);
    const b = salonBookingSchema.parse(res.body);
    // Gel 10:00–10:30, then Linh again after max(10 min cleanup, 5 min prep) = 10:40–11:25.
    expect(b).toMatchObject({
      staffId: linh,
      startsAt: vnAt(DAY, "10:00"),
      endsAt: vnAt(DAY, "11:25"),
      totalPriceMinor: 350_000,
      service: { serviceId: s.serviceId },
    });
    expect(b.services.map((l) => [l.serviceId, l.staffId, l.startsAt, l.endsAt])).toEqual([
      [s.serviceId, linh, vnAt(DAY, "10:00"), vnAt(DAY, "10:30")],
      [pediId, linh, vnAt(DAY, "10:40"), vnAt(DAY, "11:25")],
    ]);
    expect(b.services[1]).toMatchObject({ priceMinor: 150_000, bufferBeforeMinutes: 5 });
    const rows = await occupancy(b.id);
    expect(rows.map((r) => [r.staff_id, r.s.toISOString(), r.e.toISOString()])).toEqual([
      [linh, vnAt(DAY, "10:00"), vnAt(DAY, "10:40")],
      [linh, vnAt(DAY, "10:40"), vnAt(DAY, "11:25")],
    ]);
    const lines = await prisma.bookingService.findMany({
      where: { bookingId: b.id },
      orderBy: { sequence: "asc" },
    });
    expect(lines.map((l) => l.sequence)).toEqual([1, 2]);

    // Snapshots survive catalog changes (AC10, per line).
    await prisma.service.update({ where: { id: pediId }, data: { priceAmountMinor: 999_000n } });
    const again = salonBookingSchema.parse(
      (
        await request(http(app))
          .get(api(`/bookings/${b.id}`))
          .set("authorization", owner)
      ).body,
    );
    expect(again.services[1]?.priceMinor).toBe(150_000);
    expect(again.totalPriceMinor).toBe(350_000);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: b.id, type: "booking.created" },
    });
    expect(outbox.payload).toMatchObject({ staffIds: [linh], serviceCount: 2 });
  });

  it("DB: booking_services_valid allows lines 1..4 only (SQLSTATE 23514)", async () => {
    const b = salonBookingSchema.parse((await create(chainBody()).expect(201)).body);
    const line = await prisma.bookingService.findFirstOrThrow({
      where: { bookingId: b.id, sequence: 2 },
    });
    await prisma.bookingService.update({ where: { id: line.id }, data: { sequence: 4 } });
    await expect(
      prisma.$executeRaw`UPDATE booking_services SET sequence = 5 WHERE id = ${line.id}::uuid`,
    ).rejects.toThrow(/23514|booking_services_valid/);
  });

  it("different staff: Mai starts when Linh finishes; her prep runs during gel", async () => {
    const b = salonBookingSchema.parse((await create(chainBody()).expect(201)).body);
    expect(b.services.map((l) => [l.staffId, l.startsAt, l.endsAt])).toEqual([
      [linh, vnAt(DAY, "10:00"), vnAt(DAY, "10:30")],
      [mai, vnAt(DAY, "10:30"), vnAt(DAY, "11:15")],
    ]);
    const rows = await occupancy(b.id);
    expect(rows.map((r) => [r.staff_id, r.s.toISOString(), r.e.toISOString()])).toEqual([
      [linh, vnAt(DAY, "10:00"), vnAt(DAY, "10:40")],
      [mai, vnAt(DAY, "10:25"), vnAt(DAY, "11:15")],
    ]);
    // Calendar: the booking shows for each staff member's filter.
    for (const staffId of [linh, mai]) {
      const list = salonBookingListSchema.parse(
        (
          await request(http(app))
            .get(api("/bookings"))
            .query({ from: DAY, to: DAY, staffId })
            .set("authorization", owner)
            .expect(200)
        ).body,
      );
      expect(list.items.map((x) => x.id)).toEqual([b.id]);
    }
  });

  it("availability returns only starts where the whole chain fits, with the plan per line", async () => {
    await single(mai, "10:30").expect(201); // Mai busy 10:30–11:10
    const a = await availability({ staffId: linh, nextServices: pediNext() });
    const offered = starts(a);
    expect(offered).toContain(vnAt(DAY, "09:00")); // Mai 09:30–10:15 (+5 prep) free
    expect(offered).not.toContain(vnAt(DAY, "10:00")); // Mai 10:25–11:15 overlaps
    expect(offered).not.toContain(vnAt(DAY, "09:45")); // Mai 10:10–11:00 overlaps
    expect(a.durationMinutes).toBe(75);
    const slot = a.days[0]?.slots.find((x) => x.startsAt === vnAt(DAY, "09:00"));
    expect(slot?.endsAt).toBe(vnAt(DAY, "10:15"));
    expect(slot?.lines).toEqual([
      {
        serviceId: s.serviceId,
        staffId: linh,
        startsAt: vnAt(DAY, "09:00"),
        endsAt: vnAt(DAY, "09:30"),
      },
      { serviceId: pediId, staffId: mai, startsAt: vnAt(DAY, "09:30"), endsAt: vnAt(DAY, "10:15") },
    ]);
    // The whole chain must end by 18:00: last start 16:45.
    expect(offered.at(-1)).toBe(vnAt(DAY, "16:45"));
    // Single-service clients are unchanged: one line per slot.
    const plain = await availability({ staffId: linh });
    expect(plain.days[0]?.slots[0]?.lines).toHaveLength(1);

    // An unbookable chain start is a conflict, not an override question.
    const taken = await create(chainBody()).expect(409);
    expect(problemSchema.parse(taken.body).code).toBe("booking.slot_taken");
    const check = bookingCheckSchema.parse(
      (
        await request(http(app))
          .get(api("/booking-check"))
          .query({
            serviceId: s.serviceId,
            staffId: linh,
            nextServices: pediNext(),
            startsAt: vnAt(DAY, "10:00"),
          })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(check).toMatchObject({ bookable: false, blocked: true });
  });

  it("a chain running past closing needs the audited hours override", async () => {
    const late = chainBody({ startsAt: vnAt(DAY, "17:30") });
    const res = await create(late).expect(409);
    expect(problemSchema.parse(res.body).code).toBe("booking.override_required");
    const ok = await create({ ...late, overrides: ["hours"], overrideReason: "Khách quen" }).expect(
      201,
    );
    expect(salonBookingSchema.parse(ok.body)).toMatchObject({
      ruleOverrides: ["hours"],
      endsAt: vnAt(DAY, "18:45"),
    });
  });

  it("reschedule moves the whole chain; a conflict leaves every line untouched (AC8)", async () => {
    const b = salonBookingSchema.parse((await create(chainBody()).expect(201)).body);
    const before = await occupancy(b.id);
    await single(mai, "16:30").expect(201);
    const reschedule = (startsAt: string, extra: Record<string, unknown> = {}) =>
      request(http(app))
        .post(api(`/bookings/${b.id}/reschedule`))
        .set("authorization", owner)
        .set("idempotency-key", key())
        .send({ startsAt, ...extra });

    const blocked = await reschedule(vnAt(DAY, "16:00")).expect(409); // Mai busy at 16:30
    expect(problemSchema.parse(blocked.body).code).toBe("booking.slot_taken");
    expect(await occupancy(b.id)).toEqual(before);

    const moved = salonBookingSchema.parse((await reschedule(vnAt(DAY, "14:00")).expect(200)).body);
    expect(moved.services.map((l) => [l.staffId, l.startsAt, l.endsAt])).toEqual([
      [linh, vnAt(DAY, "14:00"), vnAt(DAY, "14:30")],
      [mai, vnAt(DAY, "14:30"), vnAt(DAY, "15:15")],
    ]);
    expect(moved).toMatchObject({ endsAt: vnAt(DAY, "15:15"), totalPriceMinor: 350_000 });
    expect((await occupancy(b.id)).map((r) => [r.staff_id, r.s.toISOString()])).toEqual([
      [linh, vnAt(DAY, "14:00")],
      [mai, vnAt(DAY, "14:25")],
    ]);
    // The old times are free again.
    await single(mai, "10:30").expect(201);

    // `staffId` moves the lines the first line's staff member was doing (here: gel only).
    const swapped = salonBookingSchema.parse(
      (await reschedule(vnAt(DAY, "14:00"), { staffId: mai }).expect(200)).body,
    );
    // Mai now does both: gel 14:00–14:30, pedicure after max(10, 5) = 14:40.
    expect(swapped.services.map((l) => [l.staffId, l.startsAt])).toEqual([
      [mai, vnAt(DAY, "14:00")],
      [mai, vnAt(DAY, "14:40")],
    ]);
  });

  it("cancel releases every line of the chain", async () => {
    const b = salonBookingSchema.parse((await create(chainBody()).expect(201)).body);
    await request(http(app))
      .post(api(`/bookings/${b.id}/transitions`))
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ to: "cancelled_by_salon", reason: "Khách báo bận" })
      .expect(200);
    expect((await occupancy(b.id)).every((r) => !r.active)).toBe(true);
    await single(linh, "10:00").expect(201);
    await single(mai, "10:30").expect(201);
  });

  it("own calendar: staff on one line can read a chain but not change it (security review)", async () => {
    const b = salonBookingSchema.parse((await create(chainBody()).expect(201)).body);
    const staffUser = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUser },
    });
    await prisma.staffProfile.update({ where: { id: mai }, data: { salonMemberId: member.id } });
    const maiAuth = await bearerFor(app, staffUser);
    // Reads: Mai does the second line, so she sees the appointment.
    const list = salonBookingListSchema.parse(
      (
        await request(http(app))
          .get(api("/bookings"))
          .query({ from: DAY, to: DAY })
          .set("authorization", maiAuth)
          .expect(200)
      ).body,
    );
    expect(list.items.map((x) => x.id)).toEqual([b.id]);
    await request(http(app))
      .get(api(`/bookings/${b.id}`))
      .set("authorization", maiAuth)
      .expect(200);

    // Writes: Linh's line is not hers — cancel, transitions and reschedule read as not found.
    const write = (path: string, body: Record<string, unknown>) =>
      request(http(app))
        .post(api(`/bookings/${b.id}/${path}`))
        .set("authorization", maiAuth)
        .set("idempotency-key", key())
        .send(body);
    for (const res of [
      await write("transitions", { to: "cancelled_by_salon", reason: "Khách báo bận" }),
      await write("transitions", { to: "checked_in" }),
      await write("reschedule", { startsAt: vnAt(DAY, "14:00") }),
    ]) {
      expect(res.status).toBe(404);
      expect(problemSchema.parse(res.body).code).toBe("booking.not_found");
    }
    const unchanged = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(unchanged).toMatchObject({
      status: "confirmed",
      startsAt: new Date(vnAt(DAY, "10:00")),
    });
    expect(await prisma.bookingStatusHistory.count({ where: { bookingId: b.id } })).toBe(1);
    expect((await occupancy(b.id)).every((r) => r.active)).toBe(true);

    // Own-calendar staff book every line into their own calendar, and may change those.
    const own = salonBookingSchema.parse(
      (
        await create(
          chainBody({ staffId: null, startsAt: vnAt(DAY, "15:00") }, null),
          maiAuth,
        ).expect(201)
      ).body,
    );
    expect(own.services.map((l) => l.staffId)).toEqual([mai, mai]);
    await request(http(app))
      .post(api(`/bookings/${own.id}/reschedule`))
      .set("authorization", maiAuth)
      .set("idempotency-key", key())
      .send({ startsAt: vnAt(DAY, "16:00") })
      .expect(200);
    await request(http(app))
      .post(api(`/bookings/${own.id}/transitions`))
      .set("authorization", maiAuth)
      .set("idempotency-key", key())
      .send({ to: "cancelled_by_salon", reason: "Khách báo bận" })
      .expect(200);
  });

  it("flag booking.multiService off: chains rejected, single service unchanged", async () => {
    const env = app.get(AppConfig).env as { BOOKING_MULTI_SERVICE: boolean };
    const features = async () =>
      bookingFeaturesSchema.parse(
        (await request(http(app)).get(api("/booking-features")).set("authorization", owner)).body,
      );
    expect(await features()).toEqual({ multiService: true, maxServices: 4 });
    env.BOOKING_MULTI_SERVICE = false;
    try {
      expect((await features()).multiService).toBe(false);
      const res = await create(chainBody()).expect(422);
      expect(problemSchema.parse(res.body).code).toBe("booking.multi_service_disabled");
      await single(linh, "10:00").expect(201);
    } finally {
      env.BOOKING_MULTI_SERVICE = true;
    }
  });

  it("availability cache: chain results are keyed by the chain and fresh after writes", async () => {
    const q = { staffId: linh, nextServices: pediNext() };
    expect(starts(await availability(q))).toContain(vnAt(DAY, "10:00"));
    expect(starts(await availability({ staffId: linh }))).toContain(vnAt(DAY, "10:30"));
    const keys = await app.get(RedisService).client.keys(`avail:v1:${s.salonId}:*`);
    expect(keys.length).toBe(2); // single and chain do not share an entry
    // A single booking for Mai at the chain's second-line time invalidates the chain view.
    await single(mai, "10:30").expect(201);
    expect(starts(await availability(q))).not.toContain(vnAt(DAY, "10:00"));
    // A catalog change (pedicure longer) bumps availability_version: the chain is re-planned.
    await prisma.$transaction([
      prisma.service.update({ where: { id: pediId }, data: { durationMinutes: 90 } }),
      prisma.salonSettings.update({
        where: { salonId: s.salonId },
        data: { availabilityVersion: { increment: 1 } },
      }),
    ]);
    const longer = await availability(q);
    expect(longer.durationMinutes).toBe(120);
    expect(starts(longer).at(-1)).toBe(vnAt(DAY, "16:00"));
  });

  it("race harness: 10 chains vs 10 single bookings for overlapping time → exactly 1 wins", async () => {
    const requests = [
      ...Array.from({ length: 10 }, () => create(chainBody())), // Linh 10:00, Mai 10:25–11:15
      ...Array.from({ length: 10 }, () => single(mai, "10:30")), // Mai 10:30–11:10
    ];
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((c) => c >= 500)).toEqual([]);
    expect(statuses.filter((c) => c === 201)).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
      expect(problemSchema.parse(r.body).code).toBe("booking.slot_taken");
    }
    await expectNoOverlap();
  });

  it("race harness: chains and singles over a shared chair never exceed its units", async () => {
    const chair = await prisma.resourceType.create({
      data: { salonId: s.salonId, name: "Ghế" },
    });
    const res = await prisma.resource.create({
      data: { salonId: s.salonId, resourceTypeId: chair.id, name: "Ghế" },
    });
    await prisma.resourceUnit.create({
      data: { salonId: s.salonId, resourceId: res.id, position: 1 },
    });
    // Only the pedicure needs the chair.
    await prisma.serviceResourceRequirement.create({
      data: { salonId: s.salonId, serviceId: pediId, resourceTypeId: chair.id, quantity: 1 },
    });
    const pediSingle = (staffId: string) =>
      create({
        serviceId: pediId,
        staffId,
        startsAt: vnAt(DAY, "10:30"),
        customer: null,
        source: "walk_in",
      });
    const results = await Promise.all([
      // Chain: gel Linh 10:00, pedicure Mai 10:30 on the chair.
      ...Array.from({ length: 6 }, () => create(chainBody())),
      // Pedicure for Linh at 10:30 needs the same chair.
      ...Array.from({ length: 6 }, () => pediSingle(linh)),
    ]);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((c) => c >= 500)).toEqual([]);
    expect(statuses.filter((c) => c === 201)).toHaveLength(1);
    await expectNoOverlap();
  });

  /** No two active claims of one staff member or unit overlap (the EXCLUDE constraints' promise). */
  async function expectNoOverlap(): Promise<void> {
    const clashes = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM booking_occupancy a JOIN booking_occupancy b
        ON a.id < b.id AND a.active AND b.active AND a.period && b.period
       AND (a.staff_id = b.staff_id OR a.resource_unit_id = b.resource_unit_id)
      WHERE a.salon_id = ${s.salonId}::uuid AND b.salon_id = ${s.salonId}::uuid`;
    expect(Number(clashes[0]?.n ?? -1)).toBe(0);
  }
});
