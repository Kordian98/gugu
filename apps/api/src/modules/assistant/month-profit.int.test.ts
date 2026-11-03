// Integration: the assistant's month_profit tool (topic 08 × 07, ADR-0014) returns salon totals
// equal to the Insights profit view, passes the PII allowlist, and never carries per-person pay.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBookableSalon, vnAt } from "../../../test/factories/booking";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { ProfitService } from "../insights/insights.facade";
import { checkToolResult } from "./firewall/allowlist";
import type { TokenVault } from "./firewall/token-vault";
import { ReadTools } from "./tools/read-tools";

/** A salary nobody else has: it must never appear in tool output. */
const SALARY_CANARY = 8_765_431;
const NOW = new Date(vnAt("2026-12-15", "12:00"));

describe("month_profit tool (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let salonId = "";
  let staffName = "";

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    const s = await createBookableSalon(prisma);
    salonId = s.salonId;
    const [a, b] = s.staffIds;
    staffName = "Linh";
    await prisma.staffPaySetting.createMany({
      data: [
        {
          staffId: a,
          baseType: "monthly" as const,
          baseAmountMinor: BigInt(SALARY_CANARY),
          commissionBps: 1000,
        },
        { staffId: b, baseType: "daily" as const, baseAmountMinor: 250_000n, commissionBps: 2000 },
      ].map((v) => ({
        ...v,
        salonId,
        effectiveFrom: new Date("2026-11-01T00:00:00Z"),
        createdByUserId: s.ownerUserId,
      })),
    });
    // One completed two-staff chain on 2 Dec.
    const start = new Date(vnAt("2026-12-02", "10:00"));
    const mid = new Date(vnAt("2026-12-02", "10:30"));
    const end = new Date(vnAt("2026-12-02", "11:00"));
    const booking = await prisma.booking.create({
      data: {
        salonId,
        referenceCode: "MP001",
        status: "completed",
        source: "phone",
        createdByActorType: "salon_member",
        staffId: a,
        startsAt: start,
        endsAt: end,
        totalPriceMinor: 400_000n,
        customerName: "Canary Khách",
      },
    });
    for (const [i, [staffId, from, to]] of (
      [
        [a, start, mid],
        [b, mid, end],
      ] as const
    ).entries()) {
      await prisma.bookingService.create({
        data: {
          salonId,
          bookingId: booking.id,
          sequence: i + 1,
          serviceId: s.serviceId,
          staffId,
          startsAt: from,
          endsAt: to,
          name: { vi: "Sơn gel" },
          durationMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
          priceMinor: 200_000n,
        },
      });
    }
  });
  afterAll(async () => {
    await app.close();
  });

  it("totals equal the profit view; no salary, staff or names; mutations are withheld", async () => {
    const tool = app
      .get(ReadTools)
      .all()
      .find((t) => t.name === "month_profit");
    if (!tool) throw new Error("month_profit tool missing");
    expect(tool.permission).toBe("payroll.read");
    const tokens = new Map<string, string>();
    const vault = {
      tokenFor: (kind: string, id: string) => {
        const k = `${kind}:${id}`;
        if (!tokens.has(k)) tokens.set(k, `${kind}_${String(tokens.size + 1)}`);
        return Promise.resolve(tokens.get(k) ?? "");
      },
    } as unknown as TokenVault;
    const out = (await tool.handler(
      {
        salonId,
        timeZone: "Asia/Ho_Chi_Minh",
        permissions: new Set(["payroll.read"]),
        vault,
        now: () => NOW.getTime(),
      },
      tool.input.parse({ date: "2026-12-15" }),
    )) as Record<string, unknown>;
    expect(checkToolResult(tool.output, out).ok).toBe(true);
    const view = await app.get(ProfitService).compute(salonId, "2026-12", NOW);
    expect(out["netProfitVnd"]).toBe(view.metrics["profit.net"]?.value);
    expect(out["revenueEarnedVnd"]).toBe(400_000);
    expect(out["payrollTotalVnd"]).toBe(view.breakdown.payroll);
    const json = JSON.stringify(out);
    expect(json).not.toContain(String(SALARY_CANARY));
    expect(json).not.toMatch(/staff_\d|Canary|Linh|Mai/);
    expect(json).not.toContain(staffName);
    expect(tokens.size).toBe(0);
    const leak = { ...out, staff: [{ staff: "staff_1", salaryVnd: SALARY_CANARY }] };
    expect(checkToolResult(tool.output, leak).ok).toBe(false);
    expect(checkToolResult(tool.output, { ...out, note: "Linh earns a lot" }).ok).toBe(false);
  });
});
