// Integration against the local stack: booking engine end to end (spec 06 AC1–AC15) — CRM and
// public booking page, idempotency, concurrency harness, holds, policy windows, scopes, tenancy.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  availabilitySchema,
  problemSchema,
  publicBookingCreatedSchema,
  publicBookingSchema,
  salonBookingListSchema,
  salonBookingSchema,
} from "@gugu/contracts";
import {
  createBookableSalon,
  type BookableSalonFixture,
  vnAt,
} from "../../../test/factories/booking";
import { addSalonMember, bearerFor, createSalonFixture } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingClock } from "./application/booking-clock";
import { BookingMaintenance } from "./bookings.facade";

/** Typed view of a supertest JSON body (responses are validated by schema where it matters). */
interface Body {
  id: string;
  code: string;
  status: string;
  staffId: string;
  ruleOverrides: string[];
  service: { priceMinor: number };
  booking: { id: string; status: string };
}
const body = (res: { body: unknown }): Body => res.body as Body;

const DAY = "2026-12-02";
let now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };

describe("booking engine (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

  const key = () => `test-${randomUUID()}`;
  const crmBody = (patch: Record<string, unknown> = {}) => ({
    serviceId: s.serviceId,
    staffId: s.staffIds[0],
    startsAt: vnAt(DAY, "10:00"),
    customer: { name: "Nguyễn Văn An", phone: "0912 345 678" },
    source: "phone",
    ...patch,
  });
  const crmCreate = (body: Record<string, unknown>, auth = owner, k = key()) =>
    request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", auth)
      .set("idempotency-key", k)
      .send(body);
  const publicBody = (patch: Record<string, unknown> = {}) => ({
    serviceId: s.serviceId,
    startsAt: vnAt(DAY, "10:00"),
    deviceId: `device-${randomUUID()}`,
    customer: { name: "Trần Thị Bình", phone: "0987 654 321" },
    ...patch,
  });
  const publicCreate = (body: Record<string, unknown>, k = key()) =>
    request(http(app))
      .post(`/api/v1/public/salons/${s.slug}/bookings`)
      .set("idempotency-key", k)
      .send(body);

  it("CRM create: confirmed, snapshots, history, outbox, occupancy; idempotent replay", async () => {
    const k = key();
    const res = await crmCreate(crmBody({ addOnIds: [s.addOnId] }), owner, k).expect(201);
    const booking = salonBookingSchema.parse(res.body);
    expect(booking).toMatchObject({
      status: "confirmed",
      source: "phone",
      staffId: s.staffIds[0],
      startsAt: vnAt(DAY, "10:00"),
      endsAt: vnAt(DAY, "10:45"),
      totalPriceMinor: 250_000,
      paymentMethod: "pay_at_salon",
      customer: { name: "Nguyễn Văn An", phone: "+84912345678" },
    });
    expect(booking.service.addOns).toHaveLength(1);
    expect(booking.referenceCode).toMatch(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/);

    const replay = await crmCreate(crmBody({ addOnIds: [s.addOnId] }), owner, k).expect(201);
    expect(body(replay).id).toBe(booking.id);
    expect(await prisma.booking.count({ where: { salonId: s.salonId } })).toBe(1);
    const mismatch = await crmCreate(crmBody({ note: "other" }), owner, k).expect(422);
    expect(problemSchema.parse(mismatch.body).code).toBe("booking.idempotency_mismatch");
    await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .send(crmBody())
      .expect(400);

    expect(await prisma.bookingStatusHistory.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: booking.id, type: "booking.created" },
      }),
    ).toBe(1);
    // Snapshot survives catalog price changes (AC10).
    await prisma.service.update({
      where: { id: s.serviceId },
      data: { priceAmountMinor: 999_000n },
    });
    const again = await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/bookings/${booking.id}`)
      .set("authorization", owner)
      .expect(200);
    expect(body(again).service.priceMinor).toBe(250_000);
  });

  it("concurrency harness: 20 parallel creates for one staff/time → exactly 1 booking (AC1)", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        crmCreate(
          crmBody({
            customer: { name: `Khách ${String(i)}`, phone: `0912 000 ${String(100 + i)}` },
          }),
        ),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((c) => c === 201)).toHaveLength(1);
    expect(statuses.filter((c) => c === 409)).toHaveLength(19);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(body(r).code).toBe("booking.slot_taken");
    }
    const overlapping = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM booking_occupancy a JOIN booking_occupancy b
        ON a.staff_id = b.staff_id AND a.id < b.id AND a.period && b.period
      WHERE a.active AND b.active AND a.salon_id = ${s.salonId}::uuid`;
    expect(Number(overlapping[0]?.n)).toBe(0);
  });

  it("buffers, back-to-back, any-staff assignment and availability (AC2, AC4)", async () => {
    await crmCreate(crmBody()).expect(201); // Linh 10:00–10:30 + 10 min buffer
    expect(body(await crmCreate(crmBody({ startsAt: vnAt(DAY, "10:30") }))).code).toBe(
      "booking.slot_taken",
    );
    await crmCreate(crmBody({ startsAt: vnAt(DAY, "10:45") })).expect(201);
    const any = await crmCreate(crmBody({ staffId: null })).expect(201);
    expect(body(any).staffId).toBe(s.staffIds[1]); // Mai is free and less loaded

    const avail = await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/availability`)
      .query({ serviceId: s.serviceId, staffId: s.staffIds[0], from: DAY, to: DAY })
      .set("authorization", owner)
      .expect(200);
    const starts = availabilitySchema.parse(avail.body).days[0]?.slots.map((x) => x.startsAt) ?? [];
    expect(starts).not.toContain(vnAt(DAY, "10:15"));
    expect(starts).not.toContain(vnAt(DAY, "10:30"));
    expect(starts).toContain(vnAt(DAY, "11:30"));
    expect(starts.at(-1)).toBe(vnAt(DAY, "17:15")); // 30 min + 10 buffer must end by 18:00

    const tooLong = await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/availability`)
      .query({ serviceId: s.serviceId, from: "2026-12-01", to: "2027-03-01" })
      .set("authorization", owner)
      .expect(400);
    expect(body(tooLong).code).toBe("common.validation_failed");
  });

  it("public page: hold → book with manage link; holds block others until they expire (AC6)", async () => {
    const deviceId = `device-${randomUUID()}`;
    const hold = await request(http(app))
      .post(`/api/v1/public/salons/${s.slug}/holds`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "11:00"),
        deviceId,
      })
      .expect(201);
    // Another device can't hold or book Linh at 11:00 meanwhile.
    await request(http(app))
      .post(`/api/v1/public/salons/${s.slug}/holds`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "11:00"),
        deviceId: "other-device-1",
      })
      .expect(409);
    const created = await publicCreate(
      publicBody({
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "11:00"),
        deviceId,
        holdId: body(hold).id,
      }),
    ).expect(201);
    const { booking, manageToken } = publicBookingCreatedSchema.parse(created.body);
    expect(booking.status).toBe("confirmed");
    expect(await prisma.bookingHold.count({ where: { salonId: s.salonId } })).toBe(0);
    const view = await request(http(app)).get(`/api/v1/public/bookings/${manageToken}`).expect(200);
    expect(publicBookingSchema.parse(view.body)).toMatchObject({
      id: booking.id,
      cancellable: true,
    });

    // An expired hold does not block (no sweep needed).
    await request(http(app))
      .post(`/api/v1/public/salons/${s.slug}/holds`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[1],
        startsAt: vnAt(DAY, "12:00"),
        deviceId: "device-expiring",
      })
      .expect(201);
    now = new Date(now.getTime() + 8 * 60_000);
    await publicCreate(publicBody({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "12:00") })).expect(
      201,
    );
    const swept = await app.get(BookingMaintenance).sweep();
    expect(swept.holdsDeleted).toBeGreaterThanOrEqual(0);
  });

  it("per-phone active limit (q15) and invalid phone; draft salons are not public", async () => {
    for (const hh of ["09:00", "11:00", "13:00"]) {
      await publicCreate(publicBody({ startsAt: vnAt(DAY, hh) })).expect(201);
    }
    await clearRateLimits(app);
    const fourth = await publicCreate(publicBody({ startsAt: vnAt(DAY, "15:00") })).expect(429);
    expect(body(fourth).code).toBe("booking.active_limit_reached");
    const bad = await publicCreate(
      publicBody({ customer: { name: "X", phone: "12345678" } }),
    ).expect(422);
    expect(body(bad).code).toBe("booking.phone_invalid");
    await prisma.salon.update({ where: { id: s.salonId }, data: { status: "draft" } });
    await request(http(app))
      .get(`/api/v1/public/salons/${s.slug}/availability`)
      .query({ serviceId: s.serviceId, from: DAY, to: DAY })
      .expect(404);
  });

  it("manual confirmation: pending, then auto-cancelled after 12 h by the sweep (q13)", async () => {
    await prisma.salonSettings.update({
      where: { salonId: s.salonId },
      data: { confirmationMode: "manual" },
    });
    const res = await publicCreate(publicBody()).expect(201);
    expect(body(res).booking.status).toBe("pending");
    const staffEntry = await crmCreate(crmBody({ startsAt: vnAt(DAY, "13:00") })).expect(201);
    expect(body(staffEntry).status).toBe("confirmed"); // staff entry is the confirmation (X9)
    now = new Date(now.getTime() + 12 * 3_600_000 + 60_000);
    // The sweep is global (other suites may leave pending bookings), so check this one.
    expect((await app.get(BookingMaintenance).sweep()).pendingExpired).toBeGreaterThanOrEqual(1);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: body(res).booking.id } });
    expect(row.status).toBe("cancelled_by_salon");
    const last = await prisma.bookingStatusHistory.findFirstOrThrow({
      where: { bookingId: row.id },
      orderBy: { occurredAt: "desc" },
    });
    expect(last).toMatchObject({ actorType: "system", reasonCode: "pending_expired" });
  });

  it("confirm_new_clients puts first-time customers in pending (q66)", async () => {
    await prisma.salonSettings.update({
      where: { salonId: s.salonId },
      data: { confirmNewClients: true },
    });
    expect(body(await publicCreate(publicBody()).expect(201)).booking.status).toBe("pending");
  });

  it("state machine via CRM; customer cancel window and token revocation (AC7, q14)", async () => {
    const b = (await crmCreate(crmBody()).expect(201)).body as { id: string };
    const move = (to: string, extra: Record<string, unknown> = {}) =>
      request(http(app))
        .post(`/api/v1/salons/${s.salonId}/bookings/${b.id}/transitions`)
        .set("authorization", owner)
        .set("idempotency-key", key())
        .send({ to, ...extra });
    expect(body(await move("completed").expect(409)).code).toBe("booking.too_early");
    now = new Date(vnAt(DAY, "09:30"));
    await move("checked_in").expect(200);
    now = new Date(vnAt(DAY, "10:20"));
    const done = await move("completed").expect(200);
    expect(body(done).status).toBe("completed");
    expect(await prisma.bookingStatusHistory.count({ where: { bookingId: b.id } })).toBe(3);
    expect(body(await move("pending").expect(409)).code).toBe("booking.invalid_transition");

    // Customer: cancel allowed until 2 h before, then not; cancelling revokes the link.
    now = new Date("2026-12-01T08:00:00+07:00");
    const pub = publicBookingCreatedSchema.parse(
      (await publicCreate(publicBody({ startsAt: vnAt(DAY, "14:00") })).expect(201)).body,
    );
    now = new Date(vnAt(DAY, "12:30"));
    const late = await request(http(app))
      .post(`/api/v1/public/bookings/${pub.manageToken}/cancel`)
      .set("idempotency-key", key())
      .send({})
      .expect(409);
    expect(body(late).code).toBe("booking.cancel_window_passed");
    now = new Date(vnAt(DAY, "11:00"));
    await request(http(app))
      .post(`/api/v1/public/bookings/${pub.manageToken}/cancel`)
      .set("idempotency-key", key())
      .send({})
      .expect(200);
    await request(http(app)).get(`/api/v1/public/bookings/${pub.manageToken}`).expect(404);

    // Salon records a phoned-in cancellation inside the cutoff → late-cancel signal.
    const c = (await crmCreate(crmBody({ startsAt: vnAt(DAY, "15:00") })).expect(201)).body as {
      id: string;
    };
    now = new Date(vnAt(DAY, "14:00"));
    const cancelled = await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings/${c.id}/transitions`)
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ to: "cancelled_by_customer" })
      .expect(200);
    expect(cancelled.body).toMatchObject({
      status: "cancelled_by_customer",
      lateCancellation: true,
    });
    // The freed time is bookable again.
    await crmCreate(crmBody({ startsAt: vnAt(DAY, "15:00"), staffId: s.staffIds[0] })).expect(201);
  });

  it("reschedule: atomic, frees the old slot, rotates the customer's link (AC8)", async () => {
    const a = (await crmCreate(crmBody()).expect(201)).body as { id: string };
    await crmCreate(crmBody({ startsAt: vnAt(DAY, "14:00") })).expect(201);
    const resched = (id: string, body: Record<string, unknown>) =>
      request(http(app))
        .post(`/api/v1/salons/${s.salonId}/bookings/${id}/reschedule`)
        .set("authorization", owner)
        .set("idempotency-key", key())
        .send(body);
    const clash = await resched(a.id, { startsAt: vnAt(DAY, "14:00") }).expect(409);
    expect(body(clash).code).toBe("booking.slot_taken");
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: a.id } })).startsAt.toISOString(),
    ).toBe(vnAt(DAY, "10:00"));
    const moved = await resched(a.id, { startsAt: vnAt(DAY, "12:00") }).expect(200);
    expect(moved.body).toMatchObject({ startsAt: vnAt(DAY, "12:00"), version: 2 });
    await crmCreate(crmBody({ startsAt: vnAt(DAY, "10:00") })).expect(201); // old slot free

    const pub = publicBookingCreatedSchema.parse(
      (
        await publicCreate(
          publicBody({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "09:00") }),
        ).expect(201)
      ).body,
    );
    const res = await request(http(app))
      .post(`/api/v1/public/bookings/${pub.manageToken}/reschedule`)
      .set("idempotency-key", key())
      .send({ startsAt: vnAt(DAY, "16:00") })
      .expect(200);
    const after = publicBookingCreatedSchema.parse(res.body);
    expect(after.booking.startsAt).toBe(vnAt(DAY, "16:00"));
    expect(after.manageToken).not.toBe(pub.manageToken);
    await request(http(app)).get(`/api/v1/public/bookings/${pub.manageToken}`).expect(404);
    await request(http(app)).get(`/api/v1/public/bookings/${after.manageToken}`).expect(200);
  });

  it("scopes: staff only in their own calendar; overrides need permission + reason (q18)", async () => {
    const staffUser = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUser },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[1] },
      data: { salonMemberId: member.id },
    });
    const staffAuth = await bearerFor(app, staffUser);
    const denied = await crmCreate(crmBody({ staffId: s.staffIds[0] }), staffAuth).expect(403);
    expect(body(denied).code).toBe("common.forbidden");
    const own = await crmCreate(crmBody({ staffId: null }), staffAuth).expect(201);
    expect(body(own).staffId).toBe(s.staffIds[1]);
    await crmCreate(crmBody({ startsAt: vnAt(DAY, "13:00") })).expect(201); // owner, Linh
    const list = await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/bookings`)
      .query({ from: DAY, to: DAY })
      .set("authorization", staffAuth)
      .expect(200);
    expect(salonBookingListSchema.parse(list.body).items.map((x) => x.staffId)).toEqual([
      s.staffIds[1],
    ]);

    const evening = crmBody({ startsAt: vnAt(DAY, "20:00"), source: "walk_in" });
    expect(body(await crmCreate(evening).expect(409)).code).toBe("booking.slot_taken");
    expect(
      body(
        await crmCreate(
          { ...evening, overrides: ["hours"], overrideReason: "late client" },
          staffAuth,
        ).expect(403),
      ).code,
    ).toBe("booking.override_not_allowed");
    const receptionist = await bearerFor(
      app,
      await addSalonMember(prisma, s.salonId, "receptionist"),
    );
    const ok = await crmCreate(
      { ...evening, overrides: ["hours"], overrideReason: "late client" },
      receptionist,
    ).expect(201);
    expect(body(ok).ruleOverrides).toEqual(["hours"]);
    expect(
      await prisma.auditLog.count({
        where: { action: "booking.rules_overridden", targetId: body(ok).id },
      }),
    ).toBe(1);
  });

  it("scope parity: every salon booking route enforces bookings.read/.write(.own)", async () => {
    const b = (await crmCreate(crmBody()).expect(201)).body as { id: string };
    // A staff member whose booking permissions were revoked, and one without a staff profile.
    const revokedUser = await addSalonMember(prisma, s.salonId, "staff");
    await prisma.salonMember.updateMany({
      where: { salonId: s.salonId, userId: revokedUser },
      data: { permissionsOverride: { revoke: ["bookings.read.own", "bookings.write.own"] } },
    });
    const unlinked = await bearerFor(app, await addSalonMember(prisma, s.salonId, "staff"));
    const revoked = await bearerFor(app, revokedUser);
    const base = `/api/v1/salons/${s.salonId}`;
    const routes = [
      (a: string) =>
        request(http(app))
          .get(`${base}/availability`)
          .query({ serviceId: s.serviceId, from: DAY, to: DAY })
          .set("authorization", a),
      (a: string) =>
        request(http(app))
          .get(`${base}/bookings`)
          .query({ from: DAY, to: DAY })
          .set("authorization", a),
      (a: string) => request(http(app)).get(`${base}/bookings/${b.id}`).set("authorization", a),
      (a: string) => crmCreate(crmBody({ staffId: null, startsAt: vnAt(DAY, "15:00") }), a),
      (a: string) =>
        request(http(app))
          .post(`${base}/bookings/${b.id}/transitions`)
          .set("authorization", a)
          .set("idempotency-key", key())
          .send({ to: "cancelled_by_salon" }),
      (a: string) =>
        request(http(app))
          .post(`${base}/bookings/${b.id}/reschedule`)
          .set("authorization", a)
          .set("idempotency-key", key())
          .send({ startsAt: vnAt(DAY, "16:00") }),
    ] as const;
    for (const route of routes) {
      for (const auth of [revoked, unlinked]) {
        expect((await route(auth)).status).toBe(403);
      }
    }
    // Staff linked to Mai: availability only for Mai; Linh's booking is invisible (404).
    const staffUser = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUser },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[1] },
      data: { salonMemberId: member.id },
    });
    const mai = await bearerFor(app, staffUser);
    const avail = availabilitySchema.parse((await routes[0](mai).expect(200)).body);
    expect(new Set(avail.days.flatMap((d) => d.slots.flatMap((x) => x.staffIds)))).toEqual(
      new Set([s.staffIds[1]]),
    );
    expect((await routes[2](mai)).status).toBe(404);
    expect((await routes[4](mai)).status).toBe(404);
    expect((await routes[5](mai)).status).toBe(404);
  });

  it("reschedule can't move a booking to staff who don't offer the service", async () => {
    const b = (await crmCreate(crmBody()).expect(201)).body as { id: string };
    const outsider = await prisma.staffProfile.create({
      data: { salonId: s.salonId, displayName: "Hoa" },
    });
    const res = await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings/${b.id}/reschedule`)
      .set("authorization", owner)
      .set("idempotency-key", key())
      .send({ startsAt: vnAt(DAY, "12:00"), staffId: outsider.id })
      .expect(422);
    expect(body(res).code).toBe("booking.service_unavailable");
  });

  it("tenant isolation and hidden staff choice", async () => {
    const b = (await crmCreate(crmBody()).expect(201)).body as { id: string };
    const other = await createSalonFixture(prisma, "Other");
    const otherOwner = await bearerFor(app, other.ownerUserId);
    await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/bookings/${b.id}`)
      .set("authorization", otherOwner)
      .expect(404);
    await request(http(app))
      .get(`/api/v1/salons/${other.salonId}/bookings/${b.id}`)
      .set("authorization", otherOwner)
      .expect(404);
    await prisma.salonSettings.update({
      where: { salonId: s.salonId },
      data: { hideStaffChoice: true },
    });
    const res = await publicCreate(
      publicBody({ staffId: s.staffIds[0], startsAt: vnAt(DAY, "15:00") }),
    ).expect(422);
    expect(body(res).code).toBe("booking.staff_selection_disabled");
    const avail = await request(http(app))
      .get(`/api/v1/public/salons/${s.slug}/availability`)
      .query({ serviceId: s.serviceId, from: DAY, to: DAY })
      .expect(200);
    expect(availabilitySchema.parse(avail.body).days[0]?.slots[0]?.staffIds).toEqual([]);
  });

  it("database guarantees: EXCLUDE rejects overlap, history is append-only", async () => {
    const b = (await crmCreate(crmBody()).expect(201)).body as { id: string };
    await expect(
      prisma.$executeRaw`
        INSERT INTO booking_occupancy (id, salon_id, kind, booking_id, staff_id, period)
        VALUES (uuidv7(), ${s.salonId}::uuid, 'booking', ${b.id}::uuid, ${s.staffIds[0]}::uuid,
          tstzrange(${new Date(vnAt(DAY, "10:15"))}, ${new Date(vnAt(DAY, "10:20"))}, '[)'))`,
    ).rejects.toThrow(/booking_occupancy_no_staff_overlap|23P01/);
    await expect(
      prisma.$executeRaw`UPDATE booking_status_history SET reason_text = 'x' WHERE booking_id = ${b.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });
});
