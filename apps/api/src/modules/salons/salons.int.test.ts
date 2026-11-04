// Integration against the local stack: the retired registration route, tenant guard, generated cross-tenant
// suite (spec 05 AC6), immediate revocation (AC9), staff scoping (AC8).
import type { INestApplication } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authSessionSchema,
  pendingSalonListSchema,
  categoryListSchema,
  locationListSchema,
  problemSchema,
  salonSummarySchema,
} from "@gugu/contracts";
import {
  addSalonMember,
  bearerFor,
  createSalonFixture,
  type SalonFixture,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { extractMagicLink, waitForMail } from "../../../test/mailpit";
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

  // IP-keyed rate limits (the magic-link IP caps) count per /24, and every local run comes from 127.0.0.1: concurrent runs in
  // other worktrees used to push this file over the limit. Each run, and each retry below, sends
  // its own client /24 instead (X-Forwarded-For, trusted from loopback for this app only).
  const clientIp = () =>
    `10.${String(Math.floor(Math.random() * 256))}.${String(Math.floor(Math.random() * 256))}.7`;
  const runIp = clientIp();
  const trustProxy = process.env["TRUST_PROXY"];

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    process.env["TRUST_PROXY"] = "loopback";
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
    if (trustProxy === undefined) delete process.env["TRUST_PROXY"];
    else process.env["TRUST_PROXY"] = trustProxy;
  });

  const registration = () => ({
    businessName: "Lotus Nail Quận 1",
    phone: "0912 345 678",
    streetAddress: "12 Lê Lợi",
    locationsHint: "1",
    locale: "vi",
    ...ref,
  });

  it("public reference data: categories and the province → ward stub", async () => {
    const cats = await request(http(app)).get("/api/v1/public/categories").expect(200);
    expect(categoryListSchema.parse(cats.body).items.map((c) => c.slug)).toContain("nails");
    const wards = await request(http(app))
      .get(`/api/v1/public/locations?level=ward&parentId=${ref.provinceId}`)
      .expect(200);
    expect(locationListSchema.parse(wards.body).items.length).toBeGreaterThan(0);
  });

  it("POST /salons/registrations is removed: 404 for anonymous, members and admins; nothing created", async () => {
    // Signup parity (security review of the reg-flow merge): quick start is the only
    // salon-creating route, so every signup passes SignupGuard (ADR-0018).
    const admin = await prisma.user.create({
      data: {
        email: testEmail("reg-admin"),
        emailVerifiedAt: new Date(),
        platformRole: "support_admin",
        profile: { create: {} },
      },
    });
    const before = await prisma.salon.count();
    for (const auth of [null, ownerA, await bearerFor(app, admin.id)]) {
      const req = request(http(app))
        .post("/api/v1/salons/registrations")
        .set("x-forwarded-for", runIp);
      if (auth) req.set("authorization", auth);
      const res = await req.send(registration());
      expect(res.status).toBe(404);
    }
    expect(await prisma.salon.count()).toBe(before);
  });

  it("older pending salons still need an explicit decision; a plain sign-in never activates them", async () => {
    // Pending owner memberships can no longer be created through the API; these rows stand in for
    // salons registered anonymously before ADR-0018.
    const email = testEmail("legacy");
    const user = await prisma.user.create({ data: { email, profile: { create: {} } } });
    const pending = [];
    for (const name of ["Old 0", "Old 1"]) {
      const f = await createSalonFixture(prisma, name);
      await prisma.salonMember.updateMany({
        where: { salonId: f.salonId, role: "owner" },
        data: { userId: user.id, status: "pending_verification" },
      });
      pending.push(f.salonId);
    }
    await request(http(app))
      .post("/api/v1/auth/magic-link")
      .set("x-forwarded-for", runIp)
      .send({ email, locale: "vi", client: "native" })
      .expect(202);
    const signInMail = await waitForMail(email);
    const verified = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .set("x-forwarded-for", runIp)
      .send({ token: extractMagicLink(signInMail).token, client: "native" })
      .expect(200);
    const session = authSessionSchema.parse(verified.body);
    expect(session.user.memberships.every((m) => m.status === "pending_verification")).toBe(true);
    if (session.session.kind !== "native") throw new Error("expected native");
    const auth = `Bearer ${session.session.tokens.accessToken}`;
    const [confirmId, declineId] = [pending[0] ?? "", pending[1] ?? ""];
    await request(http(app))
      .get(`/api/v1/salons/${confirmId}`)
      .set("authorization", auth)
      .expect(404);
    const listed = pendingSalonListSchema.parse(
      (await request(http(app)).get("/api/v1/me/pending-salons").set("authorization", auth)).body,
    );
    expect(listed.items.map((p) => p.salonName).sort()).toEqual(["Old 0", "Old 1"]);
    await request(http(app))
      .post(`/api/v1/me/pending-salons/${confirmId}/confirm`)
      .set("authorization", auth)
      .expect(204);
    await request(http(app))
      .post(`/api/v1/me/pending-salons/${declineId}/decline`)
      .set("authorization", auth)
      .expect(204);
    await request(http(app))
      .get(`/api/v1/salons/${confirmId}`)
      .set("authorization", auth)
      .expect(200);
    await request(http(app))
      .get(`/api/v1/salons/${declineId}`)
      .set("authorization", auth)
      .expect(404);
    await request(http(app))
      .post(`/api/v1/me/pending-salons/${b.salonId}/confirm`)
      .set("authorization", auth)
      .expect(404);
    expect(
      await prisma.auditLog.count({
        where: { action: "salon.owner_declined", salonId: declineId },
      }),
    ).toBe(1);
  });

  it("salon profile rejects bad phone numbers and unknown locations", async () => {
    const profile = (patch: Record<string, unknown>) => ({
      name: "Salon A",
      phone: "0912 345 678",
      description: null,
      streetAddress: "12 Lê Lợi",
      provinceId: ref.provinceId,
      wardId: ref.wardId,
      ...patch,
    });
    const phone = await request(http(app))
      .patch(`/api/v1/salons/${a.salonId}/settings/profile`)
      .set("authorization", ownerA)
      .send(profile({ phone: "12345678" }))
      .expect(400);
    expect(problemSchema.parse(phone.body).code).toBe("salon.invalid_phone");
    const ward = await prisma.location.findFirstOrThrow({ where: { code: "stub-01-ba-dinh" } });
    const loc = await request(http(app))
      .patch(`/api/v1/salons/${a.salonId}/settings/profile`)
      .set("authorization", ownerA)
      .send(profile({ wardId: ward.id }))
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
