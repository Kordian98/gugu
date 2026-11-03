// Platform admin (topic 12 M12.6) side effects, on TEST_DATABASE_URL only (the vitest integration
// config refuses anything else). Complements admin.int.test.ts with generated / boundary checks:
// suspension blocks writes on EVERY salon route (route inventory), the entitlement cache entry is
// dropped after EVERY admin mutation, step-up expiry and its scope, platform roles grant no salon
// access, founding-partner auto-grant against MARKETPLACE_LAUNCH_AT (R-FP3/R-FP4), override expiry.
import type { INestApplication } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_ERRORS,
  ADMIN_STEP_UP_MINUTES,
  FOUNDING_WAIVER_MONTHS,
  problemSchema,
  SALON_SUSPENDED_ERROR,
} from "@gugu/contracts";
import type { PlatformRole } from "@gugu/domain";
import {
  bearerFor,
  createSalonFixture,
  enrolAdminMfa,
  type SalonFixture,
  steppedUpBearerFor,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { AppConfig } from "../../infrastructure/config/app-config";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { SessionService, totp } from "../auth/auth.facade";
import { listRoutes, type RouteInfo } from "../authorization/authorization.facade";
import {
  Clock,
  EntitlementService,
  SubscriptionsFacade,
} from "../subscriptions/subscriptions.facade";

const DAY = 86_400_000;
const MIN = 60_000;
const REASON = "Reviewed by platform support";
/** Any syntactically valid UUIDv7 for non-salon path params (the guard runs before handlers). */
const PLACEHOLDER_ID = "0190f000-0000-7000-8000-0000000000bb";

/** Real time plus an offset, or a frozen instant when `fixed` is set. */
class TestClock extends Clock {
  offsetMs = 0;
  fixed: Date | null = null;
  override now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date(Date.now() + this.offsetMs);
  }
}

