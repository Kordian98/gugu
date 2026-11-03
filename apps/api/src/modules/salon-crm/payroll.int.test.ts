// Integration: staff pay & commission, monthly payroll, fixed costs and the owner's profit view
// (topic 07, ADR-0016), incl. a two-staff chain split by line (security review L2), close/reopen,
// audited adjustments, month boundaries in the salon timezone, permissions and tenant isolation.
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  commissionLinesSchema,
  insightsSchema,
  myEarningsSchema,
  type PayrollMonth,
  type PayrollRow,
  payrollExportSchema,
  payrollMonthSchema,
  payrollSettingsSchema,
  problemSchema,
  profitSchema,
  salonCostListSchema,
  salonCostSchema,
  staffPaySchema,
} from "@gugu/contracts";
import { PROFIT_METRIC_KEYS } from "@gugu/domain";
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

const D1 = "2026-12-02";
let now = new Date("2026-12-01T08:00:00+07:00");
const clock = { now: () => new Date(now) };
/** A salary nobody else has: it must never appear in assistant tool output. */
const SALARY_CANARY = 9_123_457;

describe("payroll, commissions and profit (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: BookableSalonFixture;
  let other: BookableSalonFixture;
  let owner: string;
  let otherOwner: string;
  let staffMai: string;
  let manager: string;
  let managerMemberId: string;
  let receptionistMemberId: string;
  let linh: string;
  let mai: string;
  let pediId: string;
  let chainId = "";
  let upcomingId = "";

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
    otherOwner = await bearerFor(app, other.ownerUserId);
    const pedi = await prisma.service.create({
      data: {
        salonId: s.salonId,
        name: { vi: "Chăm sóc móng chân", en: "Pedicure" },
        priceAmountMinor: 150_000n,
        costAmountMinor: 20_000n,
        durationMinutes: 45,
      },
    });
    pediId = pedi.id;
    await prisma.service.update({ where: { id: s.serviceId }, data: { costAmountMinor: 30_000n } });
    await prisma.staffService.createMany({
      data: [linh, mai].map((staffId) => ({ salonId: s.salonId, staffId, serviceId: pediId })),
    });
    // Mai has an account (staff role); a manager and a receptionist without payroll access.
    const maiUser = await addSalonMember(prisma, s.salonId, "staff");
    const maiMember = await prisma.salonMember.findFirstOrThrow({
      where: { salonId: s.salonId, userId: maiUser },
    });
    await prisma.staffProfile.update({ where: { id: mai }, data: { salonMemberId: maiMember.id } });
    staffMai = await bearerFor(app, maiUser);
    const mgrUser = await addSalonMember(prisma, s.salonId, "manager");
    managerMemberId = (
      await prisma.salonMember.findFirstOrThrow({ where: { salonId: s.salonId, userId: mgrUser } })
    ).id;
    manager = await bearerFor(app, mgrUser);
    const recUser = await addSalonMember(prisma, s.salonId, "receptionist");
    receptionistMemberId = (
      await prisma.salonMember.findFirstOrThrow({ where: { salonId: s.salonId, userId: recUser } })
    ).id;
  });
  afterAll(async () => {
    await app.close();
  });

  const api = () => request(http(app));
  const url = (p: string) => `/api/v1/salons/${s.salonId}/${p}`;
  const book = async (body: Record<string, unknown>) =>
    (
      (
        await api()
          .post(url("bookings"))
          .set("authorization", owner)
          .set("idempotency-key", `t-${randomUUID()}`)
          .send({ source: "phone", customer: { name: "Khách", phone: "0912 000 111" }, ...body })
          .expect(201)
      ).body as { id: string }
    ).id;
  const move = async (id: string, to: string, at: Date) => {
    now = at;
    await api()
      .post(url(`bookings/${id}/transitions`))
      .set("authorization", owner)
      .set("idempotency-key", `t-${randomUUID()}`)
      .send({ to })
      .expect(200);
  };
  const payroll = async (month = "2026-12", auth = owner) =>
    payrollMonthSchema.parse(
      (await api().get(url("payroll")).query({ month }).set("authorization", auth).expect(200))
        .body,
    );
  const row = (p: PayrollMonth, id: string): PayrollRow => {
    const r = p.rows.find((x) => x.staffId === id);
    if (!r) throw new Error(`no payroll row for ${id}`);
    return r;
  };

  it("pay settings: effective-dated versions with overrides; history kept", async () => {
    const save = (staffId: string, body: Record<string, unknown>) =>
      api()
        .put(url(`payroll/staff/${staffId}/pay`))
        .set("authorization", owner)
        .send(body);
    await save(linh, {
      effectiveFrom: "2026-11-01",
      baseType: "monthly",
      baseAmount: SALARY_CANARY,
      commissionPercent: 10,
    }).expect(200);
    const maiPay = staffPaySchema.parse(
      (
        await save(mai, {
          effectiveFrom: "2026-11-01",
          baseType: "daily",
          baseAmount: 300_000,
          commissionPercent: 20,
          overrides: [
            { serviceId: s.serviceId, variantId: s.variantId, kind: "fixed", amount: 40_000 },
          ],
        }).expect(200)
      ).body,
    );
    expect(maiPay.current).toMatchObject({ baseType: "daily", commissionPercent: 20 });
    expect(maiPay.current?.overrides).toHaveLength(1);
    // Override for another salon's service → 422; duplicate overrides → 400.
    await save(mai, {
      effectiveFrom: "2026-11-01",
      baseType: "daily",
      baseAmount: 1,
      overrides: [{ serviceId: other.serviceId, kind: "percent", percent: 5 }],
    }).expect(422);
    const settings = payrollSettingsSchema.parse(
      (await api().get(url("payroll/settings")).set("authorization", owner).expect(200)).body,
    );
    expect(settings.commissionBase).toBe("price_after_discount");
    expect(settings.managers).toEqual([
      expect.objectContaining({ memberId: managerMemberId, granted: false }),
    ]);
    // Audited without amounts of the salary in names: action + target only.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { salonId: s.salonId, action: "payroll.pay_settings_saved", targetId: linh },
    });
    expect(audit.metadata).toMatchObject({ effectiveFrom: "2026-11-01", baseType: "monthly" });
  });

  it("a two-staff chain splits commission by line; no-show and cancelled earn nothing", async () => {
    now = new Date("2026-12-01T08:00:00+07:00");
    chainId = await book({
      serviceId: s.serviceId,
      staffId: linh,
      startsAt: vnAt(D1, "10:00"),
      nextServices: [{ serviceId: pediId, staffId: mai }],
    });
    const noShow = await book({
      serviceId: s.serviceId,
      staffId: linh,
      startsAt: vnAt(D1, "14:00"),
    });
    const cancelled = await book({
      serviceId: s.serviceId,
      staffId: mai,
      startsAt: vnAt(D1, "15:00"),
    });
    upcomingId = await book({
      serviceId: pediId,
      staffId: mai,
      startsAt: vnAt("2026-12-20", "10:00"),
    });
    await move(chainId, "checked_in", new Date(vnAt(D1, "10:00")));
    await move(chainId, "completed", new Date(vnAt(D1, "11:40")));
    await move(noShow, "no_show", new Date(vnAt(D1, "14:30")));
    await move(cancelled, "cancelled_by_salon", new Date(vnAt(D1, "14:40")));
    now = new Date(vnAt("2026-12-15", "12:00"));

    const p = await payroll();
    expect(p.status).toBe("open");
    expect(row(p, linh)).toMatchObject({
      commission: 20_000,
      commissionLines: 1,
      base: SALARY_CANARY,
    });
    expect(row(p, mai)).toMatchObject({
      commission: 30_000,
      commissionLines: 1,
      projectedCommission: 30_000,
    });
    // Daily pay: 31 scheduled days in December × 300.000đ.
    expect(row(p, mai)).toMatchObject({ baseType: "daily", workingDays: 31, base: 31 * 300_000 });
    const lines = commissionLinesSchema.parse(
      (
        await api()
          .get(url(`payroll/staff/${mai}/lines`))
          .query({ month: "2026-12" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(lines.items.map((l) => [l.state, l.amount])).toEqual([
      ["earned", 30_000],
      ["projected", 30_000],
    ]);

    // Insights (L2): per-staff revenue by line, own scope sees own lines only.
    const ins = (auth: string) =>
      api()
        .get(url("insights"))
        .query({ from: D1, to: D1 })
        .set("authorization", auth)
        .expect(200)
        .then((r) => insightsSchema.parse(r.body));
    const salon = await ins(owner);
    const byStaff = Object.fromEntries(salon.staff.map((x) => [x.staffId, x.estimatedRevenue]));
    expect(byStaff).toEqual({ [linh]: 200_000, [mai]: 150_000 });
    expect(salon.metrics["revenue.estimated"]?.value).toBe(350_000);
    const own = await ins(staffMai);
    expect(own.scope).toBe("own");
    expect(own.metrics["appointments.completed"]?.value).toBe(1);
    expect(own.metrics["revenue.estimated"]?.value).toBe(150_000);
    expect(own.staff.map((x) => x.staffId)).toEqual([mai]);
  });

  it("price after discount: a lower recorded amount is split pro rata over the chain's lines", async () => {
    await api()
      .put(url(`bookings/${chainId}/offline-sale`))
      .set("authorization", owner)
      .send({ amount: 280_000 })
      .expect(200);
    const p = await payroll();
    // 280k of 350k: Linh 160k × 10 %, Mai 120k × 20 %.
    expect(row(p, linh).commission).toBe(16_000);
    expect(row(p, mai).commission).toBe(24_000);
    // Commission base "price minus cost" from 2026-12-01: (160k − 30k) and (120k − 20k).
    await api()
      .put(url("payroll/settings/commission-base"))
      .set("authorization", owner)
      .send({ base: "price_minus_cost", effectiveFrom: "2026-12-01" })
      .expect(200);
    const q = await payroll();
    expect(row(q, linh).commission).toBe(13_000);
    expect(row(q, mai).commission).toBe(20_000);
    await api()
      .put(url("payroll/settings/commission-base"))
      .set("authorization", owner)
      .send({ base: "price_after_discount", effectiveFrom: "2026-12-01" })
      .expect(200);
  });

  it("month boundaries follow the salon timezone", async () => {
    // Completed line on 31 Dec 23:30 (+07) is December; 1 Jan 00:15 (+07) is January.
    const late = await book({
      serviceId: s.serviceId,
      staffId: linh,
      startsAt: vnAt("2026-12-28", "10:00"),
    });
    const early = await book({
      serviceId: s.serviceId,
      staffId: linh,
      startsAt: vnAt("2026-12-29", "10:00"),
    });
    await move(late, "completed", new Date(vnAt("2026-12-28", "10:40")));
    await move(early, "completed", new Date(vnAt("2026-12-29", "10:40")));
    const shift = async (id: string, iso: string) => {
      await prisma.$executeRaw`UPDATE bookings SET starts_at = ${new Date(iso)}, ends_at = ${new Date(iso)}::timestamptz + interval '30 minutes' WHERE id = ${id}::uuid`;
      await prisma.$executeRaw`UPDATE booking_services SET starts_at = ${new Date(iso)}, ends_at = ${new Date(iso)}::timestamptz + interval '30 minutes' WHERE booking_id = ${id}::uuid`;
    };
    await shift(late, "2026-12-31T23:30:00+07:00"); // 16:30 UTC on the 31st
    await shift(early, "2027-01-01T00:15:00+07:00"); // 17:15 UTC on the 31st
    now = new Date(vnAt("2027-01-02", "12:00"));
    const dec = await payroll("2026-12");
    const jan = await payroll("2027-01");
    expect(row(dec, linh).commissionLines).toBe(2);
    expect(row(jan, linh).commissionLines).toBe(1);
    expect(row(jan, linh).commission).toBe(20_000);
    now = new Date(vnAt("2026-12-15", "12:00"));
  });

  it("adjustments need a reason and are audited (without the reason text)", async () => {
    const add = (body: Record<string, unknown>) =>
      api().post(url("payroll/adjustments")).set("authorization", owner).send(body);
    await add({ month: "2026-12", staffId: mai, kind: "bonus", amount: 500_000 }).expect(400);
    await add({
      month: "2026-12",
      staffId: mai,
      kind: "bonus",
      amount: 500_000,
      reason: "  ",
    }).expect(400);
    await add({
      month: "2026-12",
      staffId: other.staffIds[0],
      kind: "bonus",
      amount: 1,
      reason: "x",
    }).expect(404);
    const bonus = (
      await add({
        month: "2026-12",
        staffId: mai,
        kind: "bonus",
        amount: 500_000,
        reason: "Thưởng Tết sớm",
      }).expect(201)
    ).body as { id: string };
    await add({
      month: "2026-12",
      staffId: mai,
      kind: "advance",
      amount: 1_000_000,
      reason: "Ứng lương",
    }).expect(201);
    const wrong = (
      await add({
        month: "2026-12",
        staffId: mai,
        kind: "deduction",
        amount: 50_000,
        reason: "Nhầm",
      }).expect(201)
    ).body as { id: string };
    await api()
      .delete(url(`payroll/adjustments/${wrong.id}`))
      .set("authorization", owner)
      .expect(204);
    const p = await payroll();
    const r = row(p, mai);
    expect(r).toMatchObject({ bonus: 500_000, advance: 1_000_000, deduction: 0 });
    expect(r.total).toBe(r.base + r.commission + 500_000 - 1_000_000);
    const audits = await prisma.auditLog.findMany({
      where: {
        salonId: s.salonId,
        action: { in: ["payroll.adjustment_added", "payroll.adjustment_removed"] },
      },
    });
    expect(audits).toHaveLength(4);
    expect(JSON.stringify(audits.map((a) => a.metadata))).not.toContain("Thưởng");
    expect(
      audits.find((a) => (a.metadata as { id?: string }).id === bonus.id)?.metadata,
    ).toMatchObject({
      kind: "bonus",
      amount: 500_000,
    });
  });

  it("close snapshots the month (read-only), paid marks, audited reopen", async () => {
    await api().post(url("payroll/months/2027-02/close")).set("authorization", owner).expect(409);
    await api()
      .put(url(`payroll/months/2026-12/staff/${mai}/paid`))
      .set("authorization", owner)
      .send({ paidOn: "2026-12-31" })
      .expect(409);
    const before = await payroll();
    const closed = payrollMonthSchema.parse(
      (
        await api()
          .post(url("payroll/months/2026-12/close"))
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(closed.status).toBe("closed");
    expect(closed.totals.total).toBe(before.totals.total);
    await api().post(url("payroll/months/2026-12/close")).set("authorization", owner).expect(409);
    await api()
      .post(url("payroll/adjustments"))
      .set("authorization", owner)
      .send({ month: "2026-12", staffId: mai, kind: "bonus", amount: 1, reason: "late" })
      .expect(409)
      .expect((r) => {
        expect(problemSchema.parse(r.body).code).toBe("payroll.month_closed");
      });
    await api()
      .put(url(`payroll/staff/${linh}/pay`))
      .set("authorization", owner)
      .send({
        effectiveFrom: "2026-12-10",
        baseType: "monthly",
        baseAmount: 1,
        commissionPercent: 50,
      })
      .expect(409);
    // Completing the upcoming booking after closing does not change the closed month.
    await move(upcomingId, "checked_in", new Date(vnAt("2026-12-20", "10:00")));
    await move(upcomingId, "completed", new Date(vnAt("2026-12-20", "10:50")));
    now = new Date(vnAt("2026-12-21", "12:00"));
    expect(row(await payroll(), mai).commission).toBe(row(closed, mai).commission);
    await api()
      .put(url(`payroll/months/2026-12/staff/${mai}/paid`))
      .set("authorization", owner)
      .send({ paidOn: "2026-12-31" })
      .expect(200);
    expect(row(await payroll(), mai).paidOn).toBe("2026-12-31");
    await api()
      .post(url("payroll/months/2026-12/reopen"))
      .set("authorization", owner)
      .send({})
      .expect(400);
    const reopened = payrollMonthSchema.parse(
      (
        await api()
          .post(url("payroll/months/2026-12/reopen"))
          .set("authorization", owner)
          .send({ reason: "Quên thưởng" })
          .expect(200)
      ).body,
    );
    expect(reopened.status).toBe("open");
    expect(row(reopened, mai).commission).toBe(row(closed, mai).commission + 30_000);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { salonId: s.salonId, action: "payroll.month_reopened" },
    });
    expect(audit.metadata).toMatchObject({ month: "2026-12", reason: "Quên thưởng" });
    // Close again for the later checks.
    await api().post(url("payroll/months/2026-12/close")).set("authorization", owner).expect(200);
  });

  it("exports CSV and XLSX (audited)", async () => {
    const csv = payrollExportSchema.parse(
      (
        await api()
          .get(url("payroll/export"))
          .query({ month: "2026-12", format: "csv", locale: "en" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(csv.fileName).toBe("gugu-payroll-2026-12.csv");
    expect(csv.content).toContain("Linh");
    expect(csv.content).toContain(String(SALARY_CANARY));
    const xlsx = payrollExportSchema.parse(
      (
        await api()
          .get(url("payroll/export"))
          .query({ month: "2026-12", format: "xlsx" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(xlsx.encoding).toBe("base64");
    expect(Buffer.from(xlsx.content, "base64").subarray(0, 2).toString()).toBe("PK");
    expect(
      await prisma.auditLog.count({ where: { salonId: s.salonId, action: "payroll.exported" } }),
    ).toBe(2);
  });

  it("permissions: staff see only their own pay; manager needs the owner's grant", async () => {
    await api().get(url("payroll")).set("authorization", staffMai).expect(403);
    await api()
      .get(url(`payroll/staff/${linh}/lines`))
      .query({ month: "2026-12" })
      .set("authorization", staffMai)
      .expect(403);
    await api()
      .get(url(`payroll/staff/${linh}/pay`))
      .set("authorization", staffMai)
      .expect(403);
    await api().get(url("insights/profit")).set("authorization", staffMai).expect(403);
    const mine = myEarningsSchema.parse(
      (
        await api()
          .get(url("payroll/me"))
          .query({ month: "2026-12" })
          .set("authorization", staffMai)
          .expect(200)
      ).body,
    );
    expect(mine).toMatchObject({
      hasProfile: true,
      closed: true,
      baseType: "daily",
      paidOn: "2026-12-31",
    });
    // 120k × 20 % (chain line after the recorded discount) + 150k × 20 % (completed 20 Dec).
    expect(mine.commissionEarned).toBe(54_000);
    expect(JSON.stringify(mine)).not.toContain(String(SALARY_CANARY));
    // Manager: 403 until the owner grants payroll; receptionists cannot be granted.
    await api().get(url("payroll")).set("authorization", manager).expect(403);
    await api()
      .put(url(`members/${managerMemberId}/payroll-access`))
      .set("authorization", manager)
      .send({ granted: true })
      .expect(403);
    await api()
      .put(url(`members/${receptionistMemberId}/payroll-access`))
      .set("authorization", owner)
      .send({ granted: true })
      .expect(409);
    await api()
      .put(url(`members/${managerMemberId}/payroll-access`))
      .set("authorization", owner)
      .send({ granted: true })
      .expect(200);
    await api()
      .get(url("payroll"))
      .query({ month: "2026-12" })
      .set("authorization", manager)
      .expect(200);
    await api()
      .put(url(`members/${managerMemberId}/payroll-access`))
      .set("authorization", owner)
      .send({ granted: false })
      .expect(200);
    await api().get(url("payroll")).set("authorization", manager).expect(403);
  });

  it("tenant isolation: another salon's ids read as not found", async () => {
    await api().get(url("payroll")).set("authorization", otherOwner).expect(404);
    await api()
      .get(url(`payroll/staff/${other.staffIds[0]}/pay`))
      .set("authorization", owner)
      .expect(404);
    await api()
      .get(url(`payroll/staff/${other.staffIds[0]}/lines`))
      .query({ month: "2026-12" })
      .set("authorization", owner)
      .expect(404);
    const foreign = (
      await api()
        .post(`/api/v1/salons/${other.salonId}/costs`)
        .set("authorization", otherOwner)
        .send({ name: "Rent", amount: 1, month: "2026-12" })
        .expect(201)
    ).body as { id: string };
    await api()
      .patch(url(`costs/${foreign.id}`))
      .set("authorization", owner)
      .send({ amount: 2, month: "2026-12" })
      .expect(404);
    const theirs = payrollMonthSchema.parse(
      (
        await api()
          .get(`/api/v1/salons/${other.salonId}/payroll`)
          .query({ month: "2026-12" })
          .set("authorization", otherOwner)
          .expect(200)
      ).body,
    );
    expect(theirs.rows.map((r) => r.staffId).sort()).toEqual([...other.staffIds].sort());
    expect(theirs.totals.commission).toBe(0);
  });

  it("fixed costs: recurring edits apply from a month on; earlier months unchanged", async () => {
    const rent = salonCostSchema.parse(
      (
        await api()
          .post(url("costs"))
          .set("authorization", owner)
          .send({ name: "Tiền thuê", category: "rent", amount: 12_000_000, month: "2026-12" })
          .expect(201)
      ).body,
    );
    await api()
      .post(url("costs"))
      .set("authorization", owner)
      .send({
        name: "Quảng cáo",
        category: "marketing",
        amount: 2_000_000,
        recurring: false,
        month: "2026-12",
      })
      .expect(201);
    await api()
      .patch(url(`costs/${rent.id}`))
      .set("authorization", owner)
      .send({ amount: 13_000_000, month: "2027-01" })
      .expect(200);
    const list = (month: string) =>
      api()
        .get(url("costs"))
        .query({ month })
        .set("authorization", owner)
        .expect(200)
        .then((r) => salonCostListSchema.parse(r.body));
    expect((await list("2026-12")).total).toBe(14_000_000);
    expect((await list("2027-01")).total).toBe(13_000_000);
    await api()
      .post(url("costs"))
      .set("authorization", staffMai)
      .send({ name: "x", amount: 1, month: "2026-12" })
      .expect(403);
  });

  it("profit view: tiles match the registry and add up", async () => {
    now = new Date(vnAt("2026-12-15", "12:00"));
    const p = profitSchema.parse(
      (
        await api()
          .get(url("insights/profit"))
          .query({ month: "2026-12" })
          .set("authorization", owner)
          .expect(200)
      ).body,
    );
    expect(Object.keys(p.metrics).sort()).toEqual([...PROFIT_METRIC_KEYS].sort());
    const b = p.breakdown;
    const v = (k: string) => p.metrics[k]?.value;
    expect(v("profit.net")).toBe(b.netProfit);
    expect(v("profit.revenue_earned")).toBe(b.revenueEarned);
    expect(v("profit.payroll")).toBe(b.payroll);
    expect(b.netProfit).toBe(b.revenueTotal - b.serviceCosts - b.payroll - b.otherCosts);
    expect(p.payrollClosed).toBe(true);
    expect(b.otherCosts).toBe(14_000_000);
    // Completed: chain (recorded 280k), the 28 Dec booking 200k and the 20 Dec pedicure 150k.
    expect(b.revenueEarned).toBe(280_000 + 200_000 + 150_000);
    expect(b.revenueEarnedRecorded).toBe(280_000);
    expect(p.metrics["profit.revenue_earned_recorded"]?.revenueKind).toBe("recorded_offline_sale");
    expect(p.metrics["profit.no_show_allowance"]?.basis).toBe("assumption");
  });

  it("constraints: checks, one override per target, no cross-tenant references", async () => {
    const sqlstate = async (p: Promise<unknown>) => {
      try {
        await p;
        return "ok";
      } catch (e) {
        // Prisma wraps raw errors (P2010); the SQLSTATE is in the message.
        return e instanceof Error ? e.message : String(e);
      }
    };
    const user = s.ownerUserId;
    // payroll_adjustments_valid: amount > 0, reason not blank, month = first day.
    expect(
      await sqlstate(
        prisma.$executeRaw`INSERT INTO payroll_adjustments (id, salon_id, staff_id, month, kind, amount_minor, reason, created_by_user_id)
          VALUES (uuidv7(), ${s.salonId}::uuid, ${mai}::uuid, '2026-12-15', 'bonus', 1, 'x', ${user}::uuid)`,
      ),
    ).toContain("23514");
    expect(
      await sqlstate(
        prisma.$executeRaw`INSERT INTO payroll_adjustments (id, salon_id, staff_id, month, kind, amount_minor, reason, created_by_user_id)
          VALUES (uuidv7(), ${s.salonId}::uuid, ${mai}::uuid, '2026-12-01', 'bonus', 0, 'x', ${user}::uuid)`,
      ),
    ).toContain("23514");
    // staff_pay_settings_valid: commission ≤ 100 %.
    expect(
      await sqlstate(
        prisma.$executeRaw`INSERT INTO staff_pay_settings (id, salon_id, staff_id, effective_from, base_type, base_amount_minor, commission_bps, created_by_user_id, updated_at)
          VALUES (uuidv7(), ${s.salonId}::uuid, ${mai}::uuid, '2030-01-01', 'none', 0, 10001, ${user}::uuid, now())`,
      ),
    ).toContain("23514");
    // salon_costs_valid: a one-off cost has no end month.
    expect(
      await sqlstate(
        prisma.$executeRaw`INSERT INTO salon_costs (id, salon_id, name, category, amount_minor, recurring, start_month, end_month, created_by_user_id, updated_at)
          VALUES (uuidv7(), ${s.salonId}::uuid, 'x', 'other', 1, false, '2026-12-01', '2027-01-01', ${user}::uuid, now())`,
      ),
    ).toContain("23514");
    // One override per (version, service, variant) — NULL variant included.
    const version = await prisma.staffPaySetting.findFirstOrThrow({
      where: { salonId: s.salonId, staffId: mai },
    });
    const override = (variantId: string | null) =>
      prisma.$executeRaw`INSERT INTO staff_commission_overrides (id, salon_id, pay_setting_id, service_id, variant_id, kind, bps)
        VALUES (uuidv7(), ${s.salonId}::uuid, ${version.id}::uuid, ${pediId}::uuid, ${variantId}::uuid, 'percent', 500)`;
    expect(await sqlstate(override(null))).toBe("ok");
    expect(await sqlstate(override(null))).toContain("23505");
    // staff_commission_overrides_valid: a percentage carries no amount.
    expect(
      await sqlstate(
        prisma.$executeRaw`INSERT INTO staff_commission_overrides (id, salon_id, pay_setting_id, service_id, variant_id, kind, bps, amount_minor)
          VALUES (uuidv7(), ${s.salonId}::uuid, ${version.id}::uuid, ${s.serviceId}::uuid, NULL, 'percent', 500, 1)`,
      ),
    ).toContain("23514");
    // Composite FK: another salon's staff cannot be referenced.
    expect(
      await sqlstate(
        prisma.$executeRaw`INSERT INTO payroll_adjustments (id, salon_id, staff_id, month, kind, amount_minor, reason, created_by_user_id)
          VALUES (uuidv7(), ${s.salonId}::uuid, ${other.staffIds[0]}::uuid, '2027-01-01', 'bonus', 1, 'x', ${user}::uuid)`,
      ),
    ).toContain("23503");
  });
});
