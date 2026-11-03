// Integration: payroll UX additions (owner review 2026-11-03) — bulk commission changes, the next
// scheduled pay version in settings, the staff member's own commission lines, and "chi phí thực
// tế" (employer cost, ADR-0017): math, effective dates, payroll totals, profit line, the closed
// snapshot, and that the staff member never sees it.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  commissionLinesSchema,
  myCommissionLinesSchema,
  payrollExportSchema,
  type PayrollMonth,
  type PayrollRow,
  payrollMonthSchema,
  payrollSettingsSchema,
  problemSchema,
  profitSchema,
  staffPaySchema,
} from "@gugu/contracts";
import { addSalonMember, bearerFor } from "../../../test/factories/identity";
import {
  createBookableSalon,
  type BookableSalonFixture,
  vnAt,
} from "../../../test/factories/booking";
import { http } from "../../../test/http-app";
import { clearRateLimits } from "../../../test/rate-limits";
import { AppModule } from "../../app.module";
import { configureHttpApp } from "../../bootstrap";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { BookingClock } from "../bookings/bookings.facade";
import { PayrollClock } from "./salon-crm.facade";

const now = new Date(vnAt("2026-12-15", "12:00"));
const clock = { now: () => new Date(now) };
/** An employer cost nobody else has: it must never reach the staff member. */
const EMPLOYER_CANARY = 379_742;

