// Integration against the local stack: catalogue, team + invitations, schedules, settings and the
// onboarding checklist (topic 07 M7.4–M7.6), including tenant isolation and permission checks.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  invitationCreatedSchema,
  onboardingSchema,
  salonSettingsSchema,
  type ServiceInput,
  serviceListSchema,
  serviceSchema,
  teamSchema,
} from "@gugu/contracts";
import {
  addSalonMember,
  bearerFor,
  createSalonFixture,
  type SalonFixture,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { waitForMail } from "../../../test/mailpit";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { EntitlementService, SubscriptionsFacade } from "../subscriptions/subscriptions.facade";

describe("catalog, team & settings (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: SalonFixture;
  let b: SalonFixture;
  let ownerA: string;
  let ownerB: string;
  let staffA: string;
  let receptionistA: string;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    a = await createSalonFixture(prisma, "Catalog A");
    // Like a registered salon: the 14-day trial grants the seats used by invitations.
    await app.get(SubscriptionsFacade).startTrial({ salonId: a.salonId });
    b = await createSalonFixture(prisma, "Catalog B");
    ownerA = await bearerFor(app, a.ownerUserId);
    ownerB = await bearerFor(app, b.ownerUserId);
    staffA = await bearerFor(app, await addSalonMember(prisma, a.salonId, "staff"));
    receptionistA = await bearerFor(app, await addSalonMember(prisma, a.salonId, "receptionist"));
  });
  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const version = async (salonId: string) =>
    (await prisma.salonSettings.findUnique({ where: { salonId } }))?.availabilityVersion ?? 0;

  const gel = (patch: Partial<ServiceInput> = {}): ServiceInput => ({
    name: { vi: "Sơn gel", en: "Gel polish" },
    price: 150000,
    priceMax: 250000,
    durationMinutes: 45,
    bufferAfterMinutes: 10,
    variants: [
      { name: { vi: "Tay" }, price: 150000, durationMinutes: 45 },
      { name: { vi: "Chân" }, price: 180000, durationMinutes: 50 },
    ],
    addOns: [{ name: { vi: "Phá gel cũ" }, extraDurationMinutes: 15, extraPrice: 50000 }],
    ...patch,
  });

  let staffId = "";
  let serviceId = "";

  it("team: owner adds a staff member without an account; staff role may not", async () => {
    await api()
      .post(`/api/v1/salons/${a.salonId}/team`)
      .set("authorization", staffA)
      .send({ displayName: "Mai" })
      .expect(403);
    const res = await api()
      .post(`/api/v1/salons/${a.salonId}/team`)
      .set("authorization", ownerA)
      .send({ displayName: "Mai", color: "pink" })
      .expect(201);
    staffId = (res.body as { id: string }).id;
    // "I also do services": the owner's own profile, linked to their membership, only once.
    await api()
      .post(`/api/v1/salons/${a.salonId}/team`)
      .set("authorization", ownerA)
      .send({ displayName: "Chủ salon", linkToMe: true, isBookable: false })
      .expect(201);
    await api()
      .post(`/api/v1/salons/${a.salonId}/team`)
      .set("authorization", ownerA)
      .send({ displayName: "Again", linkToMe: true })
      .expect(409);
  });

  it("services: create with variants, add-ons and staff; bumps availability version", async () => {
    const before = await version(a.salonId);
    const res = await api()
      .post(`/api/v1/salons/${a.salonId}/services`)
      .set("authorization", ownerA)
      .send(gel({ staffIds: [staffId] }))
      .expect(201);
    const service = serviceSchema.parse(res.body);
    serviceId = service.id;
    expect(service).toMatchObject({ price: 150000, priceMax: 250000, staffIds: [staffId] });
    expect(service.variants.map((v) => v.name.vi)).toEqual(["Tay", "Chân"]);
    expect(service.addOns[0]).toMatchObject({ extraDurationMinutes: 15, extraPrice: 50000 });
    expect(await version(a.salonId)).toBeGreaterThan(before);

    await api()
      .post(`/api/v1/salons/${a.salonId}/services`)
      .set("authorization", receptionistA)
      .send(gel())
      .expect(403);
    await api()
      .post(`/api/v1/salons/${a.salonId}/services`)
      .set("authorization", ownerA)
      .send(gel({ price: 300000, priceMax: 100000 }))
      .expect(400);
  });

  it("services: update keeps variant ids, removes missing ones; reorder; toggle; delete", async () => {
    const list = serviceListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${a.salonId}/services`)
          .set("authorization", staffA)
          .expect(200)
      ).body,
    );
    const current = list.items.find((s) => s.id === serviceId);
    const keep = current?.variants[0];
    if (!current || !keep) throw new Error("service missing");
    const updated = serviceSchema.parse(
      (
        await api()
          .patch(`/api/v1/salons/${a.salonId}/services/${serviceId}`)
          .set("authorization", ownerA)
          .send(gel({ variants: [{ id: keep.id, name: { vi: "Tay (mới)" }, price: 160000 }] }))
          .expect(200)
      ).body,
    );
    expect(updated.variants).toHaveLength(1);
    expect(updated.variants[0]).toMatchObject({ id: keep.id, price: 160000 });
    // staffIds omitted on update → links unchanged (explicit [] clears them).
    expect(updated.staffIds).toEqual(current.staffIds);

    const second = serviceSchema.parse(
      (
        await api()
          .post(`/api/v1/salons/${a.salonId}/services`)
          .set("authorization", ownerA)
          .send(gel({ name: { vi: "Cắt tóc nam" }, variants: [], addOns: [] }))
          .expect(201)
      ).body,
    );
    await api()
      .patch(`/api/v1/salons/${a.salonId}/services/order`)
      .set("authorization", ownerA)
      .send({ ids: [second.id] })
      .expect(400);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/services/order`)
      .set("authorization", ownerA)
      .send({ ids: [second.id, serviceId] })
      .expect(204);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/services/${second.id}/active`)
      .set("authorization", ownerA)
      .send({ isActive: false })
      .expect(204);
    const after = serviceListSchema.parse(
      (await api().get(`/api/v1/salons/${a.salonId}/services`).set("authorization", ownerA)).body,
    );
    expect(after.items.map((s) => s.id)).toEqual([second.id, serviceId]);
    expect(after.items[0]?.isActive).toBe(false);
    await api()
      .delete(`/api/v1/salons/${a.salonId}/services/${second.id}`)
      .set("authorization", ownerA)
      .expect(204);
  });

  it("tenant isolation: salon B cannot read or change salon A's catalogue or team", async () => {
    await api()
      .get(`/api/v1/salons/${a.salonId}/services`)
      .set("authorization", ownerB)
      .expect(404);
    await api()
      .patch(`/api/v1/salons/${b.salonId}/services/${serviceId}`)
      .set("authorization", ownerB)
      .send(gel())
      .expect(404);
    await api()
      .post(`/api/v1/salons/${b.salonId}/services`)
      .set("authorization", ownerB)
      .send(gel({ staffIds: [staffId] }))
      .expect(400);
    await api()
      .patch(`/api/v1/salons/${b.salonId}/team/${staffId}/schedule`)
      .set("authorization", ownerB)
      .send({ days: [] })
      .expect(404);
    // Composite FK backstop: a cross-tenant assignment is rejected by the database.
    await expect(
      prisma.staffService.create({ data: { salonId: b.salonId, staffId, serviceId } }),
    ).rejects.toThrow();
  });

  it("schedules and time off: weekly hours with breaks, validation, listing", async () => {
    await api()
      .patch(`/api/v1/salons/${a.salonId}/team/${staffId}/schedule`)
      .set("authorization", ownerA)
      .send({ days: [{ weekday: 1, intervals: [{ start: "18:00", end: "09:00" }] }] })
      .expect(400);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/team/${staffId}/schedule`)
      .set("authorization", ownerA)
      .send({
        days: [1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          intervals: [{ start: "09:00", end: "18:00" }],
          breaks: [{ start: "12:00", end: "13:00" }],
        })),
      })
      .expect(204);
    // Replacing twice on the same day keeps one set of rows.
    await api()
      .patch(`/api/v1/salons/${a.salonId}/team/${staffId}/schedule`)
      .set("authorization", ownerA)
      .send({ days: [{ weekday: 1, intervals: [{ start: "10:00", end: "19:00" }] }] })
      .expect(204);
    await api()
      .post(`/api/v1/salons/${a.salonId}/team/${staffId}/time-off`)
      .set("authorization", ownerA)
      .send({ startsAt: "2030-01-02T02:00:00Z", endsAt: "2030-01-03T02:00:00Z", reason: "Tết" })
      .expect(201);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/services/${serviceId}`)
      .set("authorization", ownerA)
      .send(gel({ staffIds: [staffId] }))
      .expect(200);
    const team = teamSchema.parse(
      (await api().get(`/api/v1/salons/${a.salonId}/team`).set("authorization", ownerA).expect(200))
        .body,
    );
    const mai = team.items.find((s) => s.id === staffId);
    expect(mai?.schedule.days).toEqual([
      { weekday: 1, intervals: [{ start: "10:00", end: "19:00" }], breaks: [] },
    ]);
    expect(mai?.timeOff).toHaveLength(1);
    expect(mai?.serviceIds).toEqual([serviceId]);
    // Database CHECK: break must be weekday XOR date.
    await expect(
      prisma.$executeRaw`INSERT INTO staff_breaks (id, salon_id, staff_id, starts_at, ends_at, updated_at)
        VALUES (uuidv7(), ${a.salonId}::uuid, ${staffId}::uuid, '12:00', '13:00', now())`,
    ).rejects.toThrow(/staff_breaks_valid/);
  });

  it("settings, onboarding and go-live", async () => {
    const ward = await prisma.location.findFirstOrThrow({ where: { level: "ward" } });
    let progress = onboardingSchema.parse(
      (await api().get(`/api/v1/salons/${a.salonId}/onboarding`).set("authorization", ownerA)).body,
    );
    expect(progress.done).toEqual(["services", "team"]);
    await api()
      .post(`/api/v1/salons/${a.salonId}/go-live`)
      .set("authorization", ownerA)
      .expect(409);

    await api()
      .patch(`/api/v1/salons/${a.salonId}/settings/profile`)
      .set("authorization", ownerA)
      .send({
        name: "Catalog A Spa",
        phone: "0901 234 567",
        description: { vi: "Tiệm nail thân thiện" },
        streetAddress: "5 Nguyễn Huệ",
        provinceId: ward.parentId,
        wardId: ward.id,
      })
      .expect(204);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/settings/opening-hours`)
      .set("authorization", receptionistA)
      .send({ days: [] })
      .expect(403);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/settings/opening-hours`)
      .set("authorization", ownerA)
      .send({
        days: [
          { weekday: 1, intervals: [{ start: "09:00", end: "21:00" }] },
          {
            weekday: 7,
            intervals: [
              { start: "09:00", end: "12:00" },
              { start: "14:00", end: "18:00" },
            ],
          },
        ],
      })
      .expect(204);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/settings/booking`)
      .set("authorization", ownerA)
      .send({
        confirmationMode: "manual",
        manualConfirmWindowHours: 12,
        confirmNewClients: true,
        hideStaffChoice: false,
        minLeadTimeMinutes: 60,
        bookingWindowDays: 60,
        cancellationCutoffMinutes: 120,
        rescheduleCutoffMinutes: 120,
        slotGranularityMinutes: 15,
      })
      .expect(204);
    const holiday = await api()
      .post(`/api/v1/salons/${a.salonId}/settings/holidays`)
      .set("authorization", ownerA)
      .send({ startDate: "2030-01-28", endDate: "2030-02-02", reason: "Tết" })
      .expect(201);
    await api()
      .patch(`/api/v1/salons/${a.salonId}/settings/policies`)
      .set("authorization", ownerA)
      .send({ bookingPolicy: null, cancellationPolicy: { vi: "Hủy trước 2 giờ", en: "" } })
      .expect(204);

    const settings = salonSettingsSchema.parse(
      (await api().get(`/api/v1/salons/${a.salonId}/settings`).set("authorization", staffA)).body,
    );
    expect(settings.profile).toMatchObject({ name: "Catalog A Spa", phone: "+84901234567" });
    expect(settings.booking).toMatchObject({ confirmationMode: "manual", confirmNewClients: true });
    expect(settings.openingHours.days[1]?.intervals).toHaveLength(2);
    expect(settings.holidays[0]).toMatchObject({ startDate: "2030-01-28", closed: true });
    expect(settings.policies.cancellationPolicy?.vi).toBe("Hủy trước 2 giờ");

    progress = onboardingSchema.parse(
      (await api().get(`/api/v1/salons/${a.salonId}/onboarding`).set("authorization", ownerA)).body,
    );
    expect(progress).toMatchObject({ canGoLive: true, total: 5 });
    await api()
      .post(`/api/v1/salons/${a.salonId}/go-live`)
      .set("authorization", ownerA)
      .expect(204);
    progress = onboardingSchema.parse(
      (await api().get(`/api/v1/salons/${a.salonId}/onboarding`).set("authorization", ownerA)).body,
    );
    expect(progress.done).toContain("live");

    await api()
      .delete(
        `/api/v1/salons/${b.salonId}/settings/holidays/${(holiday.body as { id: string }).id}`,
      )
      .set("authorization", ownerB)
      .expect(404);
  });

  it("invitations: email-bound, single use, links the staff profile", async () => {
    const email = testEmail("invitee");
    const created = invitationCreatedSchema.parse(
      (
        await api()
          .post(`/api/v1/salons/${a.salonId}/invitations`)
          .set("authorization", ownerA)
          .send({ role: "staff", email, staffProfileId: staffId, locale: "vi" })
          .expect(201)
      ).body,
    );
    expect(created.emailSent).toBe(true);
    const mail = await waitForMail(email);
    expect(mail.text).toContain(created.acceptUrl);
    const token = new URL(created.acceptUrl).searchParams.get("token") ?? "";
    expect(await prisma.salonInvitation.count({ where: { tokenHash: token } })).toBe(0);

    const preview = await api().post("/api/v1/invitations/preview").send({ token }).expect(200);
    expect(preview.body).toMatchObject({
      salonName: "Catalog A Spa",
      role: "staff",
      status: "valid",
    });

    const stranger = await prisma.user.create({
      data: { email: testEmail("stranger"), emailVerifiedAt: new Date(), profile: { create: {} } },
    });
    await api()
      .post("/api/v1/invitations/accept")
      .set("authorization", await bearerFor(app, stranger.id))
      .send({ token })
      .expect(403);
    await api().post("/api/v1/invitations/accept").send({ token }).expect(401);

    const invitee = await prisma.user.create({
      data: { email, emailVerifiedAt: new Date(), profile: { create: { displayName: "Mai" } } },
    });
    const inviteeAuth = await bearerFor(app, invitee.id);
    await api()
      .post("/api/v1/invitations/accept")
      .set("authorization", inviteeAuth)
      .send({ token })
      .expect(200, { salonId: a.salonId });
    await api()
      .post("/api/v1/invitations/accept")
      .set("authorization", inviteeAuth)
      .send({ token })
      .expect(400);
    const profile = await prisma.staffProfile.findUniqueOrThrow({
      where: { id: staffId },
      include: { member: true },
    });
    expect(profile.member).toMatchObject({ userId: invitee.id, role: "staff", status: "active" });
    // The new member reaches the workspace with staff permissions.
    await api()
      .get(`/api/v1/salons/${a.salonId}/team`)
      .set("authorization", inviteeAuth)
      .expect(403);
    await api()
      .get(`/api/v1/salons/${a.salonId}/services`)
      .set("authorization", inviteeAuth)
      .expect(200);

    // Managers cannot invite managers; only the owner can.
    const manager = await bearerFor(app, await addSalonMember(prisma, a.salonId, "manager"));
    await api()
      .post(`/api/v1/salons/${a.salonId}/invitations`)
      .set("authorization", manager)
      .send({ role: "manager" })
      .expect(403);
    const link = invitationCreatedSchema.parse(
      (
        await api()
          .post(`/api/v1/salons/${a.salonId}/invitations`)
          .set("authorization", manager)
          .send({ role: "receptionist" })
          .expect(201)
      ).body,
    );
    expect(link.emailSent).toBe(false);
  });

  it("seat limit holds under parallel invitations and is re-checked on accept", async () => {
    const c = await createSalonFixture(prisma, "Seats C");
    await app.get(SubscriptionsFacade).startTrial({ salonId: c.salonId });
    // Owner + 1 seat.
    await prisma.entitlementOverride.create({
      data: {
        salonId: c.salonId,
        key: "staff.max_seats",
        value: 2,
        reason: "test",
        createdBy: "test",
      },
    });
    await app.get(EntitlementService).invalidate(c.salonId);
    const ownerC = await bearerFor(app, c.ownerUserId);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .post(`/api/v1/salons/${c.salonId}/invitations`)
          .set("authorization", ownerC)
          .send({ role: "staff" }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 403)).toHaveLength(4);

    // A member added out of band takes the last seat: the open invitation can no longer be used.
    const token = new URL(
      invitationCreatedSchema.parse(results.find((r) => r.status === 201)?.body).acceptUrl,
    ).searchParams.get("token");
    await addSalonMember(prisma, c.salonId, "receptionist");
    const joiner = await prisma.user.create({
      data: { email: testEmail("joiner"), emailVerifiedAt: new Date(), profile: { create: {} } },
    });
    await api()
      .post("/api/v1/invitations/accept")
      .set("authorization", await bearerFor(app, joiner.id))
      .send({ token })
      .expect(403);
  });

  it("emailed invitations are rate limited per inviter", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const res = await api()
        .post(`/api/v1/salons/${a.salonId}/invitations`)
        .set("authorization", ownerA)
        .send({ role: "staff", email: testEmail(`burst${String(i)}`) });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
