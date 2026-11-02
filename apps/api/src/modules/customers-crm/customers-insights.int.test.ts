// Integration: customers directory/profile/notes (07 M7.7) and insights over the metric catalogue
// (07 M7.8), incl. own scope (staff), phone masking, tenant isolation and RevenueKind parity.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  customerDetailSchema,
  customerListSchema,
  insightsSchema,
  revenueKindSchema,
} from "@gugu/contracts";
import { METRIC_KEYS, REVENUE_KINDS } from "@gugu/domain";
import { addSalonMember, bearerFor } from "../../../test/factories/identity";
import {
  createBookableSalon,
  type BookableSalonFixture,
  vnAt,
} from "../../../test/factories/booking";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingClock } from "../bookings/bookings.facade";

const DAY1 = "2026-12-02";
const DAY2 = "2026-12-09";
const DAY3 = "2026-12-12";
let now = new Date("2026-12-01T08:00:00+07:00");

describe("customers & insights (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let other: BookableSalonFixture;
  let owner: string;
  let staff: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BookingClock)
      .useValue({ now: () => new Date(now) })
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    s = await createBookableSalon(prisma);
    other = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
    const staffUserId = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUserId },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[1] },
      data: { salonMemberId: member.id },
    });
    staff = await bearerFor(app, staffUserId);
  });
  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const book = async (day: string, time: string, staffIdx: 0 | 1, name: string, phone: string) => {
    const res = await api()
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[staffIdx],
        startsAt: vnAt(day, time),
        customer: { name, phone },
        source: "phone",
      })
      .expect(201);
    return (res.body as { id: string }).id;
  };
  const move = async (id: string, to: string, at: string, day: string) => {
    now = new Date(vnAt(day, at));
    await api()
      .post(`/api/v1/salons/${s.salonId}/bookings/${id}/transitions`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({ to })
      .expect(200);
  };

  let anhId = "";

  it("directory: profiles from bookings, stats, search, segments, own scope", async () => {
    const a1 = await book(DAY1, "10:00", 0, "Nguyễn Thị Ngọc Anh", "0912 111 222");
    const b1 = await book(DAY1, "11:00", 1, "Trần Bảo Vy", "0987 333 444");
    now = new Date("2026-12-01T08:00:00+07:00");
    const a2 = await book(DAY2, "10:00", 0, "Nguyễn Thị Ngọc Anh", "0912 111 222");
    await move(a1, "completed", "10:50", DAY1);
    await move(b1, "no_show", "11:30", DAY1);
    await move(a2, "completed", "10:50", DAY2);

    const list = customerListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers`)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    const anh = list.items.find((c) => c.displayName === "Nguyễn Thị Ngọc Anh");
    expect(anh).toMatchObject({ visits: 2, noShows: 0, phone: "+84912111222" });
    anhId = anh?.id ?? "";
    expect(list.items.find((c) => c.displayName === "Trần Bảo Vy")).toMatchObject({
      visits: 0,
      noShows: 1,
    });
    const search = customerListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers`)
          .query({ q: "bao vy" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(search.items.map((c) => c.displayName)).toEqual(["Trần Bảo Vy"]);
    const returning = customerListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers`)
          .query({ segment: "returning" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(returning.items.map((c) => c.displayName)).toEqual(["Nguyễn Thị Ngọc Anh"]);
    // Staff (own scope, linked to staff #2) only sees the client of their own appointment.
    const mine = customerListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers`)
          .set("authorization", staff)
          .expect(200)
      ).body,
    );
    expect(mine.items.map((c) => c.displayName)).toEqual(["Trần Bảo Vy"]);
    await api()
      .get(`/api/v1/salons/${s.salonId}/customers/${anhId}`)
      .set("authorization", staff)
      .expect(404);
    // Other tenants cannot read it.
    await api()
      .get(`/api/v1/salons/${s.salonId}/customers/${anhId}`)
      .set("authorization", await bearerFor(app, other.ownerUserId))
      .expect(404);
  });

  it("profile: history, tags, consent, team-only notes; manual client; masked phones", async () => {
    await api()
      .patch(`/api/v1/salons/${s.salonId}/customers/${anhId}`)
      .set("authorization", owner)
      .send({ tags: ["VIP", "VIP", "gel"], consent: { zalo: true, email: false, sms: false } })
      .expect(204);
    await api()
      .post(`/api/v1/salons/${s.salonId}/customers/${anhId}/notes`)
      .set("authorization", owner)
      .send({ body: "Thích màu nude, dị ứng acetone" })
      .expect(204);
    const detail = customerDetailSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers/${anhId}`)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(detail).toMatchObject({ tags: ["VIP", "gel"], consent: { zalo: true }, visits: 2 });
    expect(detail.history).toHaveLength(2);
    expect(detail.notes?.[0]).toMatchObject({ body: "Thích màu nude, dị ứng acetone", mine: true });
    expect(detail.favouriteServiceIds).toEqual([s.serviceId]);
    // Notes are hidden without customers.notes.write.
    const recUser = await addSalonMember(prisma, s.salonId, "receptionist");
    await prisma.salonMember.updateMany({
      where: { salonId: s.salonId, userId: recUser },
      data: { permissionsOverride: { revoke: ["customers.notes.write", "customers.phone.read"] } },
    });
    const rec = await bearerFor(app, recUser);
    const recView = customerDetailSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers/${anhId}`)
          .set("authorization", rec)
          .expect(200)
      ).body,
    );
    expect(recView.notes).toBeNull();
    expect(recView.phone).toContain("•");
    // Manual client; duplicate phone → 409.
    await api()
      .post(`/api/v1/salons/${s.salonId}/customers`)
      .set("authorization", owner)
      .send({ displayName: "Khách mới", phone: "0905 777 888" })
      .expect(201);
    await api()
      .post(`/api/v1/salons/${s.salonId}/customers`)
      .set("authorization", owner)
      .send({ displayName: "Trùng", phone: "0905777888" })
      .expect(409);
    const dupOwner = await api()
      .post(`/api/v1/salons/${s.salonId}/customers`)
      .set("authorization", owner)
      .send({ displayName: "Trùng", phone: "0905777888" })
      .expect(409);
    expect((dupOwner.body as { detail?: string }).detail).toBeTruthy();
    // Without customers.phone.read the conflict carries no profile id (no phone-existence oracle).
    const dupRec = await api()
      .post(`/api/v1/salons/${s.salonId}/customers`)
      .set("authorization", rec)
      .send({ displayName: "Trùng", phone: "0905777888" })
      .expect(409);
    expect((dupRec.body as { detail?: string }).detail).toBeUndefined();
    expect(JSON.stringify(dupRec.body)).not.toContain(String(dupOwner.body.detail));
    await api()
      .post(`/api/v1/salons/${s.salonId}/customers`)
      .set("authorization", staff)
      .send({ displayName: "X", phone: null })
      .expect(403);
    // Own scope: the tag list only covers clients the member can see (Anh's VIP tag is hidden).
    const staffList = customerListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers`)
          .set("authorization", staff)
          .expect(200)
      ).body,
    );
    expect(staffList.tags).toEqual([]);
    const ownerList = customerListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/customers`)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect([...ownerList.tags].sort()).toEqual(["VIP", "gel"].sort());
  });

  it("insights: catalogue values, previous period, breakdowns; own scope; RevenueKind parity", async () => {
    expect([...revenueKindSchema.options]).toEqual([...REVENUE_KINDS]);
    await api()
      .put(
        `/api/v1/salons/${s.salonId}/bookings/${(await prisma.booking.findFirstOrThrow({ where: { salonId: s.salonId, status: "completed" }, orderBy: { startsAt: "asc" } })).id}/offline-sale`,
      )
      .set("authorization", owner)
      .send({ amount: 180000 })
      .expect(200);
    const res = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query({ from: "2026-12-01", to: "2026-12-10" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(Object.keys(res.metrics).sort()).toEqual([...METRIC_KEYS].sort());
    expect(res.metrics["appointments.count"]?.value).toBe(3);
    expect(res.metrics["appointments.completed"]?.value).toBe(2);
    expect(res.metrics["no_show.rate"]?.value).toBeCloseTo(1 / 3);
    expect(res.metrics["customers.new"]?.value).toBe(1);
    expect(res.metrics["revenue.estimated"]).toMatchObject({
      unit: "vnd",
      revenueKind: "estimated_from_bookings",
    });
    expect(res.metrics["revenue.offline_recorded"]).toMatchObject({
      value: 180000,
      revenueKind: "recorded_offline_sale",
    });
    expect(res.previousRange).toEqual({ from: "2026-11-21", to: "2026-11-30" });
    expect(res.daily.map((d) => d.date)).toEqual([DAY1, DAY2]);
    expect(res.services[0]).toMatchObject({ serviceId: s.serviceId, count: 2 });
    expect(res.staff.length).toBe(2);
    // Second visit in a later period counts as returning.
    const later = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query({ from: DAY2, to: DAY2 })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(later.metrics["customers.returning"]?.value).toBe(1);
    expect(later.metrics["customers.new"]?.value).toBe(0);
    // Staff: own appointments only; receptionist (no analytics permission) → 403.
    const own = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query({ from: "2026-12-01", to: "2026-12-10" })
          .set("authorization", staff)
          .expect(200)
      ).body,
    );
    expect(own.scope).toBe("own");
    expect(own.metrics["appointments.count"]?.value).toBe(1);
    // Own scope: history with other staff does not make a client "returning" for this member.
    const a3 = await book(DAY3, "10:00", 1, "Nguyễn Thị Ngọc Anh", "0912 111 222");
    await move(a3, "completed", "10:50", DAY3);
    const ownDay3 = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query({ from: DAY3, to: DAY3 })
          .set("authorization", staff)
          .expect(200)
      ).body,
    );
    expect(ownDay3.metrics["customers.new"]?.value).toBe(1);
    expect(ownDay3.metrics["customers.returning"]?.value).toBe(0);
    const salonDay3 = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query({ from: DAY3, to: DAY3 })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(salonDay3.metrics["customers.returning"]?.value).toBe(1);
    const rec = await bearerFor(app, await addSalonMember(prisma, s.salonId, "receptionist"));
    await api()
      .get(`/api/v1/salons/${s.salonId}/insights`)
      .query({ from: "2026-12-01", to: "2026-12-10" })
      .set("authorization", rec)
      .expect(403);
    await api()
      .get(`/api/v1/salons/${s.salonId}/insights`)
      .query({ from: "2026-01-01", to: "2026-12-31" })
      .set("authorization", owner)
      .expect(400);
  });
});
