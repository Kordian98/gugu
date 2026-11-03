// X25 data backfill (migration 20261104160100_x25_backfill_free_year) against real Postgres. The
// migration SQL is replayed inside a transaction that is rolled back, so other suites' rows in the
// test database are never changed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PlanCode, SubscriptionStatus } from "@gugu/contracts";
import { createSalonFixture } from "../../../test/factories/identity";
import { AppModule } from "../../app.module";
import type { Prisma } from "../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { freeYearEnd } from "./domain/free-year";

const DAY = 86_400_000;
const SQL = readFileSync(
  resolve("prisma/migrations/20261104160100_x25_backfill_free_year/migration.sql"),
  "utf8",
);
/** Statements of the migration (no semicolons inside statements; comments stripped). */
const STATEMENTS = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(/;\s*\n/)
  .map((x) => x.trim().replace(/;$/, ""))
  .filter((x) => x.length > 0);

class Rollback extends Error {}

describe("X25 free-year backfill (integration)", () => {
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

  async function salon(
    name: string,
    ageDays: number,
    timezone = "Asia/Ho_Chi_Minh",
    subs: { plan: PlanCode; status: SubscriptionStatus; periodEnd?: Date; freeUntil?: Date }[],
  ) {
    const f = await createSalonFixture(prisma, `X25 backfill ${name}`);
    const createdAt = new Date(Date.now() - ageDays * DAY);
    await prisma.salon.update({ where: { id: f.salonId }, data: { createdAt, timezone } });
    for (const [i, s] of subs.entries()) {
      const plan = await prisma.plan.findUniqueOrThrow({ where: { code: s.plan } });
      await prisma.subscription.create({
        data: {
          salonId: f.salonId,
          planId: plan.id,
          planVersion: plan.version,
          status: s.status,
          interval: s.plan === "trial" ? null : "month",
          trialEndsAt: s.plan === "trial" ? new Date(createdAt.getTime() + 14 * DAY) : null,
          currentPeriodStart: createdAt,
          currentPeriodEnd: s.periodEnd ?? null,
          freeUntil: s.freeUntil ?? null,
          // Older rows first, so "newest row" is the last one listed.
          createdAt: new Date(createdAt.getTime() + i * 1000),
        },
      });
    }
    return { salonId: f.salonId, end: freeYearEnd(createdAt, timezone) };
  }

  it("gives trial and Basic salons the free year from registration, in the salon's zone", async () => {
    const preset = new Date(Date.now() + 100 * DAY);
    const a = await salon("trialing", 3, undefined, [{ plan: "trial", status: "trialing" }]);
    const b = await salon("basic warsaw", 100, "Europe/Warsaw", [
      { plan: "basic", status: "active", periodEnd: new Date(Date.now() + 5 * DAY) },
    ]);
    const c = await salon("basic past due", 200, undefined, [
      { plan: "basic", status: "past_due", periodEnd: new Date(Date.now() - 2 * DAY) },
    ]);
    const d = await salon("expired trial", 60, undefined, [{ plan: "trial", status: "expired" }]);
    const e = await salon("expired long ago", 400, undefined, [
      { plan: "trial", status: "expired" },
    ]);
    const f = await salon("pro", 10, undefined, [
      { plan: "pro", status: "active", periodEnd: new Date(Date.now() + 20 * DAY) },
    ]);
    const g = await salon("already set", 5, undefined, [
      { plan: "trial", status: "trialing", freeUntil: preset },
    ]);
    const h = await salon("cancelled", 30, undefined, [{ plan: "basic", status: "cancelled" }]);
    const ids = [a, b, c, d, e, f, g, h].map((x) => x.salonId);

    const replay = async (tx: Prisma.TransactionClient) => {
      for (const stmt of STATEMENTS) await tx.$executeRawUnsafe(stmt);
    };
    const subsOf = (tx: Prisma.TransactionClient, salonId: string) =>
      tx.subscription.findMany({
        where: { salonId },
        orderBy: { createdAt: "asc" },
        include: { plan: true, events: true },
      });

    await expect(
      prisma.$transaction(
        async (tx) => {
          await replay(tx);
          const [sa] = await subsOf(tx, a.salonId);
          expect(sa?.freeUntil?.toISOString()).toBe(a.end.toISOString());
          expect(sa?.status).toBe("trialing");

          const [sb] = await subsOf(tx, b.salonId);
          expect(sb?.freeUntil?.toISOString()).toBe(b.end.toISOString());
          expect(sb?.currentPeriodEnd?.toISOString()).toBe(b.end.toISOString());
          expect(sb?.events.map((x) => [x.fromStatus, x.toStatus, x.reason])).toEqual([
            ["active", "active", "x25_free_year_backfill"],
          ]);

          const [sc] = await subsOf(tx, c.salonId);
          expect(sc).toMatchObject({ status: "active" });
          expect(sc?.currentPeriodEnd?.toISOString()).toBe(c.end.toISOString());
          expect(sc?.events.map((x) => [x.fromStatus, x.toStatus])).toEqual([
            ["past_due", "active"],
          ]);

          const sd = await subsOf(tx, d.salonId);
          expect(sd.map((x) => [x.plan.code, x.status])).toEqual([
            ["trial", "expired"],
            ["basic", "active"],
          ]);
          expect(sd[1]?.freeUntil?.toISOString()).toBe(d.end.toISOString());
          expect(sd[1]?.currentPeriodEnd?.toISOString()).toBe(d.end.toISOString());
          expect(sd[1]?.events.map((x) => [x.fromStatus, x.toStatus, x.toPlanCode])).toEqual([
            [null, "active", "basic"],
          ]);

          expect((await subsOf(tx, e.salonId)).map((x) => x.status)).toEqual(["expired"]);
          expect((await subsOf(tx, f.salonId))[0]?.freeUntil).toBeNull();
          expect((await subsOf(tx, g.salonId))[0]?.freeUntil?.toISOString()).toBe(
            preset.toISOString(),
          );
          expect((await subsOf(tx, h.salonId)).map((x) => [x.status, x.freeUntil])).toEqual([
            ["cancelled", null],
          ]);

          // Re-runnable: a second pass changes nothing.
          const events = await tx.subscriptionEvent.count({ where: { salonId: { in: ids } } });
          const subs = await tx.subscription.count({ where: { salonId: { in: ids } } });
          await replay(tx);
          expect(await tx.subscriptionEvent.count({ where: { salonId: { in: ids } } })).toBe(
            events,
          );
          expect(await tx.subscription.count({ where: { salonId: { in: ids } } })).toBe(subs);
          throw new Rollback();
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBeInstanceOf(Rollback);

    await prisma.subscriptionEvent.deleteMany({ where: { salonId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { salonId: { in: ids } } });
  });
});
