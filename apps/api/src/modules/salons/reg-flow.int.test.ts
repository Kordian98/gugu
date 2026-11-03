// Email-only signup (owner 2026-11-04) against the local stack: magic link → code → quick start
// creates exactly one draft salon with smart defaults, idempotently; existing owners just sign in;
// no account enumeration; rate limits; resumable wizard progress with PII-free analytics; starter
// services; go-live at "done"; tenant isolation of every setup endpoint.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  authSessionSchema,
  meResponseSchema,
  onboardingSchema,
  PLACEHOLDER_SALON_NAME,
  problemSchema,
  salonQuickStartResultSchema,
  setupStateSchema,
  starterServicesResultSchema,
} from "@gugu/contracts";
import { starterServices } from "@gugu/domain";
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

describe("email-only signup & guided setup (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let other: SalonFixture;
  let otherOwner: string;
  const trustProxy = process.env["TRUST_PROXY"];
  // Own client /24 per run (IP-keyed limits; parallel worktrees share 127.0.0.1).
  const randomIp = () =>
    `10.${String(Math.floor(Math.random() * 256))}.${String(Math.floor(Math.random() * 256))}.9`;
  const runIp = randomIp();

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    process.env["TRUST_PROXY"] = "loopback";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    other = await createSalonFixture(prisma, "Other Salon");
    otherOwner = await bearerFor(app, other.ownerUserId);
  });
  afterAll(async () => {
    await app.close();
    if (trustProxy === undefined) delete process.env["TRUST_PROXY"];
    else process.env["TRUST_PROXY"] = trustProxy;
  });

  const requestLink = (email: string, ip = runIp) =>
    request(http(app))
      .post("/api/v1/auth/magic-link")
      .set("x-forwarded-for", ip)
      .send({ email, locale: "vi", client: "web", redirectPath: "/vi/business" });

  /** Email → 6-digit code → web session (cookie + CSRF), exactly as the signup screen does. */
  async function signUpWithCode(email: string) {
    await requestLink(email).expect(202, { status: "sent" });
    const { code } = extractMagicLink(await waitForMail(email));
    const res = await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .set("x-forwarded-for", runIp)
      .send({ email, code })
      .expect(200);
    const session = authSessionSchema.parse(res.body);
    const cookie = (res.headers["set-cookie"]?.[0] ?? "").split(";")[0] ?? "";
    const csrf = session.session.kind === "web" ? session.session.csrfToken : "";
    return { userId: session.user.id, cookie, csrf };
  }

  type Web = Awaited<ReturnType<typeof signUpWithCode>>;
  const quickStart = (s: Web) =>
    request(http(app))
      .post("/api/v1/salons/quick-start")
      .set("x-forwarded-for", runIp)
      .set("cookie", s.cookie)
      .set("x-csrf-token", s.csrf)
      .send({ locale: "vi" });
  const authed = (method: "get" | "post" | "patch" | "put", path: string, s: Web) => {
    const agent = request(http(app));
    return agent[method](`/api/v1${path}`).set("cookie", s.cookie).set("x-csrf-token", s.csrf);
  };

  it("email + code → quick start creates one draft salon with smart defaults, audited", async () => {
    const email = testEmail("signup");
    const s = await signUpWithCode(email);
    // Nothing exists before quick start: entering the app is what creates the salon.
    expect(await prisma.salonMember.count({ where: { userId: s.userId } })).toBe(0);

    const res = await quickStart(s).expect(200);
    const result = salonQuickStartResultSchema.parse(res.body);
    expect(result.created).toBe(true);

    const salon = await prisma.salon.findUniqueOrThrow({
      where: { id: result.salonId },
      include: {
        members: true,
        settings: true,
        setup: true,
        subscriptions: { include: { plan: true } },
        organization: { include: { members: true } },
      },
    });
    expect(salon).toMatchObject({
      name: PLACEHOLDER_SALON_NAME.vi,
      status: "draft",
      timezone: "Asia/Ho_Chi_Minh",
      defaultLocale: "vi",
      phoneE164: null,
      ownerUserId: s.userId,
    });
    expect(salon.members).toMatchObject([{ userId: s.userId, role: "owner", status: "active" }]);
    expect(salon.organization.members).toMatchObject([
      { userId: s.userId, role: "org_owner", status: "active" },
    ]);
    expect(salon.settings?.bookingWindowDays).toBe(60);
    // X25/q96: 14-day Pro trial first, free Basic year recorded, no payment method anywhere.
    expect(salon.subscriptions).toHaveLength(1);
    expect(salon.subscriptions[0]).toMatchObject({ status: "trialing", plan: { code: "trial" } });
    expect(salon.subscriptions[0]?.freeUntil).not.toBeNull();
    expect(salon.setup).toMatchObject({ nameConfirmed: false, currentStep: "business" });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "salon.registered", salonId: salon.id },
    });
    expect(audit.actorId).toBe(s.userId);
    expect(audit.metadata).toMatchObject({ via: "quick_start" });

    const me = meResponseSchema.parse((await authed("get", "/me", s).expect(200)).body);
    expect(me.user.memberships.map((m) => [m.salonId, m.status])).toContainEqual([
      salon.id,
      "active",
    ]);

    const onboarding = onboardingSchema.parse(
      (await authed("get", `/salons/${salon.id}/onboarding`, s).expect(200)).body,
    );
    expect(onboarding.done).toEqual([]);
    expect(onboarding.setup).toMatchObject({
      currentStep: "business",
      wizardClosed: false,
      remaining: ["business", "hours", "services", "team", "zalo"],
    });
  });

  it("double click / retry: parallel quick starts give exactly one salon", async () => {
    const s = await signUpWithCode(testEmail("double"));
    const results = await Promise.all(Array.from({ length: 5 }, () => quickStart(s).expect(200)));
    const parsed = results.map((r) => salonQuickStartResultSchema.parse(r.body));
    expect(new Set(parsed.map((p) => p.salonId)).size).toBe(1);
    expect(parsed.filter((p) => p.created)).toHaveLength(1);
    expect(await prisma.salon.count({ where: { ownerUserId: s.userId } })).toBe(1);
    expect(await prisma.organization.count({ where: { ownerUserId: s.userId } })).toBe(1);
    expect(
      await prisma.analyticsEvent.count({
        where: { name: "salon_quick_started", salonId: parsed[0]?.salonId ?? "" },
      }),
    ).toBe(1);
    // A later retry (e.g. a reload) still returns the same salon.
    const again = salonQuickStartResultSchema.parse((await quickStart(s).expect(200)).body);
    expect(again).toEqual({ salonId: parsed[0]?.salonId, created: false });
  });

  it("an existing owner signs in through the same screen and keeps their salon", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: other.ownerUserId } });
    const email = owner.email ?? "";
    const s = await signUpWithCode(email);
    expect(s.userId).toBe(other.ownerUserId);
    const result = salonQuickStartResultSchema.parse((await quickStart(s).expect(200)).body);
    expect(result).toEqual({ salonId: other.salonId, created: false });
    expect(await prisma.salon.count({ where: { ownerUserId: other.ownerUserId } })).toBe(1);
  });

  it("no enumeration: new, existing and suspended emails get the same response", async () => {
    const existing = await prisma.user.findUniqueOrThrow({ where: { id: other.ownerUserId } });
    const suspended = await prisma.user.create({
      data: { email: testEmail("suspended"), status: "suspended", profile: { create: {} } },
    });
    const responses = [];
    for (const email of [testEmail("fresh"), existing.email ?? "", suspended.email ?? ""]) {
      const res = await requestLink(email, randomIp());
      responses.push({ status: res.status, body: res.body as unknown });
    }
    expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(responses[0]).toEqual({ status: 202, body: { status: "sent" } });
  });

  it("rate limits hold: per-email link cap, code attempts, and quick start needs a session + CSRF", async () => {
    const email = testEmail("limits");
    const ip = randomIp();
    for (let i = 0; i < 3; i++) await requestLink(email, ip).expect(202);
    const limited = await requestLink(email, ip).expect(429);
    expect(problemSchema.parse(limited.body).code).toBe("common.rate_limited");

    // Five wrong codes lock the live link's code; even the right code is refused afterwards.
    const real = extractMagicLink(await waitForMail(email)).code;
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await request(http(app))
        .post("/api/v1/auth/magic-link/verify")
        .set("x-forwarded-for", ip)
        .send({ email, code: wrong })
        .expect(400);
    }
    await request(http(app))
      .post("/api/v1/auth/magic-link/verify")
      .set("x-forwarded-for", ip)
      .send({ email, code: real })
      .expect(429);

    await request(http(app)).post("/api/v1/salons/quick-start").send({}).expect(401);
    const s = await signUpWithCode(testEmail("csrf"));
    await request(http(app))
      .post("/api/v1/salons/quick-start")
      .set("cookie", s.cookie)
      .send({ locale: "vi" })
      .expect(403);
    expect(await prisma.salonMember.count({ where: { userId: s.userId } })).toBe(0);
  });

  it("a user with a salon still waiting for confirmation gets 409, not a second salon", async () => {
    // As left behind by the old anonymous registration form: owner membership not yet confirmed.
    const f = await createSalonFixture(prisma, "Pending Salon");
    await prisma.salonMember.updateMany({
      where: { salonId: f.salonId, userId: f.ownerUserId },
      data: { status: "pending_verification" },
    });
    const res = await request(http(app))
      .post("/api/v1/salons/quick-start")
      .set("x-forwarded-for", runIp)
      .set("authorization", await bearerFor(app, f.ownerUserId))
      .send({ locale: "vi" })
      .expect(409);
    expect(problemSchema.parse(res.body).code).toBe("salon.pending_confirmation");
  });

  it("wizard: progress persists, events are PII-free, templates are idempotent, done goes live", async () => {
    const email = testEmail("wizard");
    const s = await signUpWithCode(email);
    const { salonId } = salonQuickStartResultSchema.parse((await quickStart(s).expect(200)).body);
    const base = `/salons/${salonId}/onboarding`;

    await authed("post", `${base}/progress`, s)
      .send({ step: "business", event: "viewed" })
      .expect(200);
    await authed("patch", `${base}/business`, s)
      .send({ name: "Mây Nail Studio", businessType: "nails" })
      .expect(204);
    const salon = await prisma.salon.findUniqueOrThrow({
      where: { id: salonId },
      include: { primaryCategory: true, organization: true },
    });
    expect(salon.name).toBe("Mây Nail Studio");
    expect(salon.organization.name).toBe("Mây Nail Studio");
    expect(salon.primaryCategory?.slug).toBe("nails");

    // Hours: saved through the normal settings API, then marked complete.
    await authed("patch", `/salons/${salonId}/settings/opening-hours`, s)
      .send({
        days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          intervals: [{ start: "09:00", end: "21:00" }],
        })),
      })
      .expect(204);
    await authed("post", `${base}/progress`, s)
      .send({ step: "hours", event: "completed", method: "preset" })
      .expect(200);
    const atServices = setupStateSchema.parse(
      (
        await authed("post", `${base}/progress`, s)
          .send({ step: "services", event: "viewed" })
          .expect(200)
      ).body,
    );
    expect(atServices).toMatchObject({
      businessType: "nails",
      nameConfirmed: true,
      currentStep: "services",
      completed: ["business", "hours"],
      remaining: ["services", "team", "zalo"],
    });

    // Resumable: a fresh read (another device) sees the same step.
    const resumed = onboardingSchema.parse((await authed("get", base, s).expect(200)).body);
    expect(resumed.setup?.currentStep).toBe("services");
    expect(resumed.done).toEqual(["business", "hours"]);

    // Starter template: a retry skips what already exists.
    const items = starterServices("nails")
      .slice(0, 3)
      .map((t) => ({
        name: t.name,
        price: t.price,
        priceMax: t.priceMax,
        durationMinutes: t.durationMinutes,
      }));
    const first = starterServicesResultSchema.parse(
      (
        await authed("post", `${base}/starter-services`, s)
          .send({ businessType: "nails", items })
          .expect(200)
      ).body,
    );
    expect(first).toEqual({ created: 3, skipped: 0 });
    const retry = starterServicesResultSchema.parse(
      (
        await authed("post", `${base}/starter-services`, s)
          .send({ businessType: "nails", items })
          .expect(200)
      ).body,
    );
    expect(retry).toEqual({ created: 0, skipped: 3 });
    expect(await prisma.service.count({ where: { salonId, deletedAt: null } })).toBe(3);
    await authed("post", `${base}/progress`, s)
      .send({ step: "services", event: "completed", method: "template" })
      .expect(200);

    // Team: "just me" — a staff profile linked to the owner, with hours (all services by default).
    const staff = await authed("post", `/salons/${salonId}/team`, s)
      .send({ displayName: "Chị Mây", linkToMe: true })
      .expect(201);
    await authed(
      "patch",
      `/salons/${salonId}/team/${(staff.body as { id: string }).id}/schedule`,
      s,
    )
      .send({
        days: [1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          intervals: [{ start: "09:00", end: "18:00" }],
          breaks: [],
        })),
      })
      .expect(204);
    await authed("post", `${base}/progress`, s)
      .send({ step: "team", event: "completed", method: "just_me" })
      .expect(200);
    await authed("post", `${base}/progress`, s)
      .send({ step: "zalo", event: "skipped" })
      .expect(200);

    const done = setupStateSchema.parse(
      (
        await authed("post", `${base}/progress`, s)
          .send({ step: "done", event: "viewed" })
          .expect(200)
      ).body,
    );
    expect(done).toMatchObject({
      wizardClosed: true,
      finished: true,
      skipped: ["zalo"],
      remaining: ["zalo"],
    });
    // Complete checklist at "done" → live (audited), no separate button.
    expect((await prisma.salon.findUniqueOrThrow({ where: { id: salonId } })).status).toBe(
      "active",
    );
    expect(await prisma.auditLog.count({ where: { action: "salon.went_live", salonId } })).toBe(1);

    // Viewing "done" again does not finish twice.
    await authed("post", `${base}/progress`, s).send({ step: "done", event: "viewed" }).expect(200);

    // The card can be dismissed for good.
    await authed("post", `${base}/dismiss-card`, s).expect(204);
    const after = onboardingSchema.parse((await authed("get", base, s).expect(200)).body);
    expect(after.setup?.cardDismissed).toBe(true);

    // Analytics: the funnel is there, without PII and without the raw user id.
    const events = await prisma.analyticsEvent.findMany({
      where: { salonId },
      orderBy: { occurredAt: "asc" },
    });
    const names = events.map((e) => e.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "salon_quick_started",
        "setup_step_viewed",
        "setup_step_completed",
        "setup_step_skipped",
        "starter_services_added",
        "setup_finished",
        "setup_card_dismissed",
      ]),
    );
    expect(names.filter((n) => n === "setup_finished")).toHaveLength(1);
    const finished = events.find((e) => e.name === "setup_finished");
    expect(finished?.props).toMatchObject({ went_live: true, skipped_count: 1 });
    const dump = JSON.stringify(events);
    for (const secret of [email, s.userId, "Mây Nail Studio", "Chị Mây"]) {
      expect(dump).not.toContain(secret);
    }
    expect(new Set(events.map((e) => e.actorHash)).size).toBe(1);
  });

  it("tenant isolation: another salon's setup endpoints are 404; staff cannot rename the salon", async () => {
    const s = await signUpWithCode(testEmail("tenant"));
    const { salonId } = salonQuickStartResultSchema.parse((await quickStart(s).expect(200)).body);
    const base = `/api/v1/salons/${salonId}/onboarding`;
    const as = (r: request.Test) => r.set("authorization", otherOwner);
    await as(request(http(app)).get(base)).expect(404);
    await as(request(http(app)).patch(`${base}/business`))
      .send({ name: "Hijack", businessType: "hair" })
      .expect(404);
    await as(request(http(app)).post(`${base}/progress`))
      .send({ step: "hours", event: "viewed" })
      .expect(404);
    await as(request(http(app)).post(`${base}/dismiss-card`)).expect(404);
    await as(request(http(app)).post(`${base}/starter-services`))
      .send({
        businessType: "hair",
        items: [{ name: { vi: "X" }, price: 1000, durationMinutes: 30 }],
      })
      .expect(404);
    const salon = await prisma.salon.findUniqueOrThrow({ where: { id: salonId } });
    expect(salon.name).toBe(PLACEHOLDER_SALON_NAME.vi);
    expect(await prisma.service.count({ where: { salonId } })).toBe(0);

    const staffId = await addSalonMember(prisma, salonId, "staff");
    const staff = await bearerFor(app, staffId);
    await request(http(app))
      .patch(`${base}/business`)
      .set("authorization", staff)
      .send({ name: "Staff rename", businessType: "hair" })
      .expect(403);
    await request(http(app))
      .post(`${base}/progress`)
      .set("authorization", staff)
      .send({ step: "hours", event: "viewed" })
      .expect(403);
  });
});
