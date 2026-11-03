// Per-user rate limits on /api/v1/admin/* (admin review follow-up). TEST_DATABASE_URL only.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { problemSchema } from "@gugu/contracts";
import {
  createSalonFixture,
  steppedUpBearerFor,
  testEmail,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { AppConfig } from "../../infrastructure/config/app-config";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

describe("admin API rate limits (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let env: { ADMIN_RATE_LIMIT_PER_MINUTE: number; ADMIN_WRITE_RATE_LIMIT_PER_MINUTE: number };
  let saved: typeof env;

  const admin = async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail("rl-admin"),
        emailVerifiedAt: new Date(),
        platformRole: "super_admin",
        profile: { create: {} },
      },
    });
    return steppedUpBearerFor(app, user.id);
  };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    env = app.get(AppConfig).env as typeof env;
    saved = { ...env };
  });

  beforeEach(async () => {
    await clearRateLimits(app);
  });

  afterAll(async () => {
    Object.assign(env, saved);
    await app.close();
  });

  it("limits every admin request per user; other admins are not affected", async () => {
    env.ADMIN_RATE_LIMIT_PER_MINUTE = 3;
    const a = await admin();
    const b = await admin();
    const get = (bearer: string) =>
      request(http(app)).get("/api/v1/admin/salons?limit=1").set("authorization", bearer);
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await get(a)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const limited = await get(a);
    expect(problemSchema.parse(limited.body).code).toBe("common.rate_limited");
    expect((await get(b)).status).toBe(200);
    env.ADMIN_RATE_LIMIT_PER_MINUTE = saved.ADMIN_RATE_LIMIT_PER_MINUTE;
  });

  it("limits admin writes separately", async () => {
    env.ADMIN_WRITE_RATE_LIMIT_PER_MINUTE = 2;
    const a = await admin();
    const s = await createSalonFixture(prisma, "RL Salon");
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(http(app))
        .post(`/api/v1/admin/salons/${s.salonId}/founding-partner${i % 2 ? "/revoke" : ""}`)
        .set("authorization", a)
        .send({ reason: "Rate limit test" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
    // Reads still work for this admin.
    await request(http(app)).get("/api/v1/admin/mfa").set("authorization", a).expect(200);
    env.ADMIN_WRITE_RATE_LIMIT_PER_MINUTE = saved.ADMIN_WRITE_RATE_LIMIT_PER_MINUTE;
    await prisma.foundingPartner.deleteMany({ where: { organizationId: s.organizationId } });
  });
});
