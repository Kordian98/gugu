// Integration against the local stack: salon registration, tenant guard, generated cross-tenant
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
    expect(mail.subject).toBe("Confirm Tiệm Mi Đẹp in GuGu Studio");
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

  it("registration can't bypass per-email limits; each salon needs its own proof of intent", async () => {
    const email = testEmail("flood");
    const results = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(http(app))
        .post("/api/v1/salons/registrations")
        .send(registration({ email, businessName: `Flood ${String(i)}` }))
        .expect(201);
      results.push(salonRegistrationResultSchema.parse(res.body));
    }
    expect(results.map((r) => r.magicLinkStatus)).toEqual(["sent", "sent", "sent", "rate_limited"]);
    expect(await countMailsTo(email)).toBe(3);
    // The same per-email counter blocks the public sign-in endpoint too.
    await request(http(app))
      .post("/api/v1/auth/magic-link")
      .send({ email, locale: "vi" })
      .expect(429);

    // The newest registration email belongs to "Flood 2": it activates that salon only.
    const mail = await waitForMail(email);
    expect(mail.subject).toContain("Flood 2");
    const verified = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ token: extractMagicLink(mail).token, client: "native" })
      .expect(200);
    const session = authSessionSchema.parse(verified.body);
    const active = session.user.memberships.filter((m) => m.status === "active");
    expect(active.map((m) => m.salonId)).toEqual([results[2]?.salonId]);
    if (session.session.kind !== "native") throw new Error("expected native");
    const auth = `Bearer ${session.session.tokens.accessToken}`;

    // The other three wait for an explicit decision.
    const listed = pendingSalonListSchema.parse(
      (
        await request(http(app))
          .get("/api/v1/me/pending-salons")
          .set("authorization", auth)
          .expect(200)
      ).body,
    );
    expect(listed.items.map((p) => p.salonName).sort()).toEqual(["Flood 0", "Flood 1", "Flood 3"]);
    const [confirmId, declineId] = [results[0]?.salonId ?? "", results[1]?.salonId ?? ""];
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
    // Confirming twice, or a salon you have no pending membership for, is a 404.
    await request(http(app))
      .post(`/api/v1/me/pending-salons/${declineId}/confirm`)
      .set("authorization", auth)
      .expect(404);
    await request(http(app))
      .post(`/api/v1/me/pending-salons/${b.salonId}/confirm`)
      .set("authorization", auth)
      .expect(404);
    const after = pendingSalonListSchema.parse(
      (await request(http(app)).get("/api/v1/me/pending-salons").set("authorization", auth)).body,
    );
    expect(after.items.map((p) => p.salonName)).toEqual(["Flood 3"]);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "salon.owner_declined", salonId: declineId },
    });
    expect(audit).not.toBeNull();
  });

  it("a plain sign-in never activates salons someone registered with your email", async () => {
    const email = testEmail("victim");
    const res = await request(http(app))
      .post("/api/v1/salons/registrations")
      .send(registration({ email, businessName: "Attacker Salon" }))
      .expect(201);
    const { salonId } = salonRegistrationResultSchema.parse(res.body);
    // Victim ignores that email and signs in normally.
    await request(http(app))
      .post("/api/v1/auth/magic-link")
      .send({ email, locale: "vi", client: "native" })
      .expect(202);
    const signInMail = await waitForMail(email);
    expect(signInMail.subject).toBe("Link đăng nhập GuGu Studio của bạn");
    const verified = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .send({ token: extractMagicLink(signInMail).token, client: "native" })
      .expect(200);
    const session = authSessionSchema.parse(verified.body);
    expect(session.user.memberships).toMatchObject([{ salonId, status: "pending_verification" }]);
    if (session.session.kind !== "native") throw new Error("expected native");
    await request(http(app))
      .get(`/api/v1/salons/${salonId}`)
      .set("authorization", `Bearer ${session.session.tokens.accessToken}`)
      .expect(404);
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
