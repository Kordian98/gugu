// Integration against the local stack: booking-engine edge-case audit (topic 06) — resources
// combined with audited rule overrides, holds and reschedules. Each case is listed in
// docs/domains/booking-engine.md → "Edge-case audit".
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
import { bearerFor } from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingClock } from "./application/booking-clock";
import { CreateBookingCommand } from "./application/create-booking.command";
import { HoldsCommand } from "./application/holds.command";
import { BookingContexts, BookingsModule } from "./bookings.facade";

const DAY = "2026-12-02";
let now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };
const code = (res: { body: unknown }) => (res.body as { code: string }).code;
const idOf = (res: { body: unknown }) => (res.body as { id: string }).id;

describe("booking engine edge cases: resources × overrides (integration)", () => {
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
  const post = (path: string, body: object) =>
    request(http(app)).post(api(path)).set("authorization", owner).send(body);
  const book = (patch: Record<string, unknown> = {}) =>
    request(http(app))
      .post(api("/bookings"))
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send({
        serviceId: s.serviceId,
        staffId: s.staffIds[0],
        startsAt: vnAt(DAY, "10:00"),
        customer: {
          name: "Võ Hà",
          phone: `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        },
        source: "phone",
        ...patch,
      });
  const reschedule = (id: string, body: object) =>
    request(http(app))
      .post(api(`/bookings/${id}/reschedule`))
      .set("authorization", owner)
      .set("idempotency-key", `k-${randomUUID()}`)
      .send(body);
  const check = async (q: Record<string, string>) =>
    bookingCheckSchema.parse(
      (
        await request(http(app))
          .get(api("/booking-check"))
          .query({ serviceId: s.serviceId, ...q })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
  const requireBed = () =>
    request(http(app))
      .put(api(`/services/${s.serviceId}/resource-requirements`))
      .set("authorization", owner)
      .send({ items: [{ resourceTypeId: bedTypeId, quantity: 1 }] })
      .expect(204);

  beforeEach(async () => {
    now = new Date("2026-12-01T08:00:00+07:00");
    await clearRateLimits(app);
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
    bedTypeId = idOf(await post("/resource-types", { name: "Giường" }).expect(201));
    bedId = idOf(
      await post("/resources", { resourceTypeId: bedTypeId, name: "Giường", capacity: 1 }).expect(
        201,
      ),
    );
  });

  it("E1 after-hours override still needs a free unit; a busy unit is a conflict, not an override", async () => {
    await requireBed();
    const evening = {
      startsAt: vnAt(DAY, "20:00"),
      source: "walk_in",
      overrides: ["hours"],
      overrideReason: "khách quen",
    };
    const first = salonBookingSchema.parse((await book(evening).expect(201)).body);
    expect(first.resources.map((r) => r.resourceId)).toEqual([bedId]);
    expect(first.ruleOverrides).toEqual(["hours"]);
    expect(code(await book({ ...evening, staffId: s.staffIds[1] }).expect(409))).toBe(
      "booking.slot_taken",
    );
    expect(await check({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "20:00") })).toMatchObject({
      bookable: false,
      blocked: true,
      requiredOverrides: [],
    });
    // Without the override and with the bed free (20:45), the CRM is told what it needs.
    const res = await book({
      staffId: s.staffIds[1],
      startsAt: vnAt(DAY, "20:45"),
      source: "walk_in",
    }).expect(409);
    expect(code(res)).toBe("booking.override_required");
  });

  it("E2 unneeded overrides are neither recorded nor audited", async () => {
    const b = salonBookingSchema.parse(
      (
        await book({
          startsAt: vnAt(DAY, "11:00"),
          overrides: ["hours", "horizon"],
          overrideReason: "cẩn thận",
        }).expect(201)
      ).body,
    );
    expect(b.ruleOverrides).toEqual([]);
    expect(
      await prisma.auditLog.count({
        where: { action: "booking.rules_overridden", targetId: b.id },
      }),
    ).toBe(0);
    // Only the one actually needed is kept.
    const late = salonBookingSchema.parse(
      (
        await book({
          startsAt: vnAt(DAY, "19:00"),
          overrides: ["hours", "horizon"],
          overrideReason: "muộn",
        }).expect(201)
      ).body,
    );
    expect(late.ruleOverrides).toEqual(["hours"]);
  });

  it("E3 reschedule may overlap the booking's own old interval on a single unit", async () => {
    await requireBed();
    const b = idOf(await book().expect(201));
    const moved = salonBookingSchema.parse(
      (await reschedule(b, { startsAt: vnAt(DAY, "10:15") }).expect(200)).body,
    );
    expect(moved.startsAt).toBe(vnAt(DAY, "10:15"));
    expect(moved.resources).toHaveLength(1);
    const claims = await prisma.bookingOccupancy.count({ where: { bookingId: b, active: true } });
    expect(claims).toBe(2); // staff + bed, old rows replaced
  });

  it("E4 reschedule outside hours: override_required, then audited with the override", async () => {
    const b = idOf(await book().expect(201));
    expect(code(await reschedule(b, { startsAt: vnAt(DAY, "19:30") }).expect(409))).toBe(
      "booking.override_required",
    );
    const moved = salonBookingSchema.parse(
      (
        await reschedule(b, {
          startsAt: vnAt(DAY, "19:30"),
          overrides: ["hours"],
          overrideReason: "khách xin",
        }).expect(200)
      ).body,
    );
    expect(moved.ruleOverrides).toEqual(["hours"]);
    expect(
      await prisma.auditLog.count({ where: { action: "booking.rules_overridden", targetId: b } }),
    ).toBe(1);
  });

  it("E5 a hold claims the unit and booking from it converts the unit claim in place", async () => {
    await requireBed();
    const ctx = await app.get(BookingContexts).forSalon(s.salonId);
    const hold = await app.get(HoldsCommand).create(ctx, "device-e5", {
      serviceId: s.serviceId,
      variantId: null,
      addOnIds: [],
      staffId: s.staffIds[0],
      startsAt: new Date(vnAt(DAY, "13:00")),
    });
    expect(
      code(await book({ staffId: s.staffIds[1], startsAt: vnAt(DAY, "13:00") }).expect(409)),
    ).toBe("booking.slot_taken");
    const { bookingId } = await app.get(CreateBookingCommand).execute(
      ctx,
      { kind: "customer", userId: null, deviceHash: "device-e5" },
      {
        source: "salon_profile",
        selection: {
          serviceId: s.serviceId,
          variantId: null,
          addOnIds: [],
          staffId: s.staffIds[0],
          startsAt: new Date(vnAt(DAY, "13:00")),
        },
        customer: { name: "Đỗ Mai", phoneE164: "+84912000555" },
        note: null,
        overrides: [],
        overrideReason: null,
        holdId: hold.id,
      },
      { scope: "device:device-e5", route: "test", key: `k-${randomUUID()}`, requestHash: "x" },
    );
    const rows = await prisma.bookingOccupancy.findMany({ where: { bookingId } });
    expect(rows.map((r) => (r.resourceUnitId ? "unit" : "staff")).sort()).toEqual([
      "staff",
      "unit",
    ]);
    expect(await prisma.bookingHold.count({ where: { salonId: s.salonId } })).toBe(0);
  });

  it("E6 walk-in recorded earlier today needs hours + lead time; nothing else helps busy time", async () => {
    expect(
      await check({ staffId: s.staffIds[0], startsAt: vnAt("2026-12-01", "07:30") }),
    ).toMatchObject({
      requiredOverrides: ["hours", "lead_time"],
      blocked: false,
    });
    const b = salonBookingSchema.parse(
      (
        await book({
          startsAt: vnAt("2026-12-01", "07:30"),
          source: "walk_in",
          overrides: ["hours", "lead_time"],
          overrideReason: "ghi lại khách vãng lai",
        }).expect(201)
      ).body,
    );
    expect(new Set(b.ruleOverrides)).toEqual(new Set(["hours", "lead_time"]));
  });

  it("E7 a requirement added after booking applies on reschedule; holds count as claims for capacity cuts", async () => {
    const b = idOf(await book().expect(201));
    await requireBed();
    const moved = salonBookingSchema.parse(
      (await reschedule(b, { startsAt: vnAt(DAY, "15:00") }).expect(200)).body,
    );
    expect(moved.resources.map((r) => r.resourceId)).toEqual([bedId]);
    // Pausing the bed is refused while its unit holds a future claim (bookings and holds alike).
    expect(
      code(
        await request(http(app))
          .patch(api(`/resources/${bedId}`))
          .set("authorization", owner)
          .send({ isActive: false })
          .expect(409),
      ),
    ).toBe("resource.in_use");
  });
});
