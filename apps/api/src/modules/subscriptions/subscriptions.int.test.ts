// Integration against the local stack (`pnpm stack:up`): real Postgres + Valkey, frozen clock.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type PlanCode, salonEntitlementsSchema } from "@gugu/contracts";
import { uuidV7 } from "../../../test/factories/ids";
import { http } from "../../../test/http-app";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import type { AppError } from "../../common/problem/app-error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { Clock } from "./application/clock";
import { EntitlementService } from "./application/entitlement.service";
import { SubscriptionsFacade } from "./application/subscriptions.facade";
import { PLAN_CATALOG } from "./domain/plan-catalog";
import { SALON_ACCESS } from "./http/salon-access";

const DAY = 86_400_000;
const T0 = new Date("2026-11-02T03:00:00Z");

class FrozenClock extends Clock {
  current = T0;
  override now(): Date {
    return this.current;
  }
}

describe("subscriptions & entitlements (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let facade: SubscriptionsFacade;
  let entitlements: EntitlementService;
  const clock = new FrozenClock();
  const salons: string[] = [];
  const newSalon = () => {
    const id = uuidV7();
    salons.push(id);
    return id;
  };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(SALON_ACCESS)
      .useValue({ assertCanRead: () => Promise.resolve() })
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    facade = app.get(SubscriptionsFacade);
    entitlements = app.get(EntitlementService);
  });

  beforeEach(() => {
    clock.current = T0;
  });

  afterAll(async () => {
    await prisma.subscriptionEvent.deleteMany({ where: { salonId: { in: salons } } });
    await prisma.subscription.deleteMany({ where: { salonId: { in: salons } } });
    await prisma.entitlementOverride.deleteMany({ where: { salonId: { in: salons } } });
    await app.close();
  });

  async function subscribe(salonId: string, plan: PlanCode) {
    const p = await prisma.plan.findUniqueOrThrow({ where: { code: plan } });
    await prisma.subscription.create({
      data: { salonId, planId: p.id, planVersion: p.version, status: "active", interval: "month" },
    });
    await entitlements.invalidate(salonId);
  }

  it("seeds exactly the catalogue: basic, pro, ultra (public) and trial (internal), no free plan", async () => {
    const plans = await prisma.plan.findMany({ include: { entitlements: true } });
    expect(plans.map((p) => p.code).toSorted()).toEqual(["basic", "pro", "trial", "ultra"]);
    for (const plan of plans) {
      const expected = PLAN_CATALOG[plan.code as PlanCode];
      expect(plan.isPublic, plan.code).toBe(expected.isPublic);
      expect(plan.version, plan.code).toBe(expected.version);
      const stored = Object.fromEntries(plan.entitlements.map((e) => [e.key, e.value]));
      expect(stored, plan.code).toEqual(expected.entitlements);
    }
  });

  it("trialing salon gets Pro features with the Basic AI cap", async () => {
    const salonId = newSalon();
    const trial = await facade.startTrial({ salonId });
    expect(trial).toMatchObject({ salonId, plan: "trial", status: "trialing" });
    expect(trial.trialEndsAt).toBe(new Date(T0.getTime() + 14 * DAY).toISOString());

    const e = await entitlements.forSalon(salonId);
    expect(e.status).toBe("trialing");
    expect(e.entitlements["ai.agent.enabled"]).toBe(true);
    expect(e.entitlements["ai.monthly_review"]).toBe(true);
    expect(e.entitlements["zalo.inbox"]).toBe(true);
    expect(e.entitlements["ai.monthly_cost_cap_vnd"]).toBe(20_000);
    expect(e.entitlements["zalo_template.monthly_messages"]).toBe(100);
    expect(e.entitlements["notifications.sms.monthly_messages"]).toBe(30);
    expect(e.entitlements["analytics.advanced"]).toBe(false);
    await expect(entitlements.assert(salonId, "ai.agent.enabled")).resolves.toBeUndefined();

    const events = await prisma.subscriptionEvent.findMany({ where: { salonId } });
    expect(events).toMatchObject([
      { fromStatus: null, toStatus: "trialing", actor: "system", reason: "trial_started" },
    ]);
  });

  it("startTrial is idempotent while the trial is current and refuses a second trial", async () => {
    const salonId = newSalon();
    const first = await facade.startTrial({ salonId });
    expect((await facade.startTrial({ salonId })).id).toBe(first.id);

    clock.current = new Date(T0.getTime() + 15 * DAY);
    expect(await facade.expireDueTrials()).toBeGreaterThanOrEqual(1);
    await expect(facade.startTrial({ salonId })).rejects.toMatchObject({
      status: 409,
      code: "subscription.trial_unavailable",
    });
  });

  it("concurrent startTrial calls create exactly one subscription", async () => {
    const salonId = newSalon();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => facade.startTrial({ salonId })),
    );
    for (const r of results) {
      if (r.status === "rejected")
        expect((r.reason as AppError).code).toBe("subscription.trial_unavailable");
    }
    expect(await prisma.subscription.count({ where: { salonId } })).toBe(1);
  });

  it("joins the caller's transaction (salon registration rolls back the trial too)", async () => {
    const salonId = newSalon();
    await expect(
      prisma.$transaction(async (tx) => {
        await facade.startTrial({ salonId }, tx);
        throw new Error("registration failed after startTrial");
      }),
    ).rejects.toThrow("registration failed");
    expect(await prisma.subscription.count({ where: { salonId } })).toBe(0);
  });

  it("an ended trial denies everything, before and after the expiry job", async () => {
    const salonId = newSalon();
    await facade.startTrial({ salonId });
    clock.current = new Date(T0.getTime() + 14 * DAY);
    await entitlements.invalidate(salonId);

    const lazy = await entitlements.forSalon(salonId);
    expect(lazy.status).toBe("expired");
    expect(lazy.entitlements["crm.core"]).toBe(false);
    expect(lazy.entitlements["ai.monthly_cost_cap_vnd"]).toBe(0);
    await expect(entitlements.assert(salonId, "ai.agent.enabled")).rejects.toMatchObject({
      status: 403,
      code: "entitlement.required",
    });

    await facade.expireDueTrials();
    const sub = await prisma.subscription.findFirstOrThrow({
      where: { salonId },
      include: { events: true },
    });
    expect(sub.status).toBe("expired");
    expect(sub.events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      [null, "trialing"],
      ["trialing", "expired"],
    ]);
    expect((await entitlements.forSalon(salonId)).status).toBe("expired");
  });

  it("resolves Basic, Pro and Ultra from the catalogue", async () => {
    for (const plan of ["basic", "pro", "ultra"] as const) {
      const salonId = newSalon();
      await subscribe(salonId, plan);
      const e = await entitlements.forSalon(salonId);
      expect(e.plan).toBe(plan);
      expect(e.entitlements).toEqual(PLAN_CATALOG[plan].entitlements);
    }
  });

  it("applies admin overrides after invalidation and ignores expired ones", async () => {
    const salonId = newSalon();
    await subscribe(salonId, "basic");
    expect(await entitlements.isEnabled(salonId, "ai.agent.enabled")).toBe(false);

    await prisma.entitlementOverride.createMany({
      data: [
        { salonId, key: "ai.agent.enabled", value: true, reason: "pilot", createdBy: "admin:test" },
        {
          salonId,
          key: "zalo.inbox",
          value: true,
          reason: "expired pilot",
          createdBy: "admin:test",
          expiresAt: new Date(T0.getTime() - 1),
        },
      ],
    });
    // Cached for up to 60 s until invalidated.
    expect(await entitlements.isEnabled(salonId, "ai.agent.enabled")).toBe(false);
    await entitlements.invalidate(salonId);
    expect(await entitlements.isEnabled(salonId, "ai.agent.enabled")).toBe(true);
    expect(await entitlements.isEnabled(salonId, "zalo.inbox")).toBe(false);
  });

  it("rejects disallowed transitions without writing history, and scopes by salon", async () => {
    const salonId = newSalon();
    const trial = await facade.startTrial({ salonId });
    await facade.transition({
      salonId,
      subscriptionId: trial.id,
      to: "cancelled",
      reason: "owner request",
    });
    await expect(
      facade.transition({ salonId, subscriptionId: trial.id, to: "active", reason: "x" }),
    ).rejects.toMatchObject({ status: 409, code: "subscription.invalid_transition" });
    await expect(
      facade.transition({
        salonId: newSalon(),
        subscriptionId: trial.id,
        to: "expired",
        reason: "x",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await prisma.subscriptionEvent.count({ where: { subscriptionId: trial.id } })).toBe(2);
  });

  it("enforces one current subscription per salon in the database", async () => {
    const salonId = newSalon();
    await subscribe(salonId, "basic");
    await expect(subscribe(salonId, "pro")).rejects.toMatchObject({ code: "P2002" });
  });

  it("serves GET /api/v1/salons/:salonId/entitlements for a trialing salon", async () => {
    const salonId = newSalon();
    await facade.startTrial({ salonId });
    const res = await request(http(app)).get(`/api/v1/salons/${salonId}/entitlements`).expect(200);
    const body = salonEntitlementsSchema.parse(res.body);
    expect(body).toMatchObject({ salonId, plan: "trial", status: "trialing" });
    expect(body.entitlements["ai.monthly_cost_cap_vnd"]).toBe(20_000);
  });
});
