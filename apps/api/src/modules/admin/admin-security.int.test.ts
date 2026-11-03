// Platform admin security follow-ups (review of f5bb010): suspension reaches invitations (manage
// links: bookings/bookings-suspension.int.test.ts), founding-partner races and org-wide cache, step-up on
// overrides, audit metadata allowlist, removed members' emails. TEST_DATABASE_URL only.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_ERRORS,
  adminSalonDetailSchema,
  problemSchema,
  SALON_SUSPENDED_ERROR,
} from "@gugu/contracts";
import {
  bearerFor,
  createSalonFixture,
  steppedUpBearerFor,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { Clock, EntitlementService } from "../subscriptions/subscriptions.facade";

const DAY = 86_400_000;

class MovableClock extends Clock {
  offsetMs = 0;
  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

describe("platform admin security follow-ups (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let entitlements: EntitlementService;
  let admin: string;
  let adminNotElevated: string;
  const clock = new MovableClock();

  const post = (path: string, body: object, bearer = admin) =>
    request(http(app)).post(`/api/v1/${path}`).set("authorization", bearer).send(body);
  const suspend = (salonId: string) =>
    post(`admin/salons/${salonId}/suspend`, { reason: "Security review test" }).expect(200);

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
    const user = await prisma.user.create({
      data: {
        email: testEmail("sec-admin"),
        emailVerifiedAt: new Date(),
        platformRole: "super_admin",
        profile: { create: {} },
      },
    });
    admin = await steppedUpBearerFor(app, user.id, 60);
    adminNotElevated = await bearerFor(app, user.id);
  });

  beforeEach(async () => {
    clock.offsetMs = 0;
    await clearRateLimits(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("L1: an invitation cannot be accepted into a suspended salon", async () => {
    const s = await createSalonFixture(prisma, "Sec Invite");
    const owner = await bearerFor(app, s.ownerUserId);
    // Seats come from the plan (`staff.max_seats`): give the salon a trial first.
    await post(`admin/salons/${s.salonId}/subscription/trial`, {
      trialEndsAt: new Date(Date.now() + 10 * DAY).toISOString(),
      reason: "Trial for invitation test",
    }).expect(200);
    const created = await post(`salons/${s.salonId}/invitations`, { role: "staff" }, owner).expect(
      201,
    );
    const token =
      new URL((created.body as { acceptUrl: string }).acceptUrl).searchParams.get("token") ?? "";
    await suspend(s.salonId);
    const invitee = await prisma.user.create({
      data: { email: testEmail("invitee"), emailVerifiedAt: new Date(), profile: { create: {} } },
    });
    const res = await post("invitations/accept", { token }, await bearerFor(app, invitee.id));
    expect(res.status).toBe(403);
    expect(problemSchema.parse(res.body).code).toBe(SALON_SUSPENDED_ERROR);
    expect(
      await prisma.salonMember.count({ where: { salonId: s.salonId, userId: invitee.id } }),
    ).toBe(0);
    const inv = await prisma.salonInvitation.findFirstOrThrow({ where: { salonId: s.salonId } });
    expect(inv.acceptedAt).toBeNull();
  });

  it("L2: parallel founding-partner grants and revokes: one success each, one audit row each", async () => {
    const s = await createSalonFixture(prisma, "Sec Founding Race");
    const grants = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(`admin/salons/${s.salonId}/founding-partner`, { reason: "Parallel grant" }),
      ),
    );
    expect(grants.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of grants.filter((x) => x.status !== 200)) {
      expect(problemSchema.parse(r.body).code).toBe(ADMIN_ERRORS.foundingPartnerExists);
    }
    const revokes = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(`admin/salons/${s.salonId}/founding-partner/revoke`, { reason: "Parallel revoke" }),
      ),
    );
    expect(revokes.filter((r) => r.status === 200)).toHaveLength(1);
    for (const r of revokes.filter((x) => x.status !== 200)) {
      expect(problemSchema.parse(r.body).code).toBe(ADMIN_ERRORS.foundingPartnerMissing);
    }
    const counts = await prisma.auditLog.groupBy({
      by: ["action"],
      where: { salonId: s.salonId, action: { startsWith: "admin.founding_partner" } },
      _count: { _all: true },
    });
    expect(Object.fromEntries(counts.map((c) => [c.action, c._count._all]))).toEqual({
      "admin.founding_partner_granted": 1,
      "admin.founding_partner_revoked": 1,
    });
  });

  it("L3: a founding-partner change clears the cache of every salon in the organisation", async () => {
    const a = await createSalonFixture(prisma, "Sec Org A");
    const sibling = await prisma.salon.create({
      data: {
        organizationId: a.organizationId,
        slug: `sec-org-b-${randomUUID().slice(0, 8)}`,
        name: "Sec Org B",
        ownerUserId: a.ownerUserId,
        members: { create: { userId: a.ownerUserId, role: "owner" } },
      },
    });
    // Warm both caches (a subscription is needed for the read model to be cached).
    for (const salonId of [a.salonId, sibling.id]) {
      await post(`admin/salons/${salonId}/subscription/trial`, {
        trialEndsAt: new Date(Date.now() + 10 * DAY).toISOString(),
        reason: "Trial for cache test",
      }).expect(200);
      expect((await entitlements.forSalon(salonId)).foundingPartner).toBeNull();
    }
    await post(`admin/salons/${a.salonId}/founding-partner`, { reason: "Org-wide grant" }).expect(
      200,
    );
    expect((await entitlements.forSalon(sibling.id)).foundingPartner).not.toBeNull();
    await post(`admin/salons/${a.salonId}/founding-partner/revoke`, {
      reason: "Org-wide revoke",
    }).expect(200);
    expect((await entitlements.forSalon(sibling.id)).foundingPartner).toBeNull();
  });

  it("L5c: creating an override needs a step-up (TOTP, ADR-0011)", async () => {
    const s = await createSalonFixture(prisma, "Sec Override");
    const stale = await post(
      `admin/salons/${s.salonId}/overrides`,
      {
        key: "ai.agent.enabled",
        value: true,
        expiresAt: new Date(Date.now() + 20 * DAY).toISOString(),
        reason: "Pilot grant",
      },
      adminNotElevated,
    );
    expect(stale.status).toBe(403);
    expect(problemSchema.parse(stale.body).code).toBe(ADMIN_ERRORS.stepUpRequired);
    expect(await prisma.entitlementOverride.count({ where: { salonId: s.salonId } })).toBe(0);
  });

  it("L6: detail shows only allow-listed audit metadata and no email for removed members", async () => {
    const s = await createSalonFixture(prisma, "Sec Detail");
    const removed = await prisma.user.create({
      data: { email: testEmail("removed"), emailVerifiedAt: new Date(), profile: { create: {} } },
    });
    await prisma.salonMember.create({
      data: { salonId: s.salonId, userId: removed.id, role: "staff", status: "removed" },
    });
    await prisma.auditLog.create({
      data: {
        actorType: "user",
        actorId: s.ownerUserId,
        salonId: s.salonId,
        action: "customers.updated",
        metadata: { field: "would-be-leak" },
      },
    });
    await post(`admin/salons/${s.salonId}/founding-partner`, { reason: "Detail test" }).expect(200);
    const detail = adminSalonDetailSchema.parse(
      (
        await request(http(app))
          .get(`/api/v1/admin/salons/${s.salonId}`)
          .set("authorization", admin)
          .expect(200)
      ).body,
    );
    const member = detail.members.find((m) => m.userId === removed.id);
    expect(member).toMatchObject({ status: "removed", email: null });
    const other = detail.recentAudit.find((e) => e.action === "customers.updated");
    expect(other?.metadata).toEqual({});
    const mine = detail.recentAudit.find((e) => e.action === "admin.founding_partner_granted");
    expect(Object.keys(mine?.metadata ?? {}).sort()).toEqual([
      "after",
      "before",
      "platformRole",
      "reason",
    ]);
  });
});
