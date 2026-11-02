// Integration: client quick pick from the salon's own bookings and the optional offline sale
// amount on completion (topic 07 M7.2), including tenant isolation.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientSuggestionListSchema, offlineSaleSchema } from "@gugu/contracts";
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

const DAY = "2026-12-02";
let now = new Date("2026-12-01T08:00:00+07:00");

describe("salon CRM helpers (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let other: BookableSalonFixture;
  let owner: string;
  let otherOwner: string;

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
    otherOwner = await bearerFor(app, other.ownerUserId);
  });
  afterAll(async () => {
    await app.close();
  });

  const book = async (time: string, name: string, phone: string) => {
    const res = await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, time),
        customer: { name, phone },
        source: "phone",
      })
      .expect(201);
    return (res.body as { id: string }).id;
  };

  let bookingId = "";

  it("suggests recent clients by phone digits or diacritic-free name, newest first", async () => {
    bookingId = await book("10:00", "Nguyễn Thị Ngọc Anh", "0912 345 678");
    await book("11:00", "Trần Bảo Vy", "0987 654 321");
    await book("13:00", "Nguyễn Thị Ngọc Anh", "0912 345 678");
    const lookup = async (q: string) =>
      clientSuggestionListSchema.parse(
        (
          await request(http(app))
            .get(`/api/v1/salons/${s.salonId}/clients/lookup`)
            .query({ q })
            .set("authorization", owner)
            .expect(200)
        ).body,
      ).items;
    const recent = await lookup("");
    expect(recent.map((c) => c.name)).toEqual(["Nguyễn Thị Ngọc Anh", "Trần Bảo Vy"]);
    expect(recent[0]).toMatchObject({
      phone: "+84912345678",
      visits: 2,
      lastServiceId: s.serviceId,
      lastStaffId: s.staffIds[0],
    });
    expect((await lookup("0912")).map((c) => c.name)).toEqual(["Nguyễn Thị Ngọc Anh"]);
    expect((await lookup("bao vy")).map((c) => c.phone)).toEqual(["+84987654321"]);
    expect(await lookup("zzz")).toEqual([]);
    // Another salon never sees these clients.
    const foreign = await request(http(app))
      .get(`/api/v1/salons/${other.salonId}/clients/lookup`)
      .set("authorization", otherOwner)
      .expect(200);
    expect(clientSuggestionListSchema.parse(foreign.body).items).toEqual([]);
    await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/clients/lookup`)
      .set("authorization", otherOwner)
      .expect(404);
  });

  it("records the amount received only for completed bookings", async () => {
    const url = `/api/v1/salons/${s.salonId}/bookings/${bookingId}/offline-sale`;
    await request(http(app))
      .put(url)
      .set("authorization", owner)
      .send({ amount: 200000 })
      .expect(409);
    now = new Date(vnAt(DAY, "10:50"));
    await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings/${bookingId}/transitions`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({ to: "completed" })
      .expect(200);
    await request(http(app)).get(url).set("authorization", owner).expect(404);
    const sale = offlineSaleSchema.parse(
      (
        await request(http(app))
          .put(url)
          .set("authorization", owner)
          .send({ amount: 200000, method: "bank_transfer" })
          .expect(200)
      ).body,
    );
    expect(sale).toMatchObject({
      amount: 200000,
      method: "bank_transfer",
      revenueKind: "recorded_offline_sale",
    });
    // Editing replaces the single record.
    await request(http(app))
      .put(url)
      .set("authorization", owner)
      .send({ amount: 180000 })
      .expect(200);
    expect(await prisma.offlineSale.count({ where: { bookingId } })).toBe(1);
    expect(
      offlineSaleSchema.parse(
        (await request(http(app)).get(url).set("authorization", owner).expect(200)).body,
      ).amount,
    ).toBe(180000);
    // Staff (own scope only) cannot record amounts; other tenants get 404.
    const staff = await bearerFor(app, await addSalonMember(prisma, s.salonId, "staff"));
    await request(http(app)).put(url).set("authorization", staff).send({ amount: 1 }).expect(403);
    await request(http(app))
      .put(`/api/v1/salons/${other.salonId}/bookings/${bookingId}/offline-sale`)
      .set("authorization", otherOwner)
      .send({ amount: 1 })
      .expect(404);
    await request(http(app)).put(url).set("authorization", owner).send({ amount: -5 }).expect(400);
  });

  it("own scope (staff role) mirrors the booking engine's readScope: own clients and sales only", async () => {
    // Staff member linked to staff profile #2; bookings above are all on staff profile #1.
    const staffUserId = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUserId },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[1] },
      data: { salonMemberId: member.id },
    });
    const staff = await bearerFor(app, staffUserId);
    now = new Date("2026-12-01T08:00:00+07:00");
    const res = await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[1],
        startsAt: vnAt(DAY, "15:00"),
        customer: { name: "Lý Thanh Tâm", phone: "0966 777 888" },
        source: "phone",
      })
      .expect(201);
    const ownBookingId = (res.body as { id: string }).id;

    const lookup = async (auth: string) =>
      clientSuggestionListSchema
        .parse(
          (
            await request(http(app))
              .get(`/api/v1/salons/${s.salonId}/clients/lookup`)
              .set("authorization", auth)
              .expect(200)
          ).body,
        )
        .items.map((c) => c.phone)
        .sort();
    const bookingPhones = async (auth: string) =>
      [
        ...new Set(
          (
            (
              await request(http(app))
                .get(`/api/v1/salons/${s.salonId}/bookings`)
                .query({ from: DAY, to: DAY })
                .set("authorization", auth)
                .expect(200)
            ).body as { items: { customer: { phone: string | null } | null }[] }
          ).items
            .map((b) => b.customer?.phone)
            .filter((x): x is string => Boolean(x)),
        ),
      ].sort();
    // Parity with GET /bookings for both scopes.
    expect(await lookup(staff)).toEqual(await bookingPhones(staff));
    expect(await lookup(staff)).toEqual(["+84966777888"]);
    expect(await lookup(owner)).toEqual(await bookingPhones(owner));

    // Someone else's sale reads as not found; the own booking's sale is readable once recorded.
    await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/bookings/${bookingId}/offline-sale`)
      .set("authorization", staff)
      .expect(404);
    now = new Date(vnAt(DAY, "15:50"));
    await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings/${ownBookingId}/transitions`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({ to: "completed" })
      .expect(200);
    await request(http(app))
      .put(`/api/v1/salons/${s.salonId}/bookings/${ownBookingId}/offline-sale`)
      .set("authorization", owner)
      .send({ amount: 120000 })
      .expect(200);
    await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/bookings/${ownBookingId}/offline-sale`)
      .set("authorization", staff)
      .expect(200);

    // A staff member without a linked staff profile has no scope at all.
    const unlinked = await bearerFor(app, await addSalonMember(prisma, s.salonId, "staff"));
    await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/clients/lookup`)
      .set("authorization", unlinked)
      .expect(403);
    await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/bookings/${bookingId}/offline-sale`)
      .set("authorization", unlinked)
      .expect(403);
  });

  it("masks client phones for members whose phone access was revoked", async () => {
    const userId = await addSalonMember(prisma, s.salonId, "receptionist");
    await prisma.salonMember.updateMany({
      where: { salonId: s.salonId, userId },
      data: { permissionsOverride: { revoke: ["customers.phone.read"] } },
    });
    const rec = await bearerFor(app, userId);
    const list = (
      await request(http(app))
        .get(`/api/v1/salons/${s.salonId}/bookings`)
        .query({ from: DAY, to: DAY })
        .set("authorization", rec)
        .expect(200)
    ).body as { items: { id: string; customer: { phone: string | null } | null }[] };
    const phones = list.items.map((b) => b.customer?.phone).filter(Boolean);
    expect(phones.length).toBeGreaterThan(0);
    for (const ph of phones) expect(ph).toMatch(/^\+84 ••• ••• \d{3}$/);
    const one = list.items[0];
    if (!one) throw new Error("no booking");
    const single = (
      await request(http(app))
        .get(`/api/v1/salons/${s.salonId}/bookings/${one.id}`)
        .set("authorization", rec)
        .expect(200)
    ).body as { customer: { phone: string } };
    expect(single.customer.phone).toContain("•");
    const lookup = clientSuggestionListSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/clients/lookup`)
          .set("authorization", rec)
          .expect(200)
      ).body,
    ).items;
    expect(lookup.every((c) => c.phoneMasked && c.phone.includes("•"))).toBe(true);
    // Digit search is disabled without phone access (no probing numbers).
    const probe = clientSuggestionListSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/clients/lookup`)
          .query({ q: "0912" })
          .set("authorization", rec)
          .expect(200)
      ).body,
    ).items;
    expect(probe.length).toBe(lookup.length);
    // The owner still sees full numbers.
    const ownerList = (
      await request(http(app))
        .get(`/api/v1/salons/${s.salonId}/bookings`)
        .query({ from: DAY, to: DAY })
        .set("authorization", owner)
        .expect(200)
    ).body as { items: { customer: { phone: string | null } | null }[] };
    expect(ownerList.items.some((b) => b.customer?.phone?.startsWith("+849"))).toBe(true);
  });

  it("a deleted service is no longer bookable but stays in booking history", async () => {
    now = new Date("2026-12-01T08:00:00+07:00");
    const upcoming = await book("17:00", "Hoàng Mỹ Linh", "0901 222 333");
    await request(http(app))
      .delete(`/api/v1/salons/${s.salonId}/services/${s.serviceId}`)
      .set("authorization", owner)
      .expect(204);
    // Gone from the catalogue …
    const list = (
      await request(http(app))
        .get(`/api/v1/salons/${s.salonId}/services`)
        .set("authorization", owner)
        .expect(200)
    ).body as { items: { id: string }[] };
    expect(list.items.map((x) => x.id)).not.toContain(s.serviceId);
    // … not bookable …
    const avail = await request(http(app))
      .get(`/api/v1/salons/${s.salonId}/availability`)
      .query({ serviceId: s.serviceId, from: DAY, to: DAY })
      .set("authorization", owner);
    expect(avail.status).toBeGreaterThanOrEqual(400);
    const create = await request(http(app))
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "18:00"),
        customer: { name: "X", phone: "0901 999 888" },
        source: "phone",
      });
    expect(create.status).toBeGreaterThanOrEqual(400);
    // … while past and upcoming bookings keep it (snapshot name) and the row stays for statistics.
    const day = (
      await request(http(app))
        .get(`/api/v1/salons/${s.salonId}/bookings`)
        .query({ from: DAY, to: DAY })
        .set("authorization", owner)
        .expect(200)
    ).body as { items: { id: string; service: { serviceId: string; name: { vi: string } } }[] };
    const kept = day.items.find((b) => b.id === upcoming);
    expect(kept?.service.serviceId).toBe(s.serviceId);
    expect(kept?.service.name.vi.length).toBeGreaterThan(0);
    expect(day.items.filter((b) => b.service.serviceId === s.serviceId).length).toBeGreaterThan(1);
    const row = await prisma.service.findUniqueOrThrow({ where: { id: s.serviceId } });
    expect(row.deletedAt).not.toBeNull();
  });
});
