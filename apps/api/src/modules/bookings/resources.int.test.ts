// Integration against the local stack: resources (topic 06 M6.6) — CRUD, service requirements,
// availability needs staff AND a free unit, concurrency on a single bed, capacity units, holds,
// reschedule/cancel move or release units, capacity cuts never strand bookings.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  availabilitySchema,
  resourceTypeListSchema,
  salonBookingSchema,
  serviceSchema,
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
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingClock } from "./application/booking-clock";
import { HoldsCommand } from "./application/holds.command";
import { BookingContexts, BookingsModule } from "./bookings.facade";

const DAY = "2026-12-02";
let now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };
const code = (res: { body: unknown }) => (res.body as { code: string }).code;
const idOf = (res: { body: unknown }) => (res.body as { id: string }).id;

describe("resources (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;
  let bedTypeId: string;
  let bedId: string;

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

  const api = (path: string) => `/api/v1/salons/${s.salonId}${path}`;
  const post = (path: string, body: unknown, auth = owner) =>
    request(http(app))
      .post(api(path))
      .set("authorization", auth)
      .send(body as object);
  const patch = (path: string, body: unknown) =>
    request(http(app))
      .patch(api(path))
      .set("authorization", owner)
      .send(body as object);
  const book = (patchBody: Record<string, unknown> = {}) =>
    request(http(app))
      .post(api("/bookings"))
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: null,
        startsAt: vnAt(DAY, "10:00"),
        customer: {
          name: "Lê Thu",
          phone: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        },
        source: "phone",
        ...patchBody,
      });
  const slots = async (staffId?: string) => {
    const res = await request(http(app))
      .get(api("/availability"))
      .query({ serviceId: s.serviceId, from: DAY, to: DAY, ...(staffId ? { staffId } : {}) })
      .set("authorization", owner)
      .expect(200);
    return availabilitySchema.parse(res.body);
  };

  beforeEach(async () => {
    now = new Date("2026-12-01T08:00:00+07:00");
    await clearRateLimits(app);
    s = await createBookableSalon(prisma); // two staff (Linh, Mai), 30 min + 10 min buffer
    owner = await bearerFor(app, s.ownerUserId);
    bedTypeId = idOf(await post("/resource-types", { name: "Giường massage" }).expect(201));
    bedId = idOf(
      await post("/resources", { resourceTypeId: bedTypeId, name: "Giường", capacity: 1 }).expect(
        201,
      ),
    );
    await request(http(app))
      .put(api(`/services/${s.serviceId}/resource-requirements`))
      .set("authorization", owner)
      .send({ items: [{ resourceTypeId: bedTypeId, quantity: 1 }] })
      .expect(204);
  });

  it("CRUD, requirement in the service read model, requiredByServiceCount, permissions", async () => {
    const list = resourceTypeListSchema.parse(
      (await request(http(app)).get(api("/resource-types")).set("authorization", owner).expect(200))
        .body,
    );
    expect(list.items).toEqual([
      expect.objectContaining({
        id: bedTypeId,
        requiredByServiceCount: 1,
        resources: [expect.objectContaining({ id: bedId, capacity: 1, isActive: true })],
      }),
    ]);
    const services = await request(http(app))
      .get(api("/services"))
      .set("authorization", owner)
      .expect(200);
    const svc = (services.body as { items: unknown[] }).items
      .map((x) => serviceSchema.parse(x))
      .find((x) => x.id === s.serviceId);
    expect(svc?.resourceRequirements).toEqual([{ resourceTypeId: bedTypeId, quantity: 1 }]);

    expect(
      code(
        await request(http(app))
          .delete(api(`/resource-types/${bedTypeId}`))
          .set("authorization", owner)
          .expect(409),
      ),
    ).toBe("resource.type_in_use");
    const receptionist = await bearerFor(
      app,
      await addSalonMember(prisma, s.salonId, "receptionist"),
    );
    await post("/resource-types", { name: "Ghế" }, receptionist).expect(403);
    await request(http(app))
      .get(api("/resource-types"))
      .set("authorization", receptionist)
      .expect(200);
    const unknown = await request(http(app))
      .put(api(`/services/${s.serviceId}/resource-requirements`))
      .set("authorization", owner)
      .send({ items: [{ resourceTypeId: randomUUID().replace(/^(.{14})./, "$17"), quantity: 1 }] });
    expect([400, 422]).toContain(unknown.status);
  });

  it("two staff free but one bed → one booking at a time; any-staff availability follows the bed", async () => {
    const before = await slots();
    expect(before.days[0]?.slots.some((x) => x.startsAt === vnAt(DAY, "10:00"))).toBe(true);
    const first = salonBookingSchema.parse(
      (await book({ staffId: s.staffIds[0] }).expect(201)).body,
    );
    expect(first.resources).toEqual([
      expect.objectContaining({ resourceId: bedId, position: 1, name: "Giường" }),
    ]);
    // Mai is free at 10:00 but the only bed is taken until 10:40 (buffer included).
    expect(code(await book({ staffId: s.staffIds[1] }).expect(409))).toBe("booking.slot_taken");
    const after = (await slots(s.staffIds[1])).days[0]?.slots.map((x) => x.startsAt) ?? [];
    expect(after).not.toContain(vnAt(DAY, "10:00"));
    expect(after).not.toContain(vnAt(DAY, "10:30"));
    expect(after).toContain(vnAt(DAY, "10:45"));
  });

  it("concurrency: 20 parallel creates, staff split across two free staff, one bed → exactly 1", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        book({ staffId: s.staffIds[i % 2], startsAt: vnAt(DAY, "11:00") }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    const overlapping = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM booking_occupancy a JOIN booking_occupancy b
        ON a.resource_unit_id = b.resource_unit_id AND a.id < b.id AND a.period && b.period
      WHERE a.active AND b.active AND a.salon_id = ${s.salonId}::uuid`;
    expect(Number(overlapping[0]?.n)).toBe(0);
  });

  it("capacity 2 = two units: two bookings fit, the third doesn't; capacity cut refused while used", async () => {
    await patch(`/resources/${bedId}`, { capacity: 2 }).expect(204);
    // A third staff member so staff isn't the bottleneck.
    const third = await prisma.staffProfile.create({
      data: { salonId: s.salonId, displayName: "Hoa" },
    });
    await prisma.staffSchedule.createMany({
      data: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        salonId: s.salonId,
        staffId: third.id,
        weekday,
        startsAt: new Date("1970-01-01T09:00:00Z"),
        endsAt: new Date("1970-01-01T18:00:00Z"),
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      })),
    });
    await prisma.staffService.create({
      data: { salonId: s.salonId, staffId: third.id, serviceId: s.serviceId },
    });
    const a = salonBookingSchema.parse((await book().expect(201)).body);
    const b = salonBookingSchema.parse((await book().expect(201)).body);
    expect(new Set([a.resources[0]?.position, b.resources[0]?.position])).toEqual(new Set([1, 2]));
    expect(code(await book().expect(409))).toBe("booking.slot_taken");
    // Both units hold future bookings → capacity 1 or deleting is refused.
    expect(code(await patch(`/resources/${bedId}`, { capacity: 1 }).expect(409))).toBe(
      "resource.in_use",
    );
    expect(
      code(
        await request(http(app))
          .delete(api(`/resources/${bedId}`))
          .set("authorization", owner)
          .expect(409),
      ),
    ).toBe("resource.in_use");
    // Cancelling one releases its unit; now the cut succeeds and keeps the used unit.
    await request(http(app))
      .post(api(`/bookings/${b.id}/transitions`))
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({ to: "cancelled_by_salon" })
      .expect(200);
    await patch(`/resources/${bedId}`, { capacity: 1 }).expect(204);
    const units = await prisma.resourceUnit.findMany({
      where: { resourceId: bedId, isActive: true },
    });
    expect(units.map((u) => u.id)).toEqual([a.resources[0]?.unitId]);
  });

  it("reschedule moves the unit claim; cancel frees it; holds claim units", async () => {
    const a = salonBookingSchema.parse((await book({ staffId: s.staffIds[0] }).expect(201)).body);
    await request(http(app))
      .post(api(`/bookings/${a.id}/reschedule`))
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({ startsAt: vnAt(DAY, "14:00") })
      .expect(200);
    await book({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "10:00") }).expect(201); // old bed time free
    expect(
      code(await book({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "14:00") }).expect(409)),
    ).toBe("booking.slot_taken");

    // A hold (engine path kept for staff-generated confirmations) claims the bed too.
    const ctx = await app.get(BookingContexts).forSalon(s.salonId);
    await app.get(HoldsCommand).create(ctx, "device-hash-1", {
      serviceId: s.serviceId,
      variantId: null,
      addOnIds: [],
      staffId: null,
      startsAt: new Date(vnAt(DAY, "16:00")),
    });
    expect(
      code(await book({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "16:00") }).expect(409)),
    ).toBe("booking.slot_taken");
    now = new Date(now.getTime() + 8 * 60_000); // hold expired → no longer blocks
    await book({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "16:00") }).expect(201);
  });

  it("no active unit → availability empty with reason no_resource; paused resource counts as none", async () => {
    await patch(`/resources/${bedId}`, { isActive: false }).expect(204);
    const res = await slots();
    expect(res.days.flatMap((d) => d.slots)).toEqual([]);
    expect(res.unavailableReason).toBe("no_resource");
    expect(code(await book().expect(409))).toBe("booking.slot_taken");
    // Requirements via the service editor payload (omitted = unchanged, [] = none).
    await request(http(app))
      .put(api(`/services/${s.serviceId}/resource-requirements`))
      .set("authorization", owner)
      .send({ items: [] })
      .expect(204);
    await book().expect(201);
  });
});
