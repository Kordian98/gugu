import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  availabilitySchema,
  bookingCheckSchema,
  salonBookingSchema,
  insightsSchema,
  commissionLinesSchema,
  profitSchema,
} from "@gugu/contracts";
import {
  createBookableSalon,
  type BookableSalonFixture,
  vnAt,
} from "../../../test/factories/booking";
import { bearerFor } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingClock } from "./application/booking-clock";

const DAY = "2026-12-02";

describe("CRM appointment duration and ad hoc service (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;
  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BookingClock)
      .useValue({ now: () => new Date("2026-12-01T08:00:00+07:00") })
      .compile();
    app = configureHttpApp(mod.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
  });
  const custom = () => ({
    customService: { name: "Sửa móng theo yêu cầu", priceMinor: 175_000 },
    durationMinutes: 75,
    staffId: s.staffIds[0],
    startsAt: vnAt(DAY, "10:00"),
    source: "walk_in",
    customer: null,
  });
  const create = (body: Record<string, unknown>, key = randomUUID()) =>
    request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", key)
      .send(body);
  const move = (id: string, startsAt: string) =>
    request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings/${id}/reschedule`)
      .set("authorization", owner)
      .set("idempotency-key", randomUUID())
      .send({ startsAt });

  it("uses selected full duration including add-ons for availability, snapshot and occupancy", async () => {
    const selection = {
      serviceId: s.serviceId,
      addOnIds: [s.addOnId],
      durationMinutes: 90,
      staffId: s.staffIds[0],
    };
    const available = availabilitySchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/availability`)
          .set("authorization", owner)
          .query({ ...selection, addOnIds: s.addOnId, from: DAY, to: DAY })
          .expect(200)
      ).body,
    );
    expect(available.durationMinutes).toBe(90);
    const b = salonBookingSchema.parse(
      (
        await create({
          ...selection,
          startsAt: vnAt(DAY, "10:00"),
          source: "walk_in",
          customer: null,
        }).expect(201)
      ).body,
    );
    expect(b.service.durationMinutes).toBe(90);
    expect(b.totalPriceMinor).toBe(250_000);
    expect(b.endsAt).toBe(vnAt(DAY, "11:30"));
    // The service's 10-minute buffer remains in force after the selected duration.
    await create({
      serviceId: s.serviceId,
      staffId: s.staffIds[0],
      startsAt: vnAt(DAY, "11:30"),
      source: "walk_in",
      customer: null,
    }).expect(409);
    const moved = salonBookingSchema.parse((await move(b.id, vnAt(DAY, "13:00")).expect(200)).body);
    expect(moved.endsAt).toBe(vnAt(DAY, "14:30"));
    expect(moved.service.durationMinutes).toBe(90);
  });

  it("creates and reschedules an ad hoc snapshot without adding anything to the catalog; replay is idempotent", async () => {
    const before = await prisma.service.count({ where: { salonId: s.salonId } });
    const key = randomUUID();
    const b = salonBookingSchema.parse((await create(custom(), key).expect(201)).body);
    expect(b.service).toMatchObject({
      serviceId: null,
      name: { vi: custom().customService.name },
      priceMinor: 175_000,
      durationMinutes: 75,
    });
    expect(b.endsAt).toBe(vnAt(DAY, "11:15"));
    expect(b.totalPriceMinor).toBe(175_000);
    expect(salonBookingSchema.parse((await create(custom(), key).expect(201)).body).id).toBe(b.id);
    expect(await prisma.service.count({ where: { salonId: s.salonId } })).toBe(before);
    const moved = salonBookingSchema.parse((await move(b.id, vnAt(DAY, "14:00")).expect(200)).body);
    expect(moved.endsAt).toBe(vnAt(DAY, "15:15"));
    expect(moved.service).toEqual(b.service);
  });

  it("checks ad hoc rule overrides and still prevents concurrent staff overlaps", async () => {
    const input = custom();
    const q = {
      customService: JSON.stringify(input.customService),
      durationMinutes: input.durationMinutes,
      staffId: input.staffId,
      startsAt: vnAt(DAY, "19:00"),
    };
    const check = bookingCheckSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/booking-check`)
          .set("authorization", owner)
          .query(q)
          .expect(200)
      ).body,
    );
    expect(check).toMatchObject({
      bookable: false,
      requiredOverrides: ["hours"],
      canOverride: true,
      blocked: false,
    });
    await create({ ...input, startsAt: q.startsAt }).expect(409);
    const body = {
      ...input,
      startsAt: q.startsAt,
      overrides: ["hours"],
      overrideReason: "Khách đến muộn",
    };
    const outcomes = await Promise.all([create(body), create(body)]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.booking.count({ where: { salonId: s.salonId } })).toBe(1);
    const audit = await prisma.auditLog.findFirst({
      where: { salonId: s.salonId, action: "booking.rules_overridden" },
    });
    expect(audit).not.toBeNull();
  });

  it("validates custom terms and refuses another salon's staff", async () => {
    await create({ ...custom(), serviceId: s.serviceId }).expect(400);
    await create({ ...custom(), durationMinutes: undefined }).expect(400);
    await create({ ...custom(), customService: { name: "", priceMinor: -1 } }).expect(400);
    await create({ ...custom(), durationMinutes: 1500 }).expect(400);
    const other = await createBookableSalon(prisma);
    const rejected = await create({ ...custom(), staffId: other.staffIds[0] });
    expect([404, 422]).toContain(rejected.status);
    expect(await prisma.booking.count({ where: { salonId: s.salonId } })).toBe(0);
  });
  it("retains completed ad hoc lines in revenue, separate name groups, commissions and unknown-cost reporting", async () => {
    await prisma.staffPaySetting.create({
      data: {
        salonId: s.salonId,
        staffId: s.staffIds[0],
        effectiveFrom: new Date("2026-01-01"),
        baseType: "none",
        commissionBps: 1000,
        createdByUserId: s.ownerUserId,
      },
    });
    const a = salonBookingSchema.parse((await create(custom()).expect(201)).body);
    const b = salonBookingSchema.parse(
      (
        await create({
          ...custom(),
          startsAt: vnAt(DAY, "13:00"),
          customService: { name: "Massage", priceMinor: 200_000 },
        }).expect(201)
      ).body,
    );
    await prisma.booking.updateMany({
      where: { salonId: s.salonId, id: { in: [a.id, b.id] } },
      data: { status: "completed" },
    });
    const insights = insightsSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .set("authorization", owner)
          .query({ from: DAY, to: DAY })
          .expect(200)
      ).body,
    );
    expect(insights.services).toHaveLength(2);
    expect(insights.services.map((x) => x.serviceId)).toEqual([null, null]);
    expect(insights.daily[0]?.estimatedRevenue).toBe(375_000);
    const lines = commissionLinesSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/payroll/staff/${s.staffIds[0]}/lines`)
          .set("authorization", owner)
          .query({ month: "2026-12" })
          .expect(200)
      ).body,
    );
    expect(lines.items).toHaveLength(2);
    expect(lines.items.reduce((sum, l) => sum + l.amount, 0)).toBe(37_500);
    const profit = profitSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/insights/profit`)
          .set("authorization", owner)
          .query({ month: "2026-12" })
          .expect(200)
      ).body,
    );
    expect(profit.servicesWithoutCost).toBe(2);
  });
});
