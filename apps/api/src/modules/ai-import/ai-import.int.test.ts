// Integration against the local stack: AI import over HTTP (multipart upload, entitlement, tenant
// isolation, permissions, confirm → catalogue) with a recording LLM client, and the Redis cost cap.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AI_IMPORT_ERRORS,
  aiImportExtractResultSchema,
  aiImportStatusSchema,
  serviceListSchema,
  SUBSCRIPTION_ERRORS,
} from "@gugu/contracts";
import { fakeAnthropic, toolReply } from "../../../test/fixtures/ai-import/fakes";
import { CANARIES, renderPriceList } from "../../../test/fixtures/ai-import/render";
import {
  addSalonMember,
  bearerFor,
  createSalonFixture,
  type SalonFixture,
} from "../../../test/factories/identity";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SubscriptionsFacade } from "../subscriptions/subscriptions.facade";
import { AiCostMeter } from "./application/ai-cost-meter";
import { ANTHROPIC_CLIENT } from "./llm/price-list-extractor";

const gelRow = {
  name: { vi: "Sơn gel tay", en: "Gel polish (hands)" },
  category: "nails",
  price: 150000,
  priceMax: null,
  durationMinutes: 45,
  variants: [],
  addOns: [],
  sourceImage: 1,
  confidence: "high",
};

async function boot(client: unknown): Promise<INestApplication> {
  process.env["LOG_LEVEL"] = "silent";
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ANTHROPIC_CLIENT)
    .useValue(client)
    .compile();
  const app = configureHttpApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

