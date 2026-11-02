// Integration against the local stack: salon registration, tenant guard, generated cross-tenant
// suite (spec 05 AC6), immediate revocation (AC9), staff scoping (AC8).
import type { INestApplication } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authSessionSchema,
  categoryListSchema,
  locationListSchema,
  problemSchema,
  salonRegistrationResultSchema,
  salonSummarySchema,
  type SalonRegistrationInput,
} from "@gugu/contracts";
import {
  addSalonMember,
  bearerFor,
  createSalonFixture,
  type SalonFixture,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { countMailsTo, extractMagicLink, waitForMail } from "../../../test/mailpit";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { listRoutes } from "../authorization/authorization.facade";

describe("salons & tenancy (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: SalonFixture;
  let b: SalonFixture;
  let ownerA: string;
  let ref: { categoryId: string; provinceId: string; wardId: string };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    a = await createSalonFixture(prisma, "Salon A");
    b = await createSalonFixture(prisma, "Salon B");
    ownerA = await bearerFor(app, a.ownerUserId);
    const category = await prisma.serviceCategory.findFirstOrThrow({ where: { slug: "nails" } });
    const ward = await prisma.location.findFirstOrThrow({ where: { code: "stub-79-ben-thanh" } });
    ref = { categoryId: category.id, provinceId: ward.parentId ?? "", wardId: ward.id };
  });
  afterAll(async () => {
    await app.close();
  });

  const registration = (patch: Partial<SalonRegistrationInput> = {}): SalonRegistrationInput => ({
    businessName: "Lotus Nail Quận 1",
    phone: "0912 345 678",
    streetAddress: "12 Lê Lợi",
    locationsHint: "1",
    locale: "vi",
    ...ref,
    ...patch,
  });

  it("public reference data: categories and the province → ward stub", async () => {
    const cats = await request(http(app)).get("/api/v1/public/categories").expect(200);
    expect(categoryListSchema.parse(cats.body).items.map((c) => c.slug)).toContain("nails");
    const wards = await request(http(app))
      .get(`/api/v1/public/locations?level=ward&parentId=${ref.provinceId}`)
      .expect(200);
    expect(locationListSchema.parse(wards.body).items.length).toBeGreaterThan(0);
  });

  it("signed-in registration: owner at once, trial started, audited", async () => {
    const res = await request(http(app))
      .post("/api/v1/salons/registrations")
      .set("authorization", ownerA)
      .send(registration())
      .expect(201);
    const result = salonRegistrationResultSchema.parse(res.body);
    expect(result).toMatchObject({ status: "draft", magicLinkStatus: "not_required" });
    expect(result.salonSlug).toMatch(/^lotus-nail-quan-1-[0-9a-f]{6}$/);

    const salon = await prisma.salon.findUniqueOrThrow({
      where: { id: result.salonId },
      include: { members: true, location: true, subscriptions: true },
    });
    expect(salon.phoneE164).toBe("+84912345678");
    expect(salon.members).toMatchObject([
      { userId: a.ownerUserId, role: "owner", status: "active" },
    ]);
    expect(salon.subscriptions).toMatchObject([{ status: "trialing" }]);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "salon.registered", salonId: result.salonId },
    });
    expect(audit?.actorId).toBe(a.ownerUserId);

    const summary = await request(http(app))
      .get(`/api/v1/salons/${result.salonId}`)
      .set("authorization", ownerA)
      .expect(200);
    expect(salonSummarySchema.parse(summary.body).myRole).toBe("owner");
  });

  it("anonymous registration: pending until the emailed link is opened", async () => {
    const email = testEmail("newowner");
    await request(http(app))
      .post("/api/v1/salons/registrations")
      .send(registration({ email: undefined }))
      .expect(400);
    const res = await request(http(app))
      .post("/api/v1/salons/registrations")
      .send(registration({ email, businessName: "Tiệm Mi Đẹp", locale: "en" }))
      .expect(201);
    const result = salonRegistrationResultSchema.parse(res.body);
    expect(result.magicLinkStatus).toBe("sent");
    const member = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: result.salonId },
    });
    expect(member.status).toBe("pending_verification");

    const mail = await waitForMail(email);
    expect(mail.subject).toBe("Confirm Tiệm Mi Đẹp on GuGu");
    const verified = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ token: extractMagicLink(mail).token, client: "native" })
      .expect(200);
    const session = authSessionSchema.parse(verified.body);
    expect(session.redirectPath).toBe("/en/business");
    expect(session.user.memberships).toMatchObject([
      { salonId: result.salonId, role: "owner", status: "active" },
    ]);
  });

  it("registration can't bypass per-email magic-link limits; sign-in later activates the owner", async () => {
    const email = testEmail("flood");
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(http(app))
        .post("/api/v1/salons/registrations")
        .send(registration({ email, businessName: `Flood ${String(i)}` }))
        .expect(201);
      statuses.push(salonRegistrationResultSchema.parse(res.body).magicLinkStatus);
    }
    expect(statuses).toEqual(["sent", "sent", "sent", "rate_limited"]);
    expect(await countMailsTo(email)).toBe(3);
    // The same per-email counter blocks the public sign-in endpoint too.
    await request(http(app))
      .post("/api/v1/auth/magic-link")
      .send({ email, locale: "vi" })
      .expect(429);

    // Any proof of the email (here: one of the registration links) activates all 4 pending salons.
    const { token } = extractMagicLink(await waitForMail(email));
    const verified = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ token, client: "native" })
      .expect(200);
    const memberships = authSessionSchema.parse(verified.body).user.memberships;
    expect(memberships).toHaveLength(4);
    expect(memberships.every((m) => m.status === "active" && m.role === "owner")).toBe(true);
  });

  it("rejects bad phone numbers and unknown locations", async () => {
    const phone = await request(http(app))
      .post("/api/v1/salons/registrations")
      .set("authorization", ownerA)
      .send(registration({ phone: "12345678" }))
      .expect(400);
    expect(problemSchema.parse(phone.body).code).toBe("salon.invalid_phone");
    const ward = await prisma.location.findFirstOrThrow({ where: { code: "stub-01-ba-dinh" } });
    const loc = await request(http(app))
      .post("/api/v1/salons/registrations")
      .set("authorization", ownerA)
      .send(registration({ wardId: ward.id }))
      .expect(400);
    expect(problemSchema.parse(loc.body).code).toBe("salon.unknown_location");
  });

  it("generated cross-tenant suite: every salon route answers 404 for another salon", async () => {
    const routes = listRoutes(
      app.get(DiscoveryService),
      app.get(MetadataScanner),
      app.get(Reflector),
    ).filter((r) => r.policy?.kind === "salon");
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const route of routes) {
      const path = `/api/v1/${route.path.replace(":salonId", b.salonId)}`;
      const method = route.method.toLowerCase() as "get" | "post" | "patch" | "put" | "delete";
      const res = await request(http(app))[method](path).set("authorization", ownerA).send({});
      expect({ route: `${route.method} ${route.path}`, status: res.status }).toEqual({
        route: `${route.method} ${route.path}`,
        status: 404,
      });
      expect(problemSchema.parse(res.body).code).toBe("common.not_found");
    }
  });

  it("staff: 403 on owner-level writes; manager can edit the profile (audited)", async () => {
    const staff = await bearerFor(app, await addSalonMember(prisma, a.salonId, "staff"));
    const manager = await bearerFor(app, await addSalonMember(prisma, a.salonId, "manager"));
    await request(http(app))
      .get(`/api/v1/salons/${a.salonId}`)
      .set("authorization", staff)
      .expect(200);
    await request(http(app))
      .get(`/api/v1/salons/${a.salonId}/members`)
      .set("authorization", staff)
      .expect(403);
    await request(http(app))
      .patch(`/api/v1/salons/${a.salonId}`)
      .set("authorization", staff)
      .send({ name: "Hijacked" })
      .expect(403);
    await request(http(app))
      .get(`/api/v1/salons/${a.salonId}/entitlements`)
      .set("authorization", staff)
      .expect(403);
    await request(http(app))
      .patch(`/api/v1/salons/${a.salonId}`)
      .set("authorization", manager)
      .send({ name: "Salon A Renamed" })
      .expect(204);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "salon.profile_updated", salonId: a.salonId },
    });
    expect(audit).not.toBeNull();
  });

  it("removing a member blocks their very next request", async () => {
    const userId = await addSalonMember(prisma, a.salonId, "receptionist");
    const token = await bearerFor(app, userId);
    await request(http(app))
      .get(`/api/v1/salons/${a.salonId}`)
      .set("authorization", token)
      .expect(200);
    await prisma.salonMember.updateMany({
      where: { salonId: a.salonId, userId },
      data: { status: "removed" },
    });
    await request(http(app))
      .get(`/api/v1/salons/${a.salonId}`)
      .set("authorization", token)
      .expect(404);
  });

  it("org owner reaches every salon of the organisation, not other organisations", async () => {
    const second = await prisma.salon.create({
      data: {
        organizationId: a.organizationId,
        slug: `second-${Date.now().toString(36)}`,
        name: "Salon A branch",
        ownerUserId: a.ownerUserId,
      },
    });
    const res = await request(http(app))
      .get(`/api/v1/salons/${second.id}`)
      .set("authorization", ownerA)
      .expect(200);
    expect(salonSummarySchema.parse(res.body).myRole).toBe("owner");
  });
});