describe("platform admin side effects (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let entitlements: EntitlementService;
  let facade: SubscriptionsFacade;
  let config: AppConfig;
  let routes: RouteInfo[];
  let superAdmin: string;
  const clock = new TestClock();
  const tag = `adx${Date.now().toString(36)}`;
  const fixtures: SalonFixture[] = [];

  const newSalon = async (name: string) => {
    const f = await createSalonFixture(prisma, `${tag} ${name}`);
    fixtures.push(f);
    return f;
  };
  const platformUser = async (role: PlatformRole) => {
    const user = await prisma.user.create({
      data: {
        email: testEmail(role),
        emailVerifiedAt: new Date(),
        platformRole: role,
        profile: { create: {} },
      },
    });
    return user.id;
  };
  const post = (path: string, bearer: string, body: object) =>
    request(http(app)).post(`/api/v1/admin/${path}`).set("authorization", bearer).send(body);
  const cacheKey = (salonId: string) => `entitlements:v1:${salonId}`;
  const cached = async (salonId: string) =>
    (await app.get(RedisService).client.exists(cacheKey(salonId))) === 1;
  const auditCount = (salonId: string) =>
    prisma.auditLog.count({ where: { salonId, actorType: "platform_admin" } });
  const setLaunch = (launch: Date | null) => {
    Object.defineProperty(config, "marketplaceLaunchAt", {
      get: () => launch,
      configurable: true,
    });
  };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    entitlements = app.get(EntitlementService);
    facade = app.get(SubscriptionsFacade);
    config = app.get(AppConfig);
    routes = listRoutes(app.get(DiscoveryService), app.get(MetadataScanner), app.get(Reflector));
    await clearRateLimits(app);
  });

  beforeEach(async () => {
    clock.offsetMs = 0;
    clock.fixed = null;
    // Each test uses a fresh, stepped-up admin session so step-up never depends on suite duration.
    superAdmin = await steppedUpBearerFor(app, await platformUser("super_admin"));
  });

  afterEach(() => {
    Reflect.deleteProperty(config, "marketplaceLaunchAt");
  });

  afterAll(async () => {
    const salonIds = fixtures.map((f) => f.salonId);
    await prisma.subscriptionEvent.deleteMany({ where: { salonId: { in: salonIds } } });
    await prisma.subscription.deleteMany({ where: { salonId: { in: salonIds } } });
    await prisma.entitlementOverride.deleteMany({ where: { salonId: { in: salonIds } } });
    await prisma.foundingPartner.deleteMany({
      where: { organizationId: { in: fixtures.map((f) => f.organizationId) } },
    });
    await app.close();
  });

  describe("suspension", () => {
    it("every non-GET salon route but the q92 allow-list answers 403 salon.suspended; GETs stay open", async () => {
      const s = await newSalon("SuspendMatrix");
      await facade.startTrial({ salonId: s.salonId });
      const owner = await bearerFor(app, s.ownerUserId);
      await post(`salons/${s.salonId}/suspend`, superAdmin, { reason: REASON }).expect(200);

      const salonRoutes = routes.filter((r) => r.policy?.kind === "salon");
      const writes = salonRoutes.filter((r) => r.method !== "GET");
      expect(writes.length).toBeGreaterThanOrEqual(20);
      const url = (r: RouteInfo) =>
        `/api/v1/${r.path.replace(":salonId", s.salonId).replace(/:[A-Za-z]+/g, PLACEHOLDER_ID)}`;
      const leaks: string[] = [];
      const exempt: string[] = [];
      for (const r of writes) {
        const method = r.method.toLowerCase() as "post" | "patch" | "put" | "delete";
        const res = await request(http(app))[method](url(r)).set("authorization", owner).send({});
        const code = (res.body as { code?: string }).code;
        if (r.allowWhileSuspended) {
          // q92: client erasure and the salon export start pass the suspension check.
          expect({ route: r.path, code }).not.toEqual({
            route: r.path,
            code: SALON_SUSPENDED_ERROR,
          });
          exempt.push(`${r.method} ${r.path}`);
        } else if (res.status !== 403 || code !== SALON_SUSPENDED_ERROR) {
          leaks.push(`${r.method} ${r.path} → ${String(res.status)} ${String(code)}`);
        }
      }
      expect(leaks, "salon writes not refused while suspended").toEqual([]);
      expect(exempt.sort()).toEqual([
        "POST salons/:salonId/customers/:customerId/erase",
        "POST salons/:salonId/privacy/exports",
      ]);

      const blockedReads: string[] = [];
      for (const r of salonRoutes.filter((x) => x.method === "GET")) {
        const res = await request(http(app)).get(url(r)).set("authorization", owner);
        if ((res.body as { code?: string }).code === SALON_SUSPENDED_ERROR) {
          blockedReads.push(`GET ${r.path}`);
        }
      }
      expect(blockedReads, "reads refused while suspended").toEqual([]);

      // Unsuspended: the same write goes through the guard again.
      await post(`salons/${s.salonId}/unsuspend`, superAdmin, { reason: REASON }).expect(200);
      const after = await request(http(app))
        .patch(`/api/v1/salons/${s.salonId}/settings/profile`)
        .set("authorization", owner)
        .send({});
      expect((after.body as { code?: string }).code).not.toBe(SALON_SUSPENDED_ERROR);
      expect(after.status).toBeLessThan(403);
    });

    it("suspending one salon leaves other salons writable", async () => {
      const a = await newSalon("SuspendA");
      const b = await newSalon("SuspendB");
      await post(`salons/${a.salonId}/suspend`, superAdmin, { reason: REASON }).expect(200);
      const ownerB = await bearerFor(app, b.ownerUserId);
      const res = await request(http(app))
        .patch(`/api/v1/salons/${b.salonId}/settings/profile`)
        .set("authorization", ownerB)
        .send({});
      expect((res.body as { code?: string }).code).not.toBe(SALON_SUSPENDED_ERROR);
    });
  });

  describe("entitlement cache", () => {
    it("every admin mutation drops the salon's cached entitlements", async () => {
      const s = await newSalon("Cache");
      await facade.startTrial({ salonId: s.salonId });
      const covered = new Set<string>();
      const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();
      const act = async (route: string, path: string, body: object) => {
        await entitlements.forSalon(s.salonId);
        expect({ route, warm: await cached(s.salonId) }).toEqual({ route, warm: true });
        const res = await post(path, superAdmin, { ...body, reason: REASON });
        expect({ route, status: res.status }).toEqual({ route, status: 200 });
        expect({ route, cached: await cached(s.salonId) }).toEqual({ route, cached: false });
        covered.add(route);
      };
      const base = `salons/${s.salonId}`;

      await act("admin/salons/:salonId/subscription/trial", `${base}/subscription/trial`, {
        trialEndsAt: inDays(20),
      });
      await act("admin/salons/:salonId/subscription/plan", `${base}/subscription/plan`, {
        plan: "pro",
        interval: "month",
        paidUntil: inDays(30),
      });
      await act(
        "admin/salons/:salonId/subscription/paid-until",
        `${base}/subscription/paid-until`,
        {
          paidUntil: inDays(60),
        },
      );
      await act("admin/salons/:salonId/overrides", `${base}/overrides`, {
        key: "ai.agent.enabled",
        value: true,
        expiresAt: inDays(10),
      });
      const o = await prisma.entitlementOverride.findFirstOrThrow({
        where: { salonId: s.salonId },
      });
      await act(
        "admin/salons/:salonId/overrides/:overrideId/revoke",
        `${base}/overrides/${o.id}/revoke`,
        {},
      );
      // The plan assignment auto-granted the flag (launch unset): revoke first, then re-grant.
      await act(
        "admin/salons/:salonId/founding-partner/revoke",
        `${base}/founding-partner/revoke`,
        {},
      );
      await act("admin/salons/:salonId/founding-partner", `${base}/founding-partner`, {});
      await act("admin/salons/:salonId/suspend", `${base}/suspend`, {});
      await act("admin/salons/:salonId/unsuspend", `${base}/unsuspend`, {});

      const mutations = routes
        .filter((r) => r.path.startsWith("admin/salons") && r.method !== "GET")
        .map((r) => r.path);
      expect([...covered].sort(), "add new admin mutations to this test").toEqual(
        [...mutations].sort(),
      );
    });
  });

  describe("step-up (TOTP, ADR-0011)", () => {
    it(`a verified code elevates only this session, for ${String(ADMIN_STEP_UP_MINUTES)} min`, async () => {
      const s = await newSalon("StepUp");
      const adminId = await platformUser("super_admin");
      const secret = await enrolAdminMfa(app, adminId);
      const sessions = app.get(SessionService);
      const issued = await sessions.create(adminId, "native", { ipPrefix: null, userAgent: "t" });
      if (issued.kind !== "native") throw new Error("expected native session");
      const bearer = `Bearer ${issued.tokens.accessToken}`;

      const before = await post(`salons/${s.salonId}/suspend`, bearer, { reason: REASON });
      expect(problemSchema.parse(before.body).code).toBe(ADMIN_ERRORS.stepUpRequired);

      await post("mfa/step-up", bearer, { code: totp(secret, Date.now()) }).expect(200);
      await post(`salons/${s.salonId}/suspend`, bearer, { reason: REASON }).expect(200);

      // Another session of the same admin is not elevated.
      const other = await bearerFor(app, adminId);
      const fromOther = await post(`salons/${s.salonId}/unsuspend`, other, { reason: REASON });
      expect(problemSchema.parse(fromOther.body).code).toBe(ADMIN_ERRORS.stepUpRequired);

      // Rotating native tokens keeps the session (and its elevation); expiry ends it.
      const rotated = await sessions.refresh(issued.tokens.refreshToken, {
        ipPrefix: null,
        userAgent: "t",
      });
      await prisma.session.update({
        where: { id: issued.sessionId },
        data: { stepUpUntil: new Date(Date.now() - 1000) },
      });
      const stale = await post(`salons/${s.salonId}/unsuspend`, `Bearer ${rotated.accessToken}`, {
        reason: REASON,
      });
      expect(problemSchema.parse(stale.body).code).toBe(ADMIN_ERRORS.stepUpRequired);
      expect(await prisma.salon.findUniqueOrThrow({ where: { id: s.salonId } })).toMatchObject({
        status: "suspended",
      });
      expect(await auditCount(s.salonId)).toBe(1);
    });

    it("every admin write needs an enrolled factor, before any change", async () => {
      const s = await newSalon("NoFactor");
      await facade.startTrial({ salonId: s.salonId });
      const plain = await bearerFor(app, await platformUser("super_admin"));
      const res = await post(`salons/${s.salonId}/subscription/trial`, plain, {
        trialEndsAt: new Date(Date.now() + 20 * DAY).toISOString(),
        reason: REASON,
      });
      expect(res.status).toBe(403);
      expect(problemSchema.parse(res.body).code).toBe("admin.mfa_enrollment_required");
      expect(await auditCount(s.salonId)).toBe(0);
      // Reads stay open so the admin can reach the enrolment screen.
      await request(http(app))
        .get(`/api/v1/admin/salons/${s.salonId}`)
        .set("authorization", plain)
        .expect(200);
    });

    it("exactly the high-risk mutations need step-up (ADR-0011); the check runs before any change", async () => {
      // Update STEP_UP_ROUTES together with ADR-0011 when the high-risk set changes.
      const STEP_UP_ROUTES = [
        "admin/salons/:salonId/founding-partner/revoke",
        "admin/salons/:salonId/overrides",
        "admin/salons/:salonId/subscription/plan",
        "admin/salons/:salonId/suspend",
        "admin/salons/:salonId/unsuspend",
      ];
      const s = await newSalon("StepUpScope");
      // Enrolled, but this session never stepped up.
      const adminId = await platformUser("super_admin");
      await enrolAdminMfa(app, adminId);
      const notElevated = await bearerFor(app, adminId);
      clock.offsetMs = 5 * MIN;
      const inDays = (d: number) => new Date(Date.now() + clock.offsetMs + d * DAY).toISOString();
      // Schema-valid bodies; state does not matter because step-up is checked first.
      const bodies: Record<string, object> = {
        "admin/salons/:salonId/subscription/plan": {
          plan: "pro",
          interval: "month",
          paidUntil: inDays(30),
        },
        "admin/salons/:salonId/subscription/trial": { trialEndsAt: inDays(20) },
        "admin/salons/:salonId/subscription/paid-until": { paidUntil: inDays(60) },
        "admin/salons/:salonId/overrides": {
          key: "ai.agent.enabled",
          value: true,
          expiresAt: inDays(5),
        },
      };
      const needsStepUp: string[] = [];
      const mutations = routes.filter(
        (r) => r.path.startsWith("admin/salons") && r.method !== "GET",
      );
      for (const r of mutations) {
        const path = r.path
          .replace("admin/", "")
          .replace(":salonId", s.salonId)
          .replace(":overrideId", PLACEHOLDER_ID);
        const res = await post(path, notElevated, { ...(bodies[r.path] ?? {}), reason: REASON });
        expect({ route: r.path, schemaValid: res.status !== 400 }).toEqual({
          route: r.path,
          schemaValid: true,
        });
        if ((res.body as { code?: string }).code === ADMIN_ERRORS.stepUpRequired) {
          needsStepUp.push(r.path);
        }
      }
      expect(needsStepUp.sort()).toEqual(STEP_UP_ROUTES);
      const audits = await prisma.auditLog.findMany({
        where: { salonId: s.salonId, actorType: "platform_admin" },
        select: { action: true },
      });
      expect(audits.map((a) => a.action)).not.toContain("admin.salon_suspended");
      expect(await prisma.salon.findUniqueOrThrow({ where: { id: s.salonId } })).toMatchObject({
        status: "draft",
      });
    });
  });

  describe("platform roles on salon routes", () => {
    it("support_admin and super_admin get no salon membership: salon routes are 404", async () => {
      const s = await newSalon("NoMembership");
      const support = await bearerFor(app, await platformUser("support_admin"));
      for (const bearer of [support, superAdmin]) {
        const read = await request(http(app))
          .get(`/api/v1/salons/${s.salonId}/entitlements`)
          .set("authorization", bearer);
        expect(read.status).toBe(404);
        const write = await request(http(app))
          .patch(`/api/v1/salons/${s.salonId}/settings/profile`)
          .set("authorization", bearer)
          .send({ name: "Hijacked" });
        expect(write.status).toBe(404);
      }
      expect((await prisma.salon.findUniqueOrThrow({ where: { id: s.salonId } })).name).toBe(
        `${tag} NoMembership`,
      );
    });
  });

  describe("founding partner vs MARKETPLACE_LAUNCH_AT (R-FP3, R-FP4)", () => {
    const assign = (salonId: string, now: Date) =>
      post(`salons/${salonId}/subscription/plan`, superAdmin, {
        plan: "basic",
        interval: "month",
        paidUntil: new Date(now.getTime() + 30 * DAY).toISOString(),
        reason: REASON,
      });
    const flag = (organizationId: string) =>
      prisma.foundingPartner.findUnique({ where: { organizationId } });

    it("activation before a set launch qualifies; waiver end = launch + 24 months", async () => {
      const now = new Date();
      clock.fixed = now;
      const launch = new Date("2027-03-01T00:00:00.000Z");
      expect(launch > now).toBe(true);
      setLaunch(launch);
      const s = await newSalon("FP Before");
      await facade.startTrial({ salonId: s.salonId });
      await assign(s.salonId, now).expect(200);
      expect(await flag(s.organizationId)).toMatchObject({
        source: "paid_before_launch",
        qualifiedAt: now,
      });
      const fp = (await entitlements.forSalon(s.salonId)).foundingPartner;
      expect(FOUNDING_WAIVER_MONTHS).toBe(24);
      expect(fp).toEqual({ since: now.toISOString(), waiverEndsAt: "2029-03-01T00:00:00.000Z" });
    });

    it("activation one millisecond before launch qualifies, at launch it does not", async () => {
      const launch = new Date(Date.now() + 10 * DAY);
      setLaunch(launch);

      const before = await newSalon("FP Edge Before");
      clock.fixed = new Date(launch.getTime() - 1);
      await assign(before.salonId, clock.fixed).expect(200);
      expect((await flag(before.organizationId))?.source).toBe("paid_before_launch");

      const at = await newSalon("FP Edge At");
      clock.fixed = launch;
      await assign(at.salonId, launch).expect(200);
      expect(await flag(at.organizationId)).toBeNull();
      expect((await entitlements.forSalon(at.salonId)).foundingPartner).toBeNull();
    });

    it("activation after launch does not qualify; a manual grant still can", async () => {
      setLaunch(new Date(Date.now() - DAY));
      const s = await newSalon("FP After");
      await assign(s.salonId, new Date()).expect(200);
      expect(await flag(s.organizationId)).toBeNull();
      await post(`salons/${s.salonId}/founding-partner`, superAdmin, { reason: REASON }).expect(
        200,
      );
      expect((await flag(s.organizationId))?.source).toBe("admin_grant");
    });

    it("a trial alone (new or extended) never qualifies", async () => {
      setLaunch(null);
      const s = await newSalon("FP Trial");
      await facade.startTrial({ salonId: s.salonId });
      await post(`salons/${s.salonId}/subscription/trial`, superAdmin, {
        trialEndsAt: new Date(Date.now() + 30 * DAY).toISOString(),
        reason: REASON,
      }).expect(200);
      expect(await flag(s.organizationId)).toBeNull();
      expect((await entitlements.forSalon(s.salonId)).foundingPartner).toBeNull();
    });

    it("the earned flag survives a later plan change (idempotent, first qualification kept)", async () => {
      setLaunch(null);
      const s = await newSalon("FP Keep");
      clock.fixed = new Date();
      const first = clock.fixed;
      await assign(s.salonId, first).expect(200);
      const row = await flag(s.organizationId);
      clock.fixed = new Date(first.getTime() + 2 * DAY);
      await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "ultra",
        interval: "year",
        paidUntil: new Date(first.getTime() + 300 * DAY).toISOString(),
        reason: REASON,
      }).expect(200);
      expect(await flag(s.organizationId)).toEqual(row);
    });
  });

  describe("override expiry", () => {
    it("an override stops applying at its expiry and can no longer be revoked", async () => {
      const s = await newSalon("OverrideExpiry");
      await facade.startTrial({ salonId: s.salonId });
      const cap = (await entitlements.forSalon(s.salonId)).entitlements["ai.monthly_cost_cap_vnd"];
      if (typeof cap !== "number") throw new Error(`expected a numeric trial cap, got ${cap}`);
      const base = cap;
      const expiresAt = new Date(Date.now() + 2 * DAY);
      await post(`salons/${s.salonId}/overrides`, superAdmin, {
        key: "ai.monthly_cost_cap_vnd",
        value: base + 50_000,
        expiresAt: expiresAt.toISOString(),
        reason: REASON,
      }).expect(200);
      const o = await prisma.entitlementOverride.findFirstOrThrow({
        where: { salonId: s.salonId },
      });

      clock.fixed = new Date(expiresAt.getTime() - 1);
      await entitlements.invalidate(s.salonId);
      expect((await entitlements.forSalon(s.salonId)).entitlements["ai.monthly_cost_cap_vnd"]).toBe(
        base + 50_000,
      );

      clock.fixed = expiresAt;
      // Read from the database (the 60 s cache does not know the override's expiry).
      await entitlements.invalidate(s.salonId);
      expect((await entitlements.forSalon(s.salonId)).entitlements["ai.monthly_cost_cap_vnd"]).toBe(
        base,
      );

      const revoke = await post(`salons/${s.salonId}/overrides/${o.id}/revoke`, superAdmin, {
        reason: REASON,
      });
      expect(revoke.status).toBe(409);
      expect(problemSchema.parse(revoke.body).code).toBe(ADMIN_ERRORS.overrideNotActive);
      expect(
        await prisma.auditLog.count({
          where: { salonId: s.salonId, action: "admin.entitlement_override_revoked" },
        }),
      ).toBe(0);
    });
  });
});
