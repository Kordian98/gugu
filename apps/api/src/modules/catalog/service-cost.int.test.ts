// Integration: internal cost per service/variant/add-on is visible and writable only with
// services.cost.read (owner, manager); hidden from receptionist/staff and public responses; the
// Insights "margin.estimated" metric follows the same gate.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insightsSchema, serviceListSchema, serviceSchema } from "@gugu/contracts";
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

const DAY = "2026-12-03";
let now = new Date("2026-12-01T08:00:00+07:00");

describe("internal service cost & margin (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;
  let manager: string;
  let receptionist: string;
  let staff: string;
  let managerNoCost: string;
  let serviceId = "";

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
    owner = await bearerFor(app, s.ownerUserId);
    manager = await bearerFor(app, await addSalonMember(prisma, s.salonId, "manager"));
    receptionist = await bearerFor(app, await addSalonMember(prisma, s.salonId, "receptionist"));
    const staffUser = await addSalonMember(prisma, s.salonId, "staff");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: staffUser },
    });
    await prisma.staffProfile.update({
      where: { id: s.staffIds[0] },
      data: { salonMemberId: member.id },
    });
    staff = await bearerFor(app, staffUser);
    const m2 = await addSalonMember(prisma, s.salonId, "manager");
    await prisma.salonMember.updateMany({
      where: { salonId: s.salonId, userId: m2 },
      data: { permissionsOverride: { revoke: ["services.cost.read"] } },
    });
    managerNoCost = await bearerFor(app, m2);
  });
  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const list = async (who: string) =>
    serviceListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/services`)
          .set("authorization", who)
          .expect(200)
      ).body,
    );
  const body = {
    name: { vi: "Sơn gel cao cấp", en: "Premium gel" },
    price: 300000,
    durationMinutes: 30,
    cost: 80000,
    variants: [{ name: { vi: "Dài" }, price: 350000, durationMinutes: 30, cost: 100000 }],
    addOns: [{ name: { vi: "Đá" }, extraPrice: 50000, extraDurationMinutes: 0, extraCost: 20000 }],
  };

  it("owner writes and reads costs; manager reads them", async () => {
    const created = serviceSchema.parse(
      (
        await api()
          .post(`/api/v1/salons/${s.salonId}/services`)
          .set("authorization", owner)
          .send(body)
          .expect(201)
      ).body,
    );
    serviceId = created.id;
    expect(created).toMatchObject({ cost: 80000, costVisible: true });
    expect(created.variants[0]?.cost).toBe(100000);
    expect(created.addOns[0]?.extraCost).toBe(20000);
    const m = (await list(manager)).items.find((x) => x.id === serviceId);
    expect(m).toMatchObject({ cost: 80000, costVisible: true });
  });

  it("receptionist, staff and a manager without the permission never see costs", async () => {
    for (const who of [receptionist, staff, managerNoCost]) {
      const items = (await list(who)).items;
      const x = items.find((i) => i.id === serviceId);
      expect(x).toMatchObject({ cost: null, costVisible: false });
      expect(x?.variants[0]?.cost).toBeNull();
      expect(x?.addOns[0]?.extraCost).toBeNull();
    }
  });

  it("writing a cost needs the permission; saving without cost keeps it", async () => {
    const current = (await list(owner)).items.find((i) => i.id === serviceId);
    if (!current) throw new Error("missing");
    const keepIds = {
      variants: [{ id: current.variants[0]?.id, name: { vi: "Dài" }, price: 350000 }],
      addOns: [{ id: current.addOns[0]?.id, name: { vi: "Đá" }, extraPrice: 50000 }],
    };
    await api()
      .patch(`/api/v1/salons/${s.salonId}/services/${serviceId}`)
      .set("authorization", managerNoCost)
      .send({ ...body, ...keepIds, cost: 1 })
      .expect(403);
    const saved = serviceSchema.parse(
      (
        await api()
          .patch(`/api/v1/salons/${s.salonId}/services/${serviceId}`)
          .set("authorization", managerNoCost)
          .send({ name: body.name, price: 310000, durationMinutes: 30, ...keepIds })
          .expect(200)
      ).body,
    );
    expect(saved.cost).toBeNull(); // hidden in the response…
    const back = (await list(owner)).items.find((i) => i.id === serviceId);
    expect(back?.cost).toBe(80000); // …and unchanged
    expect(back?.variants[0]?.cost).toBe(100000);
    expect(back?.addOns[0]?.extraCost).toBe(20000);
  });

  it("public availability never carries cost fields", async () => {
    const res = await api()
      .get(`/api/v1/public/salons/${s.slug}/availability`)
      .query({ serviceId, from: DAY, to: DAY });
    expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
  });

  it("insights: margin for cost readers only", async () => {
    const current = (await list(owner)).items.find((i) => i.id === serviceId);
    const res = await api()
      .post(`/api/v1/salons/${s.salonId}/bookings`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({
        serviceId,
        variantId: current?.variants[0]?.id,
        addOnIds: [current?.addOns[0]?.id],
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "10:00"),
        customer: { name: "Khách A", phone: "0912 000 999" },
        source: "phone",
      })
      .expect(201);
    const id = (res.body as { id: string }).id;
    now = new Date(vnAt(DAY, "10:40"));
    await api()
      .post(`/api/v1/salons/${s.salonId}/bookings/${id}/transitions`)
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({ to: "completed" })
      .expect(200);
    const q = { from: DAY, to: DAY };
    const mine = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query(q)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    // (350 000 + 50 000) − (100 000 + 20 000)
    expect(mine.metrics["margin.estimated"]).toMatchObject({
      value: 280000,
      unit: "vnd",
      revenueKind: "estimated_from_bookings",
    });
    const own = insightsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/insights`)
          .query(q)
          .set("authorization", staff)
          .expect(200)
      ).body,
    );
    expect(own.metrics["margin.estimated"]).toBeUndefined();
    expect(own.metrics["appointments.count"]).toBeDefined();
  });
});