describe("payroll UX: bulk commission, own lines, employer cost (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let other: BookableSalonFixture;
  let owner: string;
  let staffMai: string;
  let receptionist: string;
  let linh: string;
  let mai: string;

  const api = () => request(http(app));
  const url = (p: string) => `/api/v1/salons/${s.salonId}/${p}`;
  const settings = async () =>
    payrollSettingsSchema.parse(
      (await api().get(url("payroll/settings")).set("authorization", owner).expect(200)).body,
    );
  const pay = async (id: string) =>
    staffPaySchema.parse(
      (
        await api()
          .get(url(`payroll/staff/${id}/pay`))
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
  const bulk = (body: Record<string, unknown>, auth = owner) =>
    api().post(url("payroll/commission/bulk")).set("authorization", auth).send(body);
  const month = async (): Promise<PayrollMonth> =>
    payrollMonthSchema.parse(
      (
        await api()
          .get(url("payroll"))
          .query({ month: "2026-12" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
  const row = (p: PayrollMonth, id: string): PayrollRow => {
    const r = p.rows.find((x) => x.staffId === id);
    if (!r) throw new Error(`no row for ${id}`);
    return r;
  };

  beforeAll(async () => {
    process.env["LOG_LEVEL"] = "silent";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BookingClock)
      .useValue(clock)
      .overrideProvider(PayrollClock)
      .useValue(clock)
      .compile();
    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    await clearRateLimits(app);
    s = await createBookableSalon(prisma);
    other = await createBookableSalon(prisma);
    [linh, mai] = s.staffIds;
    owner = await bearerFor(app, s.ownerUserId);
    const maiUser = await addSalonMember(prisma, s.salonId, "staff");
    const maiMember = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: maiUser },
    });
    await prisma.staffProfile.update({ where: { id: mai }, data: { salonMemberId: maiMember.id } });
    staffMai = await bearerFor(app, maiUser);
    receptionist = await bearerFor(app, await addSalonMember(prisma, s.salonId, "receptionist"));

    // Linh: monthly from 1 Nov at 10 %, and a raise already scheduled from 20 Dec. Mai: no pay.
    const version = (effectiveFrom: string, amount: bigint, bps: number) => ({
      salonId: s.salonId,
      staffId: linh,
      effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`),
      baseType: "monthly" as const,
      baseAmountMinor: amount,
      commissionBps: bps,
      createdByUserId: s.ownerUserId,
    });
    await prisma.staffPaySetting.createMany({
      data: [version("2026-11-01", 10_000_000n, 1000), version("2026-12-20", 12_000_000n, 1200)],
    });
    // One completed two-staff chain on 2 Dec (Linh 200.000đ, Mai 300.000đ) and an upcoming
    // service of Linh on 22 Dec (100.000đ).
    const booking = async (
      code: string,
      status: "completed" | "confirmed",
      day: string,
      lines: [string, number][],
    ) => {
      const start = new Date(vnAt(day, "10:00"));
      const b = await prisma.booking.create({
        data: {
          salonId: s.salonId,
          referenceCode: code,
          status,
          source: "phone",
          createdByActorType: "salon_member",
          staffId: lines[0]?.[0] ?? linh,
          startsAt: start,
          endsAt: new Date(start.getTime() + lines.length * 30 * 60_000),
          totalPriceMinor: BigInt(lines.reduce((n, [, p]) => n + p, 0)),
          customerName: "Khách",
        },
      });
      for (const [i, [staffId, price]] of lines.entries()) {
        const from = new Date(start.getTime() + i * 30 * 60_000);
        await prisma.bookingService.create({
          data: {
            salonId: s.salonId,
            bookingId: b.id,
            sequence: i + 1,
            serviceId: s.serviceId,
            staffId,
            startsAt: from,
            endsAt: new Date(from.getTime() + 30 * 60_000),
            name: { vi: "Sơn gel" },
            durationMinutes: 30,
            bufferBeforeMinutes: 0,
            bufferAfterMinutes: 0,
            priceMinor: BigInt(price),
          },
        });
      }
    };
    await booking("UX001", "completed", "2026-12-02", [
      [linh, 200_000],
      [mai, 300_000],
    ]);
    await booking("UX002", "confirmed", "2026-12-22", [[linh, 100_000]]);
  });
  afterAll(async () => {
    await app.close();
  });

  it("settings show the version in force today and the next scheduled one", async () => {
    const st = await settings();
    const l = st.staff.find((x) => x.staffId === linh);
    expect(l?.current).toMatchObject({ effectiveFrom: "2026-11-01", commissionPercent: 10 });
    expect(l?.next).toMatchObject({ effectiveFrom: "2026-12-20", commissionPercent: 12 });
    expect(st.staff.find((x) => x.staffId === mai)).toMatchObject({ current: null, next: null });
  });

  it("bulk default %: from the date on, also in later versions; base pay unchanged; audited", async () => {
    const res = await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [linh, mai],
      change: { target: "default", percent: 15 },
    }).expect(200);
    payrollSettingsSchema.parse(res.body);
    const l = await pay(linh);
    expect(l.versions.map((v) => [v.effectiveFrom, v.baseAmount, v.commissionPercent])).toEqual([
      ["2026-12-20", 12_000_000, 15],
      ["2026-12-16", 10_000_000, 15],
      ["2026-11-01", 10_000_000, 10],
    ]);
    // Mai had no pay: "commission only" from that date.
    const m = await pay(mai);
    expect(m.versions).toHaveLength(1);
    expect(m.versions[0]).toMatchObject({
      effectiveFrom: "2026-12-16",
      baseType: "none",
      commissionPercent: 15,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { salonId: s.salonId, action: "payroll.commission_bulk_saved" },
    });
    expect(audit.metadata).toMatchObject({ staff: 2, versions: 3, target: "default" });
    // Who was changed is recorded (ids only, never the rate).
    expect((audit.metadata as { staffIds: string[] }).staffIds.sort()).toEqual([linh, mai].sort());
    expect(JSON.stringify(audit.metadata)).not.toMatch(/"(rate|percent|amount)"/);
  });

  it("bulk own rate per service: set in every later version, then removed", async () => {
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [linh],
      change: {
        target: "override",
        services: [{ serviceId: s.serviceId }],
        rate: { kind: "fixed", amount: 50_000 },
      },
    }).expect(200);
    let l = await pay(linh);
    const later = l.versions.filter((v) => v.effectiveFrom >= "2026-12-16");
    expect(later.map((v) => v.overrides)).toEqual([
      [{ serviceId: s.serviceId, variantId: null, kind: "fixed", percent: null, amount: 50_000 }],
      [{ serviceId: s.serviceId, variantId: null, kind: "fixed", percent: null, amount: 50_000 }],
    ]);
    expect(l.versions.find((v) => v.effectiveFrom === "2026-11-01")?.overrides).toEqual([]);
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [linh],
      change: { target: "override", services: [{ serviceId: s.serviceId }], rate: null },
    }).expect(200);
    l = await pay(linh);
    expect(l.versions.every((v) => v.overrides.length === 0)).toBe(true);
  });

  it("bulk audit names the services; a deleted service cannot get a new own rate", async () => {
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [mai],
      change: {
        target: "override",
        services: [{ serviceId: s.serviceId, variantId: s.variantId }],
        rate: { kind: "percent", percent: 25 },
      },
    }).expect(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { salonId: s.salonId, action: "payroll.commission_bulk_saved" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.metadata).toMatchObject({
      target: "override",
      staffIds: [mai],
      services: [{ serviceId: s.serviceId, variantId: s.variantId }],
      removed: false,
    });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/"(rate|percent|amount)"/);
    // Soft-delete a spare service: a new own rate on it is refused (422)…
    const spare = await prisma.service.create({
      data: {
        salonId: s.salonId,
        name: { vi: "Dịch vụ cũ", en: "Old service" },
        priceAmountMinor: 100_000n,
        durationMinutes: 30,
      },
    });
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [mai],
      change: {
        target: "override",
        services: [{ serviceId: spare.id }],
        rate: { kind: "percent", percent: 5 },
      },
    }).expect(200);
    await prisma.service.update({ where: { id: spare.id }, data: { deletedAt: new Date() } });
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [linh],
      change: {
        target: "override",
        services: [{ serviceId: spare.id }],
        rate: { kind: "percent", percent: 5 },
      },
    }).expect(422);
    // …but the pay sheet can still be saved with the own rate Mai already had on it.
    const m = await pay(mai);
    const v = m.versions.find((x) => x.effectiveFrom === "2026-12-16");
    if (!v) throw new Error("no version");
    await api()
      .put(url(`payroll/staff/${mai}/pay`))
      .set("authorization", owner)
      .send({
        effectiveFrom: v.effectiveFrom,
        baseType: v.baseType,
        baseAmount: v.baseAmount,
        commissionPercent: v.commissionPercent,
        overrides: v.overrides,
      })
      .expect(200);
    // Clean up so the employer-cost figures below stay as computed.
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [mai],
      change: {
        target: "override",
        services: [{ serviceId: s.serviceId, variantId: s.variantId }],
        rate: null,
      },
    }).expect(200);
  });

  it("bulk refuses other salons' staff and services, staff members and closed months", async () => {
    const p = problemSchema.parse(
      (
        await bulk({
          effectiveFrom: "2026-12-16",
          staffIds: [linh, other.staffIds[0]],
          change: { target: "default", percent: 5 },
        }).expect(404)
      ).body,
    );
    expect(p.code).toBe("payroll.staff_not_found");
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [linh],
      change: {
        target: "override",
        services: [{ serviceId: other.serviceId }],
        rate: { kind: "percent", percent: 5 },
      },
    }).expect(422);
    await bulk(
      { effectiveFrom: "2026-12-16", staffIds: [mai], change: { target: "default", percent: 99 } },
      staffMai,
    ).expect(403);
    await bulk({
      effectiveFrom: "2026-12-16",
      staffIds: [linh],
      change: { target: "default", percent: 101 },
    }).expect(400);
    await api().post(url("payroll/months/2026-11/close")).set("authorization", owner).expect(200);
    const closed = problemSchema.parse(
      (
        await bulk({
          effectiveFrom: "2026-11-20",
          staffIds: [linh],
          change: { target: "default", percent: 5 },
        }).expect(409)
      ).body,
    );
    expect(closed.code).toBe("payroll.month_closed");
    // Nothing was written by the refused calls.
    expect((await pay(linh)).versions.map((v) => v.commissionPercent)).toEqual([15, 15, 10]);
  });

  it("own commission lines: the staff member's only; 404 without a staff profile", async () => {
    const mine = myCommissionLinesSchema.parse(
      (
        await api()
          .get(url("payroll/me/lines"))
          .query({ month: "2026-12" })
          .set("authorization", staffMai)
          .expect(200)
      ).body,
    );
    expect(mine.items.map((i) => [i.state, i.amount])).toEqual([["earned", 0]]);
    const p = problemSchema.parse(
      (
        await api()
          .get(url("payroll/me/lines"))
          .query({ month: "2026-12" })
          .set("authorization", receptionist)
          .expect(404)
      ).body,
    );
    expect(p.code).toBe("payroll.staff_not_found");
    // Another salon's path with this salon's token: not a member there.
    await api()
      .get(`/api/v1/salons/${other.salonId}/payroll/me/lines`)
      .query({ month: "2026-12" })
      .set("authorization", staffMai)
      .expect(404);
  });

  it("own lines carry no price or base: under price_minus_cost they would reveal the cost", async () => {
    await prisma.service.update({
      where: { id: s.serviceId },
      data: { costAmountMinor: 120_000n },
    });
    await api()
      .put(url("payroll/settings/commission-base"))
      .set("authorization", owner)
      .send({ base: "price_minus_cost", effectiveFrom: "2026-12-01" })
      .expect(200);
    // The owner (payroll.read ⇒ services.cost.read) sees the base after cost…
    const ownerView = commissionLinesSchema.parse(
      (
        await api()
          .get(url(`payroll/staff/${mai}/lines`))
          .query({ month: "2026-12" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(ownerView.items[0]).toMatchObject({ price: 300_000, base: 180_000 });
    // …the staff member does not: no price, no base, no cost-derived number.
    const res = await api()
      .get(url("payroll/me/lines"))
      .query({ month: "2026-12" })
      .set("authorization", staffMai)
      .expect(200);
    const body = res.body as { items: Record<string, unknown>[] };
    const mine = myCommissionLinesSchema.strict().parse(body);
    expect(mine.items).toHaveLength(1);
    for (const item of body.items) {
      expect(Object.keys(item)).not.toEqual(expect.arrayContaining(["price"]));
      expect(Object.keys(item)).not.toEqual(expect.arrayContaining(["base"]));
    }
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("180000");
    expect(json).not.toContain("120000");
    // Back to the default policy and no cost, so the figures below are unchanged.
    await api()
      .put(url("payroll/settings/commission-base"))
      .set("authorization", owner)
      .send({ base: "price_after_discount", effectiveFrom: "2026-12-01" })
      .expect(200);
    await prisma.service.update({ where: { id: s.serviceId }, data: { costAmountMinor: null } });
  });

  it("employer cost: fixed pro-rated and % day-weighted per version; totals; never to staff", async () => {
    const save = (body: Record<string, unknown>) =>
      api()
        .put(url(`payroll/staff/${mai}/pay`))
        .set("authorization", owner)
        .send(body);
    // 1–15 Dec: monthly 3.100.000đ at 15 % with a fixed employer cost of 620.000đ/month.
    await save({
      effectiveFrom: "2026-12-01",
      baseType: "monthly",
      baseAmount: 3_100_000,
      commissionPercent: 15,
      employerCost: { kind: "fixed", amount: 620_000 },
    }).expect(200);
    // 16–31 Dec (the bulk version): commission only, employer cost 10 % of gross.
    await save({
      effectiveFrom: "2026-12-16",
      baseType: "none",
      commissionPercent: 15,
      employerCost: { kind: "percent", percent: 10 },
    }).expect(200);
    await save({
      effectiveFrom: "2026-12-16",
      baseType: "none",
      employerCost: { kind: "percent", percent: 150 },
    }).expect(400);
    const m = await pay(mai);
    expect(m.versions.find((v) => v.effectiveFrom === "2026-12-01")?.employerCost).toEqual({
      kind: "fixed",
      amount: 620_000,
    });

    const p = await month();
    // Base 3.100.000 × 15/31 = 1.500.000; commission 15 % of 300.000 = 45.000 → gross 1.545.000.
    // Employer: 620.000 × 15/31 = 300.000 + 1.545.000 × 10 % × 16/31 = 79.742.
    expect(row(p, mai)).toMatchObject({
      base: 1_500_000,
      commission: 45_000,
      gross: 1_545_000,
      employerCost: EMPLOYER_CANARY,
      employerCostSet: true,
      realCost: 1_545_000 + EMPLOYER_CANARY,
      total: 1_545_000,
    });
    // Not set: real cost = gross.
    const l = row(p, linh);
    expect(l).toMatchObject({ employerCost: 0, employerCostSet: false });
    expect(l.realCost).toBe(l.gross);
    expect(p.totals.realCost).toBe(p.totals.gross + EMPLOYER_CANARY);
    expect(p.totals.total).toBe(p.rows.reduce((n, r) => n + r.total, 0));

    // Profit: the payroll line uses the real cost; the registry metric carries the extra.
    const profit = profitSchema.parse(
      (
        await api()
          .get(url("insights/profit"))
          .query({ month: "2026-12" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    const b = profit.breakdown;
    expect(b.employerCosts).toBe(EMPLOYER_CANARY);
    expect(profit.metrics["profit.employer_costs"]?.value).toBe(EMPLOYER_CANARY);
    expect(b.payroll).toBe(
      b.basePay + b.commissionEarned + b.commissionProjected + b.adjustments + b.employerCosts,
    );
    expect(profit.metrics["profit.payroll"]?.value).toBe(b.payroll);

    // The staff member's own estimate never carries the employer cost.
    const mine = await api()
      .get(url("payroll/me"))
      .query({ month: "2026-12" })
      .set("authorization", staffMai)
      .expect(200);
    const json = JSON.stringify(mine.body);
    expect(json).not.toMatch(/employer|realCost|gross/i);
    expect(json).not.toContain(String(EMPLOYER_CANARY));
    expect(json).not.toContain(String(1_545_000 + EMPLOYER_CANARY));
    // …and staff cannot read anyone's pay settings.
    await api()
      .get(url(`payroll/staff/${mai}/pay`))
      .set("authorization", staffMai)
      .expect(403);
  });

  it("the export carries gross and real cost next to each other", async () => {
    const csv = payrollExportSchema.parse(
      (
        await api()
          .get(url("payroll/export"))
          .query({ month: "2026-12", format: "csv", locale: "vi" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    const lines = csv.content.split(/\r?\n/);
    const header = (lines[1] ?? "").split(",");
    const g = header.indexOf("Lương (gross)");
    const r = header.indexOf("Chi phí thực tế");
    expect(r).toBe(g + 1);
    const maiLine = lines.find((l) => l.startsWith("Mai,"))?.split(",") ?? [];
    expect(maiLine[g]).toBe("1545000");
    expect(maiLine[r]).toBe(String(1_545_000 + EMPLOYER_CANARY));
  });

  it("a closed month keeps the employer cost from its snapshot", async () => {
    await api().post(url("payroll/months/2026-12/close")).set("authorization", owner).expect(200);
    // Changing the setting afterwards (from January) does not touch December.
    await api()
      .put(url(`payroll/staff/${mai}/pay`))
      .set("authorization", owner)
      .send({ effectiveFrom: "2027-01-01", baseType: "none", employerCost: null })
      .expect(200);
    const p = await month();
    expect(p.status).toBe("closed");
    expect(row(p, mai)).toMatchObject({
      employerCost: EMPLOYER_CANARY,
      realCost: 1_545_000 + EMPLOYER_CANARY,
      projectedEmployerCost: 0,
    });
    const profit = profitSchema.parse(
      (
        await api()
          .get(url("insights/profit"))
          .query({ month: "2026-12" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(profit.breakdown.employerCosts).toBe(EMPLOYER_CANARY);
  });

  it("the check constraint refuses both modes at once", async () => {
    await expect(
      prisma.staffPaySetting.create({
        data: {
          salonId: s.salonId,
          staffId: linh,
          effectiveFrom: new Date("2027-02-01T00:00:00Z"),
          baseType: "none",
          employerCostBps: 1000,
          employerCostAmountMinor: 1n,
          createdByUserId: s.ownerUserId,
        },
      }),
    ).rejects.toThrow();
  });
});
