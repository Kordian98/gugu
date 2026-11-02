// Integration: services and staff are bookable by default (owner bug: services created after
// "add yourself" had no staff → nothing bookable, silently). Default assignments, the Today
// bookability issues, and availability's `unavailableReason` (topic 07 + 06 read side).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  availabilitySchema,
  earliestSlotsSchema,
  onboardingSchema,
  type ServiceInput,
  serviceSchema,
  teamSchema,
  unavailableReasonSchema,
} from "@gugu/contracts";
import { addDays, UNAVAILABLE_REASONS } from "@gugu/domain";
import { bearerFor } from "../../../test/factories/identity";
import { createBookableSalon, type BookableSalonFixture } from "../../../test/factories/booking";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const tomorrow = addDays(today, 1);

describe("bookability defaults & unavailable reasons (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let owner: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    s = await createBookableSalon(prisma);
    owner = await bearerFor(app, s.ownerUserId);
  });
  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const body = (patch: Partial<ServiceInput> = {}): ServiceInput => ({
    name: { vi: "Gội đầu", en: "Hair wash" },
    price: 80000,
    durationMinutes: 30,
    ...patch,
  });
  const createService = async (patch: Partial<ServiceInput> = {}) =>
    serviceSchema.parse(
      (
        await api()
          .post(`/api/v1/salons/${s.salonId}/services`)
          .set("authorization", owner)
          .send(body(patch))
          .expect(201)
      ).body,
    );
  const availability = async (serviceId: string, from = tomorrow, to = from) =>
    availabilitySchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/availability`)
          .query({ serviceId, from, to })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
  const onboarding = async () =>
    onboardingSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/onboarding`)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
  const team = async () =>
    teamSchema.parse(
      (await api().get(`/api/v1/salons/${s.salonId}/team`).set("authorization", owner).expect(200))
        .body,
    );

  it("reason codes match the domain list", () => {
    expect([...unavailableReasonSchema.options]).toEqual([...UNAVAILABLE_REASONS]);
  });

  it("a new service is assigned to every bookable staff member by default", async () => {
    // A third, non-bookable profile must not be assigned.
    await prisma.staffProfile.create({
      data: { salonId: s.salonId, displayName: "Lễ tân", isBookable: false, sortOrder: 9 },
    });
    const svc = await createService();
    expect([...svc.staffIds].sort()).toEqual([...s.staffIds].sort());
    const a = await availability(svc.id);
    expect(a.days[0]?.slots.length).toBeGreaterThan(0);
    expect(a.unavailableReason).toBeNull();
    // Updating without staffIds keeps the links.
    const updated = serviceSchema.parse(
      (
        await api()
          .patch(`/api/v1/salons/${s.salonId}/services/${svc.id}`)
          .set("authorization", owner)
          .send(body({ price: 90000 }))
          .expect(200)
      ).body,
    );
    expect(updated.staffIds).toHaveLength(2);
  });

  it("explicitly nobody: flagged on Today and availability says no_staff_assigned", async () => {
    const before = (await onboarding()).issues.unassignedServices;
    const svc = await createService({ name: { vi: "Không ai làm" }, staffIds: [] });
    expect(svc.staffIds).toEqual([]);
    expect((await onboarding()).issues.unassignedServices).toBe(before + 1);
    const a = await availability(svc.id);
    expect(a.days).toEqual([]);
    expect(a.unavailableReason).toBe("no_staff_assigned");
    // Inactive services are not an issue.
    await api()
      .patch(`/api/v1/salons/${s.salonId}/services/${svc.id}/active`)
      .set("authorization", owner)
      .send({ isActive: false })
      .expect(204);
    expect((await onboarding()).issues.unassignedServices).toBe(before);
  });

  it("a new staff member gets every active service; without hours → no_working_hours", async () => {
    const inactive = await createService({ name: { vi: "Tạm ngưng" }, isActive: false });
    const created = await api()
      .post(`/api/v1/salons/${s.salonId}/team`)
      .set("authorization", owner)
      .send({ displayName: "Hà" })
      .expect(201);
    const id = (created.body as { id: string }).id;
    const ha = (await team()).items.find((x) => x.id === id);
    const active = await prisma.service.findMany({
      where: { salonId: s.salonId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    expect([...(ha?.serviceIds ?? [])].sort()).toEqual(active.map((x) => x.id).sort());
    expect(ha?.serviceIds).not.toContain(inactive.id);
    // Editing without serviceIds keeps them.
    await api()
      .patch(`/api/v1/salons/${s.salonId}/team/${id}`)
      .set("authorization", owner)
      .send({ displayName: "Hà Vy" })
      .expect(204);
    expect((await team()).items.find((x) => x.id === id)?.serviceIds).toHaveLength(active.length);
    // A service only Hà performs: Hà has no working hours yet.
    const only = await createService({ name: { vi: "Chỉ Hà" }, staffIds: [id] });
    expect((await availability(only.id)).unavailableReason).toBe("no_working_hours");
    // Staff with no active service are flagged.
    await api()
      .patch(`/api/v1/salons/${s.salonId}/team/${id}`)
      .set("authorization", owner)
      .send({ displayName: "Hà Vy", serviceIds: [] })
      .expect(204);
    expect((await onboarding()).issues.staffWithoutServices).toBe(1);
  });

  it("a range after the booking window → outside_booking_window", async () => {
    const day = addDays(today, 90); // fixture window: 60 days
    const a = await availability(s.serviceId, day);
    expect(a.days).toEqual([]);
    expect(a.unavailableReason).toBe("outside_booking_window");
  });

  const earliest = async (query: Record<string, string | number>) =>
    earliestSlotsSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${s.salonId}/availability/earliest`)
          .query(query)
          .set("authorization", owner)
          .expect(200)
      ).body,
    );

  it("earliest slots: first options across days, perDay cap, staff filter, reasons", async () => {
    const any = await earliest({ serviceId: s.serviceId, limit: 5, perDay: 2 });
    expect(any.slots).toHaveLength(5);
    const dates = any.slots.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    for (const d of new Set(dates))
      expect(dates.filter((x) => x === d).length).toBeLessThanOrEqual(2);
    expect((dates[0] ?? "") >= today).toBe(true);
    expect(any.slots[0]?.staffIds.length).toBeGreaterThan(0);
    expect(any.unavailableReason).toBeNull();
    const one = await earliest({ serviceId: s.serviceId, staffId: s.staffIds[1], limit: 3 });
    expect(one.slots.every((x) => x.staffIds.includes(s.staffIds[1]))).toBe(true);
    const nobody = await createService({ name: { vi: "Không ai" }, staffIds: [] });
    const none = await earliest({ serviceId: nobody.id });
    expect(none.slots).toEqual([]);
    expect(none.unavailableReason).toBe("no_staff_assigned");
  });

  it("earliest slots search past the 31-day chunk (salon closed for 40 days)", async () => {
    await prisma.salonHoliday.create({
      data: {
        salonId: s.salonId,
        startDate: new Date(`${today}T00:00:00Z`),
        endDate: new Date(`${addDays(today, 39)}T00:00:00Z`),
        closed: true,
      },
    });
    const r = await earliest({ serviceId: s.serviceId, limit: 2 });
    expect(r.slots[0]?.date).toBe(addDays(today, 40));
    // Window 60 days: nothing in the window once days 40–60 are closed too → fully_booked.
    await prisma.salonHoliday.create({
      data: {
        salonId: s.salonId,
        startDate: new Date(`${addDays(today, 40)}T00:00:00Z`),
        endDate: new Date(`${addDays(today, 70)}T00:00:00Z`),
        closed: true,
      },
    });
    const closed = await earliest({ serviceId: s.serviceId });
    expect(closed.slots).toEqual([]);
    expect(closed.unavailableReason).toBe("fully_booked");
  });
});
