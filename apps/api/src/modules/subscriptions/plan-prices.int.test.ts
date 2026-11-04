// X27: the `plan_prices` rows seeded by migrations match the shared list prices in @gugu/contracts,
// which the landing pricing assistant reads. A price change needs a migration and the constant.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLAN_LIST_PRICES_VND } from "@gugu/contracts";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

describe("plan list prices (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("the current VND price of every public plan and interval equals the shared constant", async () => {
    const now = new Date();
    const rows = await prisma.planPrice.findMany({
      where: { currency: "VND", activeFrom: { lte: now } },
      orderBy: { activeFrom: "desc" },
      select: { interval: true, amountMinor: true, plan: { select: { code: true } } },
    });
    const current: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const plan = (current[r.plan.code] ??= {});
      plan[r.interval] ??= Number(r.amountMinor);
    }
    expect(current).toEqual(PLAN_LIST_PRICES_VND);
  });
});