describe("AI import (integration)", () => {
  const llm = fakeAnthropic(() => toolReply([gelRow]));
  let app: INestApplication;
  let prisma: PrismaService;
  let a: SalonFixture;
  let b: SalonFixture;
  let noPlan: SalonFixture;
  let ownerA: string;
  let ownerB: string;
  let ownerNoPlan: string;
  let staffA: string;
  let image: Buffer;

  beforeAll(async () => {
    app = await boot(llm);
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    a = await createSalonFixture(prisma, "AI import A");
    b = await createSalonFixture(prisma, "AI import B");
    noPlan = await createSalonFixture(prisma, "AI import no plan");
    await app.get(SubscriptionsFacade).startTrial({ salonId: a.salonId });
    await app.get(SubscriptionsFacade).startTrial({ salonId: b.salonId });
    ownerA = await bearerFor(app, a.ownerUserId);
    ownerB = await bearerFor(app, b.ownerUserId);
    ownerNoPlan = await bearerFor(app, noPlan.ownerUserId);
    staffA = await bearerFor(app, await addSalonMember(prisma, a.salonId, "staff"));
    image = await renderPriceList({ withPii: true });
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const extract = (salonId: string, bearer: string) =>
    api()
      .post(`/api/v1/salons/${salonId}/ai-import/extract`)
      .set("authorization", bearer)
      .attach("images", image, { filename: "menu.png", contentType: "image/png" });

  it("reports status with the trial's cap", async () => {
    const res = await api()
      .get(`/api/v1/salons/${a.salonId}/ai-import`)
      .set("authorization", ownerA)
      .expect(200);
    const status = aiImportStatusSchema.parse(res.body);
    expect(status).toMatchObject({ configured: true, entitled: true, maxImages: 10 });
    expect(status.usage.capVnd).toBe(20_000);
  });

  it("extracts drafts from a multipart upload, redacting before the LLM call", async () => {
    const res = await extract(a.salonId, ownerA).expect(200);
    const body = aiImportExtractResultSchema.parse(res.body);
    expect(body.items[0]?.name.vi).toBe("Sơn gel tay");
    expect(body.images[0]?.redactedRegions).toBeGreaterThan(0);
    expect(body.usage.usedVnd).toBeGreaterThan(0);
    const sent = JSON.stringify(llm.requests.at(-1), (k, v: unknown) => (k === "data" ? "" : v));
    for (const canary of Object.values(CANARIES)) expect(sent).not.toContain(canary);
    const audit = await prisma.auditLog.findFirst({
      where: { salonId: a.salonId, action: "ai_import.extracted" },
    });
    expect(audit?.metadata).toMatchObject({ images: 1, services: 1 });
  }, 60_000);

  it("creates the confirmed rows through the catalogue", async () => {
    const nails = await prisma.serviceCategory.findFirstOrThrow({ where: { slug: "nails" } });
    const res = await api()
      .post(`/api/v1/salons/${a.salonId}/ai-import/confirm`)
      .set("authorization", ownerA)
      .send({
        items: [
          {
            name: { vi: "Sơn gel tay", en: "Gel polish" },
            categoryId: nails.id,
            price: 150000,
            durationMinutes: 45,
          },
        ],
      })
      .expect(201);
    expect(res.body).toMatchObject({ created: 1 });
    const list = serviceListSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${a.salonId}/services`)
          .set("authorization", ownerA)
          .expect(200)
      ).body,
    );
    expect(list.items.map((s) => s.name.vi)).toContain("Sơn gel tay");
  });

  it("validates confirmed rows", async () => {
    const res = await api()
      .post(`/api/v1/salons/${a.salonId}/ai-import/confirm`)
      .set("authorization", ownerA)
      .send({ items: [{ name: { vi: "" }, price: -1, durationMinutes: 1 }] })
      .expect(400);
    expect((res.body as { code: string }).code).toBe("common.validation_failed");
  });

  it("keeps tenants apart and requires services.write", async () => {
    const calls = llm.requests.length;
    expect([403, 404]).toContain((await extract(a.salonId, ownerB)).status);
    expect((await extract(a.salonId, staffA)).status).toBe(403);
    await api()
      .post(`/api/v1/salons/${a.salonId}/ai-import/confirm`)
      .set("authorization", ownerB)
      .send({ items: [{ name: { vi: "X" }, price: 1, durationMinutes: 30 }] })
      .expect((r) => {
        expect([403, 404]).toContain(r.status);
      });
    expect(llm.requests.length).toBe(calls);
  }, 30_000);

  it("requires the plan entitlement", async () => {
    const res = await extract(noPlan.salonId, ownerNoPlan).expect(403);
    expect((res.body as { code: string }).code).toBe(SUBSCRIPTION_ERRORS.entitlementRequired);
  });

  it("enforces the hard monthly cap atomically", async () => {
    const meter = app.get(AiCostMeter);
    const cap = 20_000;
    const before = (await meter.usage(b.salonId)).usedVnd;
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () => meter.reserve(b.salonId, 1_000)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(Math.floor((cap - before) / 1_000));
    const used = (await meter.usage(b.salonId)).usedVnd;
    expect(used).toBeLessThanOrEqual(cap);
    // Commit the first at a lower actual cost; release the rest; settling twice counts once.
    const reservations = ok.map((r) => r.value);
    const [first, ...rest] = reservations;
    if (!first) throw new Error("no reservation succeeded");
    await meter.commit(first, 400);
    await meter.commit(first, 400);
    for (const r of rest) await meter.release(r);
    expect((await meter.usage(b.salonId)).usedVnd).toBe(before + 400);
  });
});

describe("AI import without an API key (integration)", () => {
  let app: INestApplication;
  let owner: string;
  let salon: SalonFixture;
  beforeAll(async () => {
    app = await boot(null);
    const prisma = app.get(PrismaService);
    salon = await createSalonFixture(prisma, "AI import unconfigured");
    await app.get(SubscriptionsFacade).startTrial({ salonId: salon.salonId });
    owner = await bearerFor(app, salon.ownerUserId);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it("reports not configured and never processes uploads", async () => {
    const status = await request(http(app))
      .get(`/api/v1/salons/${salon.salonId}/ai-import`)
      .set("authorization", owner)
      .expect(200);
    expect((status.body as { configured: boolean }).configured).toBe(false);
    const res = await request(http(app))
      .post(`/api/v1/salons/${salon.salonId}/ai-import/extract`)
      .set("authorization", owner)
      .attach("images", await renderPriceList(), { filename: "m.png", contentType: "image/png" })
      .expect(503);
    expect((res.body as { code: string }).code).toBe(AI_IMPORT_ERRORS.notConfigured);
  });
});
