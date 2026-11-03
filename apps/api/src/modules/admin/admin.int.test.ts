// Platform admin (topic 12 M12.6) against the local stack, on TEST_DATABASE_URL only (the vitest
// integration config refuses anything else). Covers: generated role matrix (salon members and
// anonymous callers never reach /admin/*), "no mutation without a reason and an audit row",
// subscription operations, overrides, founding partners, suspension + step-up, directory, usage.
import type { INestApplication } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_ERRORS,
  adminMutationResultSchema,
  adminSalonDetailSchema,
  adminSalonListSchema,
  adminUsageOverviewSchema,
  problemSchema,
  SALON_SUSPENDED_ERROR,
} from "@gugu/contracts";
import { PLATFORM_ROLE_PERMISSIONS, type PlatformRole } from "@gugu/domain";
import {
  addSalonMember,
  bearerFor,
  createSalonFixture,
  type SalonFixture,
  steppedUpBearerFor,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { aiCostMonth } from "../ai-import/ai-import.facade";
import { AuditService } from "../audit/audit.facade";
import { listRoutes, type RouteInfo } from "../authorization/authorization.facade";
import {
  Clock,
  EntitlementService,
  SubscriptionsFacade,
} from "../subscriptions/subscriptions.facade";

const DAY = 86_400_000;

class MovableClock extends Clock {
  offsetMs = 0;
  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

const REASON = "Invoice 2026-11 paid by bank transfer";

describe("platform admin (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let entitlements: EntitlementService;
  let facade: SubscriptionsFacade;
  const clock = new MovableClock();
  const tag = `adm${Date.now().toString(36)}`;
  const fixtures: SalonFixture[] = [];
  let superAdmin: string;
  /** Same super admin, enrolled but on a session that never stepped up. */
  let superAdminNotElevated: string;
  let supportAdmin: string;
  let superAdminId: string;
  let adminRoutes: RouteInfo[];

  const newSalon = async (name = "Salon") => {
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
    return { id: user.id, bearer: await steppedUpBearerFor(app, user.id) };
  };
  const auditCount = (salonId: string) =>
    prisma.auditLog.count({ where: { salonId, actorType: "platform_admin" } });
  const post = (path: string, bearer: string, body: object) =>
    request(http(app)).post(`/api/v1/admin/${path}`).set("authorization", bearer).send(body);

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
    await clearRateLimits(app);
    const sa = await platformUser("super_admin");
    superAdmin = sa.bearer;
    superAdminId = sa.id;
    superAdminNotElevated = await bearerFor(app, sa.id);
    supportAdmin = (await platformUser("support_admin")).bearer;
    adminRoutes = listRoutes(
      app.get(DiscoveryService),
      app.get(MetadataScanner),
      app.get(Reflector),
    ).filter((r) => r.path.startsWith("admin"));
  });

  beforeEach(() => {
    clock.offsetMs = 0;
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

  /** A valid body (with reason) for every admin mutation route; the matrix strips the reason. */
  function validBody(route: RouteInfo, overrideId: string): { path: string; body: object } {
    const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();
    const bodies: Record<string, object> = {
      "admin/salons/:salonId/subscription/plan": {
        plan: "pro",
        interval: "month",
        paidUntil: inDays(30),
      },
      "admin/salons/:salonId/subscription/trial": { trialEndsAt: inDays(20) },
      "admin/salons/:salonId/subscription/paid-until": { paidUntil: inDays(60) },
      "admin/salons/:salonId/suspend": {},
      "admin/salons/:salonId/unsuspend": {},
      "admin/salons/:salonId/overrides": {
        key: "ai.agent.enabled",
        value: true,
        expiresAt: inDays(10),
      },
      "admin/salons/:salonId/overrides/:overrideId/revoke": {},
      "admin/salons/:salonId/founding-partner": {},
      "admin/salons/:salonId/founding-partner/revoke": {},
      "admin/mfa/totp/enrol": {},
      "admin/mfa/totp/confirm": { code: "123456" },
      "admin/mfa/step-up": { code: "123456" },
      "admin/mfa/recovery-codes": { code: "123456" },
      "admin/team/:userId/mfa/reset": {},
    };
    const body = bodies[route.path];
    if (!body) throw new Error(`add a valid body for ${route.method} ${route.path}`);
    return {
      path: route.path.replace(":overrideId", overrideId).replace(":userId", overrideId),
      body,
    };
  }

  describe("authorization matrix (default deny)", () => {
    it("every /admin route is a platform route", () => {
      expect(adminRoutes.length).toBeGreaterThanOrEqual(12);
      for (const r of adminRoutes) expect(r.policy?.kind, `${r.method} ${r.path}`).toBe("platform");
    });

    it("anonymous → 401, every salon role (even on its own salon) → 403, no audit row", async () => {
      const own = await newSalon("Matrix");
      const members = {
        owner: await bearerFor(app, own.ownerUserId),
        manager: await bearerFor(app, await addSalonMember(prisma, own.salonId, "manager")),
        receptionist: await bearerFor(
          app,
          await addSalonMember(prisma, own.salonId, "receptionist"),
        ),
        staff: await bearerFor(app, await addSalonMember(prisma, own.salonId, "staff")),
      };
      const id = "0190f000-0000-7000-8000-0000000000aa";
      for (const route of adminRoutes) {
        const { path, body } =
          route.method === "GET" ? { path: route.path, body: {} } : validBody(route, id);
        const url = `/api/v1/${path.replace(":salonId", own.salonId)}`;
        const method = route.method.toLowerCase() as "get" | "post";
        const call = () =>
          method === "get" ? request(http(app)).get(url) : request(http(app)).post(url);
        const anon = await call().send({ ...body, reason: REASON });
        expect({ route: route.path, status: anon.status }).toEqual({
          route: route.path,
          status: 401,
        });
        for (const [role, bearer] of Object.entries(members)) {
          const res = await call()
            .set("authorization", bearer)
            .send({ ...body, reason: REASON });
          expect({ route: route.path, role, status: res.status }).toEqual({
            route: route.path,
            role,
            status: 403,
          });
          expect(problemSchema.parse(res.body).code).toBe("common.forbidden");
        }
      }
      expect(await auditCount(own.salonId)).toBe(0);
      const sub = await prisma.subscription.count({ where: { salonId: own.salonId } });
      expect(sub).toBe(0);
    });

    it("support_admin reads but cannot change anything commercial (R-AD4)", async () => {
      const s = await newSalon("Support");
      const support = PLATFORM_ROLE_PERMISSIONS.support_admin;
      // `admin/mfa/*` is self-service for every platform role (admin-mfa.int.test.ts).
      for (const route of adminRoutes.filter((r) => r.path.startsWith("admin/salons"))) {
        if (route.policy?.kind !== "platform") continue;
        const allowed = support.has(route.policy.permission);
        if (route.method === "GET") {
          const res = await request(http(app))
            .get(`/api/v1/${route.path.replace(":salonId", s.salonId)}`)
            .set("authorization", supportAdmin);
          expect({ route: route.path, ok: res.status < 400 }).toEqual({
            route: route.path,
            ok: allowed,
          });
        } else {
          expect({ route: route.path, allowed }).toEqual({ route: route.path, allowed: false });
          const { path, body } = validBody(route, "0190f000-0000-7000-8000-0000000000aa");
          const res = await post(
            path.replace("admin/", "").replace(":salonId", s.salonId),
            supportAdmin,
            {
              ...body,
              reason: REASON,
            },
          );
          expect({ route: route.path, status: res.status }).toEqual({
            route: route.path,
            status: 403,
          });
        }
      }
      expect(await auditCount(s.salonId)).toBe(0);
    });

    it("platform admins cannot mutate without a reason: 400 and no audit row, no change", async () => {
      const s = await newSalon("NoReason");
      await facade.startTrial({ salonId: s.salonId });
      const before = await prisma.subscription.findFirstOrThrow({ where: { salonId: s.salonId } });
      const mutations = adminRoutes.filter(
        (r) => r.method !== "GET" && r.path.startsWith("admin/salons"),
      );
      expect(mutations.length).toBeGreaterThanOrEqual(9);
      for (const route of mutations) {
        const { path, body } = validBody(route, "0190f000-0000-7000-8000-0000000000aa");
        const target = path.replace("admin/", "").replace(":salonId", s.salonId);
        for (const reason of [undefined, "", "  ", "x"]) {
          const res = await post(
            target,
            superAdmin,
            reason === undefined ? body : { ...body, reason },
          );
          expect({ route: route.path, reason, status: res.status }).toEqual({
            route: route.path,
            reason,
            status: 400,
          });
          expect(problemSchema.parse(res.body).code).toBe("common.validation_failed");
        }
      }
      expect(await auditCount(s.salonId)).toBe(0);
      const after = await prisma.subscription.findFirstOrThrow({ where: { salonId: s.salonId } });
      expect(after).toEqual(before);
      expect(await prisma.salon.findUniqueOrThrow({ where: { id: s.salonId } })).toMatchObject({
        status: "draft",
      });
    });

    it("the change rolls back when the audit row cannot be written", async () => {
      const s = await newSalon("AuditFail");
      await facade.startTrial({ salonId: s.salonId });
      const spy = vi
        .spyOn(app.get(AuditService), "record")
        .mockRejectedValueOnce(new Error("audit down"));
      const res = await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "ultra",
        interval: "year",
        paidUntil: new Date(Date.now() + 365 * DAY).toISOString(),
        reason: REASON,
      });
      spy.mockRestore();
      expect(res.status).toBe(500);
      const sub = await prisma.subscription.findFirstOrThrow({
        where: { salonId: s.salonId },
        include: { plan: true },
      });
      expect(sub.plan.code).toBe("trial");
      expect(sub.status).toBe("trialing");
      expect(await auditCount(s.salonId)).toBe(0);
    });

    it("unknown salon → 404", async () => {
      const res = await post(
        "salons/0190f000-0000-7000-8000-0000000000ff/founding-partner",
        superAdmin,
        {
          reason: REASON,
        },
      );
      expect(res.status).toBe(404);
      const get = await request(http(app))
        .get("/api/v1/admin/salons/0190f000-0000-7000-8000-0000000000ff")
        .set("authorization", superAdmin);
      expect(get.status).toBe(404);
    });
  });

  describe("subscriptions (manual billing)", () => {
    it("assigns a paid plan to a trial: active, audited with before/after, cache invalidated, founding partner", async () => {
      const s = await newSalon("Assign");
      await facade.startTrial({ salonId: s.salonId });
      // Warm the cache with trial entitlements.
      expect((await entitlements.forSalon(s.salonId)).plan).toBe("trial");
      const paidUntil = new Date(Date.now() + 31 * DAY).toISOString();
      const res = await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "ultra",
        interval: "month",
        paidUntil,
        invoicingEntity: "pl",
        reason: REASON,
      }).expect(200);
      const { auditId } = adminMutationResultSchema.parse(res.body);

      const ents = await entitlements.forSalon(s.salonId);
      expect(ents.plan).toBe("ultra");
      expect(ents.status).toBe("active");
      expect(ents.entitlements["ai.monthly_cost_cap_vnd"]).toBe(600_000);
      expect(ents.foundingPartner?.since).toBeTruthy();

      const audit = await prisma.auditLog.findUniqueOrThrow({ where: { id: auditId } });
      expect(audit).toMatchObject({
        action: "admin.subscription_plan_assigned",
        actorType: "platform_admin",
        actorId: superAdminId,
        salonId: s.salonId,
        organizationId: s.organizationId,
        targetType: "subscription",
      });
      expect(audit.metadata).toMatchObject({
        reason: REASON,
        platformRole: "super_admin",
        before: { plan: "trial", status: "trialing", paidUntil: expect.any(String) as string },
        after: {
          plan: "ultra",
          status: "active",
          paidUntil,
          invoicingEntity: "pl",
          trialEndsAt: null,
        },
      });
      const event = await prisma.subscriptionEvent.findFirstOrThrow({
        where: { salonId: s.salonId, toStatus: "active" },
      });
      expect(event).toMatchObject({
        fromStatus: "trialing",
        fromPlanCode: "trial",
        toPlanCode: "ultra",
        actor: `admin:${superAdminId}`,
        reason: REASON,
      });
      const fp = await prisma.foundingPartner.findUniqueOrThrow({
        where: { organizationId: s.organizationId },
      });
      expect(fp).toMatchObject({
        source: "paid_before_launch",
        qualifyingSubscriptionId: event.subscriptionId,
      });

      // Downgrade keeps the same current row and the flag; one current subscription only.
      await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "basic",
        interval: "year",
        paidUntil: new Date(Date.now() + 365 * DAY).toISOString(),
        reason: "Downgrade requested by owner",
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).entitlements["ai.agent.enabled"]).toBe(false);
      expect(
        await prisma.subscription.count({ where: { salonId: s.salonId, status: "active" } }),
      ).toBe(1);
    });

    it("rejects a paid-until in the past and a non-paid plan", async () => {
      const s = await newSalon("BadPlan");
      const past = await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "pro",
        interval: "month",
        paidUntil: new Date(Date.now() - DAY).toISOString(),
        reason: REASON,
      });
      expect(past.status).toBe(400);
      expect(problemSchema.parse(past.body).code).toBe(ADMIN_ERRORS.invalidDate);
      const trial = await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "trial",
        interval: "month",
        paidUntil: new Date(Date.now() + DAY).toISOString(),
        reason: REASON,
      });
      expect(trial.status).toBe(400);
      expect(await auditCount(s.salonId)).toBe(0);
    });

    it("extends a trial, re-opens an expired one, refuses a paid salon", async () => {
      const s = await newSalon("Trial");
      await facade.startTrial({ salonId: s.salonId });
      const newEnd = new Date(Date.now() + 30 * DAY).toISOString();
      await post(`salons/${s.salonId}/subscription/trial`, superAdmin, {
        trialEndsAt: newEnd,
        reason: "Pilot salon, extra onboarding time",
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).trialEndsAt).toBe(newEnd);

      const tooFar = await post(`salons/${s.salonId}/subscription/trial`, superAdmin, {
        trialEndsAt: new Date(Date.now() + 91 * DAY).toISOString(),
        reason: REASON,
      });
      expect(problemSchema.parse(tooFar.body).code).toBe(ADMIN_ERRORS.invalidDate);

      // Expire it (clock past the end, then the job records it), then re-open.
      clock.offsetMs = 31 * DAY;
      await facade.expireDueTrials();
      clock.offsetMs = 0;
      const reopenedEnd = new Date(Date.now() + 7 * DAY).toISOString();
      await post(`salons/${s.salonId}/subscription/trial`, superAdmin, {
        trialEndsAt: reopenedEnd,
        reason: "Re-open trial after demo call",
      }).expect(200);
      const ents = await entitlements.forSalon(s.salonId);
      expect(ents).toMatchObject({ plan: "trial", status: "trialing", trialEndsAt: reopenedEnd });

      const paid = await newSalon("TrialPaid");
      await post(`salons/${paid.salonId}/subscription/plan`, superAdmin, {
        plan: "pro",
        interval: "month",
        paidUntil: new Date(Date.now() + 30 * DAY).toISOString(),
        reason: REASON,
      }).expect(200);
      const refused = await post(`salons/${paid.salonId}/subscription/trial`, superAdmin, {
        trialEndsAt: newEnd,
        reason: REASON,
      });
      expect(refused.status).toBe(409);
      expect(problemSchema.parse(refused.body).code).toBe(ADMIN_ERRORS.trialNotExtendable);
    });

    it("sets paid-until; past_due becomes active again; trial has nothing to pay", async () => {
      const s = await newSalon("PaidUntil");
      await facade.startTrial({ salonId: s.salonId });
      const onTrial = await post(`salons/${s.salonId}/subscription/paid-until`, superAdmin, {
        paidUntil: new Date(Date.now() + 30 * DAY).toISOString(),
        reason: REASON,
      });
      expect(problemSchema.parse(onTrial.body).code).toBe(ADMIN_ERRORS.noCurrentSubscription);

      await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "pro",
        interval: "month",
        paidUntil: new Date(Date.now() + 2 * DAY).toISOString(),
        reason: REASON,
      }).expect(200);
      const sub = await prisma.subscription.findFirstOrThrow({
        where: { salonId: s.salonId, status: "active" },
      });
      await facade.transition({
        salonId: s.salonId,
        subscriptionId: sub.id,
        to: "past_due",
        reason: "invoice_overdue",
      });
      const until = new Date(Date.now() + 60 * DAY).toISOString();
      await post(`salons/${s.salonId}/subscription/paid-until`, superAdmin, {
        paidUntil: until,
        reason: "Late payment received",
      }).expect(200);
      const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(after.status).toBe("active");
      expect(after.currentPeriodEnd?.toISOString()).toBe(until);
    });
  });

  describe("entitlement overrides", () => {
    it("grants with an expiry, takes effect at once, revokes, validates value and expiry", async () => {
      const s = await newSalon("Override");
      await facade.startTrial({ salonId: s.salonId });
      expect((await entitlements.forSalon(s.salonId)).entitlements["ai.monthly_cost_cap_vnd"]).toBe(
        20_000,
      );
      const expiresAt = new Date(Date.now() + 14 * DAY).toISOString();
      const res = await post(`salons/${s.salonId}/overrides`, superAdmin, {
        key: "ai.monthly_cost_cap_vnd",
        value: 100_000,
        expiresAt,
        reason: "Pilot: heavier AI import",
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).entitlements["ai.monthly_cost_cap_vnd"]).toBe(
        100_000,
      );
      const audit = await prisma.auditLog.findUniqueOrThrow({
        where: { id: adminMutationResultSchema.parse(res.body).auditId },
      });
      expect(audit.metadata).toMatchObject({
        before: null,
        after: { key: "ai.monthly_cost_cap_vnd", value: 100_000, expiresAt },
      });
      const override = await prisma.entitlementOverride.findFirstOrThrow({
        where: { salonId: s.salonId },
      });
      expect(override.createdBy).toBe(`admin:${superAdminId}`);

      const wrongType = await post(`salons/${s.salonId}/overrides`, superAdmin, {
        key: "zalo.inbox",
        value: 5,
        expiresAt,
        reason: REASON,
      });
      expect(problemSchema.parse(wrongType.body).code).toBe(ADMIN_ERRORS.invalidOverrideValue);
      const noExpiry = await post(`salons/${s.salonId}/overrides`, superAdmin, {
        key: "zalo.inbox",
        value: true,
        reason: REASON,
      });
      expect(noExpiry.status).toBe(400);
      const tooLong = await post(`salons/${s.salonId}/overrides`, superAdmin, {
        key: "zalo.inbox",
        value: true,
        expiresAt: new Date(Date.now() + 400 * DAY).toISOString(),
        reason: REASON,
      });
      expect(problemSchema.parse(tooLong.body).code).toBe(ADMIN_ERRORS.invalidDate);

      await post(`salons/${s.salonId}/overrides/${override.id}/revoke`, superAdmin, {
        reason: "Pilot ended",
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).entitlements["ai.monthly_cost_cap_vnd"]).toBe(
        20_000,
      );
      const again = await post(`salons/${s.salonId}/overrides/${override.id}/revoke`, superAdmin, {
        reason: "Pilot ended",
      });
      expect(problemSchema.parse(again.body).code).toBe(ADMIN_ERRORS.overrideNotActive);

      // Another salon's override id is not found through this salon.
      const other = await newSalon("OverrideOther");
      const cross = await post(
        `salons/${other.salonId}/overrides/${override.id}/revoke`,
        superAdmin,
        {
          reason: REASON,
        },
      );
      expect(cross.status).toBe(404);
    });
  });

  describe("suspension and founding partners (step-up)", () => {
    it("refuses a stale session, suspends (read-only, nothing granted), unsuspends", async () => {
      const s = await newSalon("Suspend");
      await facade.startTrial({ salonId: s.salonId });
      const owner = await bearerFor(app, s.ownerUserId);

      // No step-up on this session (TOTP, ADR-0011).
      const stale = await post(`salons/${s.salonId}/suspend`, superAdminNotElevated, {
        reason: "Fraud report",
      });
      expect(stale.status).toBe(403);
      expect(problemSchema.parse(stale.body).code).toBe(ADMIN_ERRORS.stepUpRequired);
      expect(await auditCount(s.salonId)).toBe(0);

      await post(`salons/${s.salonId}/suspend`, superAdmin, { reason: "Fraud report" }).expect(200);
      const ents = await entitlements.forSalon(s.salonId);
      expect(ents.suspended).toBe(true);
      expect(ents.entitlements["crm.core"]).toBe(false);
      expect(ents.entitlements["ai.monthly_cost_cap_vnd"]).toBe(0);

      // Members can still read, but every write is refused.
      await request(http(app))
        .get(`/api/v1/salons/${s.salonId}/entitlements`)
        .set("authorization", owner)
        .expect(200);
      const write = await request(http(app))
        .patch(`/api/v1/salons/${s.salonId}/settings/profile`)
        .set("authorization", owner)
        .send({});
      expect(write.status).toBe(403);
      expect(problemSchema.parse(write.body).code).toBe(SALON_SUSPENDED_ERROR);

      const twice = await post(`salons/${s.salonId}/suspend`, superAdmin, {
        reason: "Fraud report",
      });
      expect(problemSchema.parse(twice.body).code).toBe(ADMIN_ERRORS.alreadySuspended);

      await post(`salons/${s.salonId}/unsuspend`, superAdmin, {
        reason: "Cleared after review",
      }).expect(200);
      const salon = await prisma.salon.findUniqueOrThrow({ where: { id: s.salonId } });
      expect(salon).toMatchObject({
        status: "draft",
        suspendedAt: null,
        preSuspensionStatus: null,
      });
      expect((await entitlements.forSalon(s.salonId)).entitlements["crm.core"]).toBe(true);
      const actions = await prisma.auditLog.findMany({
        where: { salonId: s.salonId, actorType: "platform_admin" },
        orderBy: { createdAt: "asc" },
        select: { action: true, metadata: true },
      });
      expect(actions.map((a) => a.action)).toEqual([
        "admin.salon_suspended",
        "admin.salon_unsuspended",
      ]);
      expect(actions[0]?.metadata).toMatchObject({
        reason: "Fraud report",
        before: { status: "draft" },
        after: { status: "suspended" },
      });
    });

    it("grants and revokes the founding-partner flag (revoke needs step-up)", async () => {
      const s = await newSalon("Founding");
      await post(`salons/${s.salonId}/founding-partner`, superAdmin, {
        reason: "Signed letter of intent before launch",
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).foundingPartner).not.toBeNull();
      const dup = await post(`salons/${s.salonId}/founding-partner`, superAdmin, {
        reason: REASON,
      });
      expect(problemSchema.parse(dup.body).code).toBe(ADMIN_ERRORS.foundingPartnerExists);

      const stale = await post(
        `salons/${s.salonId}/founding-partner/revoke`,
        superAdminNotElevated,
        { reason: "Granted by mistake" },
      );
      expect(problemSchema.parse(stale.body).code).toBe(ADMIN_ERRORS.stepUpRequired);
      await post(`salons/${s.salonId}/founding-partner/revoke`, superAdmin, {
        reason: "Granted by mistake",
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).foundingPartner).toBeNull();

      // A revoked flag is not re-set automatically by a later paid activation.
      await post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
        plan: "pro",
        interval: "month",
        paidUntil: new Date(Date.now() + 30 * DAY).toISOString(),
        reason: REASON,
      }).expect(200);
      expect((await entitlements.forSalon(s.salonId)).foundingPartner).toBeNull();
    });
  });

  describe("directory and usage", () => {
    it("lists with search, filters and sorting; detail parses", async () => {
      const trial = await newSalon("Dir Trial");
      await facade.startTrial({ salonId: trial.salonId });
      const paid = await newSalon("Dir Paid");
      await post(`salons/${paid.salonId}/subscription/plan`, superAdmin, {
        plan: "pro",
        interval: "month",
        paidUntil: new Date(Date.now() + 30 * DAY).toISOString(),
        reason: REASON,
      }).expect(200);
      const none = await newSalon("Dir None");

      const list = async (qs: string, bearer = superAdmin) =>
        adminSalonListSchema.parse(
          (
            await request(http(app))
              .get(`/api/v1/admin/salons?q=${encodeURIComponent(`${tag} Dir`)}&${qs}`)
              .set("authorization", bearer)
              .expect(200)
          ).body,
        );
      expect((await list("")).total).toBe(3);
      expect((await list("plan=pro")).items.map((i) => i.id)).toEqual([paid.salonId]);
      expect((await list("plan=none")).items.map((i) => i.id)).toEqual([none.salonId]);
      expect(
        (await list("subscriptionStatus=trialing&trialEndsWithinDays=14")).items.map((i) => i.id),
      ).toEqual([trial.salonId]);
      expect((await list("trialEndsWithinDays=7")).items).toHaveLength(0);
      expect((await list("foundingPartner=true")).items.map((i) => i.id)).toEqual([paid.salonId]);
      expect((await list("zaloConnected=false")).total).toBe(3);
      expect((await list("sort=name_asc")).items.map((i) => i.name)).toEqual([
        `${tag} Dir None`,
        `${tag} Dir Paid`,
        `${tag} Dir Trial`,
      ]);
      const page1 = await list("limit=2&sort=created_asc");
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();
      const page2 = await list(`limit=2&sort=created_asc&cursor=${page1.nextCursor ?? ""}`);
      expect(page2.items.map((i) => i.id)).toEqual([none.salonId]);
      expect(page2.nextCursor).toBeNull();
      // Support can read the directory too.
      expect((await list("", supportAdmin)).total).toBe(3);
      const bad = await request(http(app))
        .get("/api/v1/admin/salons?cursor=nope")
        .set("authorization", superAdmin);
      expect(bad.status).toBe(400);

      const detail = adminSalonDetailSchema.parse(
        (
          await request(http(app))
            .get(`/api/v1/admin/salons/${paid.salonId}`)
            .set("authorization", supportAdmin)
            .expect(200)
        ).body,
      );
      expect(detail.subscription).toMatchObject({ plan: "pro", status: "active" });
      expect(detail.members).toHaveLength(1);
      expect(detail.members[0]?.role).toBe("owner");
      expect(detail.foundingPartner?.source).toBe("paid_before_launch");
      expect(detail.recentAudit[0]?.action).toBe("admin.subscription_plan_assigned");
      expect(detail.subscriptionHistory[0]).toMatchObject({ toStatus: "active", toPlan: "pro" });
      expect(detail.usage).toMatchObject({ aiCapVnd: 250_000, zaloTemplateLimit: 300 });
    });

    it("usage overview: AI cost against the cap from the meter, trials ending in 7 days", async () => {
      const hot = await newSalon("Usage Hot");
      await facade.startTrial({ salonId: hot.salonId }); // trial ends in 14 days
      const soon = await newSalon("Usage Soon");
      await facade.startTrial({ salonId: soon.salonId });
      await post(`salons/${soon.salonId}/subscription/trial`, superAdmin, {
        trialEndsAt: new Date(Date.now() + 3 * DAY).toISOString(),
        reason: "Shorter pilot",
      }).expect(200);
      const month = aiCostMonth(new Date());
      const redis = app.get(RedisService).client;
      await redis.set(`ai:cost:v1:${hot.salonId}:${month}`, "18000", "EX", 3600);

      const body = adminUsageOverviewSchema.parse(
        (
          await request(http(app))
            .get("/api/v1/admin/usage?limit=100")
            .set("authorization", supportAdmin)
            .expect(200)
        ).body,
      );
      expect(body.month).toBe(month);
      const row = body.items.find((i) => i.salonId === hot.salonId);
      expect(row).toMatchObject({ aiCostVnd: 18_000, aiCapVnd: 20_000, plan: "trial" });
      expect(row?.aiCapShare).toBeCloseTo(0.9);
      expect(body.totals.nearAiCap).toBeGreaterThanOrEqual(1);
      expect(body.trialsEndingSoon.map((t) => t.salonId)).toContain(soon.salonId);
      expect(body.trialsEndingSoon.map((t) => t.salonId)).not.toContain(hot.salonId);

      const old = await request(http(app))
        .get("/api/v1/admin/usage?month=2020-01")
        .set("authorization", superAdmin);
      expect(problemSchema.parse(old.body).code).toBe(ADMIN_ERRORS.usageMonthUnavailable);
    });
  });

  describe("races", () => {
    it("parallel plan assignments: one current subscription, one audit row per success", async () => {
      const s = await newSalon("Race Plan");
      const paidUntil = new Date(Date.now() + 30 * DAY).toISOString();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          post(`salons/${s.salonId}/subscription/plan`, superAdmin, {
            plan: i % 2 ? "pro" : "ultra",
            interval: "month",
            paidUntil,
            reason: `Parallel assignment ${String(i)}`,
          }),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.every((st) => st === 200 || st === 409)).toBe(true);
      const ok = statuses.filter((st) => st === 200).length;
      expect(ok).toBeGreaterThanOrEqual(1);
      expect(
        await prisma.subscription.count({
          where: { salonId: s.salonId, status: { in: ["trialing", "active", "past_due"] } },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { salonId: s.salonId, action: "admin.subscription_plan_assigned" },
        }),
      ).toBe(ok);
    });

    it("parallel revokes of one override: exactly one succeeds and is audited", async () => {
      const s = await newSalon("Race Revoke");
      await facade.startTrial({ salonId: s.salonId });
      await post(`salons/${s.salonId}/overrides`, superAdmin, {
        key: "analytics.advanced",
        value: true,
        expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
        reason: "Pilot of advanced analytics",
      }).expect(200);
      const o = await prisma.entitlementOverride.findFirstOrThrow({
        where: { salonId: s.salonId },
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          post(`salons/${s.salonId}/overrides/${o.id}/revoke`, superAdmin, {
            reason: "Pilot ended",
          }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(
        await prisma.auditLog.count({
          where: { salonId: s.salonId, action: "admin.entitlement_override_revoked" },
        }),
      ).toBe(1);
    });
  });
});
