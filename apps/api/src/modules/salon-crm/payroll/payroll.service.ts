import { Injectable } from "@nestjs/common";
import {
  type AdjustmentInput,
  type CommissionLines,
  type MyEarnings,
  PAYROLL_ERRORS,
  type PayrollAdjustment,
  type PayrollMonth,
} from "@gugu/contracts";
import { type Month, monthOf, monthProgress, payrollLine, toLocal } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { computeMonth, snapshotOf } from "./payroll-engine";
import { monthDate, PayrollClock, PayrollData } from "./payroll-data";

type Tx = Prisma.TransactionClient;

export const payrollError = {
  closed: () => new AppError(409, PAYROLL_ERRORS.monthClosed, "Payroll month is closed"),
  notClosed: () => new AppError(409, PAYROLL_ERRORS.monthNotClosed, "Payroll month is not closed"),
  future: () => new AppError(409, PAYROLL_ERRORS.monthInFuture, "Month has not started"),
  staff: () => new AppError(404, PAYROLL_ERRORS.staffNotFound, "Staff member not found"),
  adjustment: () => new AppError(404, PAYROLL_ERRORS.adjustmentNotFound, "Adjustment not found"),
};

/** Serialises payroll writes of one salon (close vs. adjustment vs. settings change). */
export async function lockPayroll(tx: Tx, salonId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payroll:${salonId}`}, 0))`;
}

/** 409 when the month is closed (read inside the locked transaction). */
export async function assertMonthOpen(tx: Tx, salonId: string, month: Month): Promise<void> {
  const row = await tx.payrollMonth.findUnique({
    where: { salonId_month: { salonId, month: monthDate(month) } },
    select: { closedAt: true },
  });
  if (row?.closedAt) throw payrollError.closed();
}

/**
 * Monthly payroll (ADR-0016): live computation for open months, the snapshot for closed ones.
 * Every query is scoped by the guard's `salonId`; a staff id of another salon reads as 404.
 * Bookkeeping only: "paid on" is a note, no money moves; no tax or social insurance.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: PayrollData,
    private readonly audit: AuditService,
    private readonly clock: PayrollClock,
  ) {}

  async currentMonth(salonId: string): Promise<Month> {
    return monthOf(await this.data.today(salonId, this.clock.now()));
  }

  async month(ctx: SalonContext, month: Month): Promise<PayrollMonth> {
    const data = await this.data.load(ctx.salonId, month);
    return computeMonth(data, this.clock.now()).dto;
  }

  async lines(ctx: SalonContext, month: Month, staffId: string): Promise<CommissionLines> {
    await this.assertStaff(ctx.salonId, staffId, true);
    const data = await this.data.load(ctx.salonId, month, staffId);
    const c = computeMonth(data, this.clock.now());
    const byId = new Map(c.lines.map((l) => [l.lineId, l]));
    const items = c.results
      .filter((r) => r.staffId === staffId && r.state !== "none")
      .map((r) => {
        const l = byId.get(r.lineId);
        const rate = r.rate;
        return {
          lineId: r.lineId,
          bookingId: r.bookingId,
          date: r.date,
          service: l?.name ?? { vi: "", en: "" },
          state: r.state === "earned" ? ("earned" as const) : ("projected" as const),
          price: l?.price ?? 0,
          base: r.base,
          rate: rate
            ? rate.kind === "percent"
              ? { kind: "percent" as const, percent: rate.bps / 100, amount: null }
              : { kind: "fixed" as const, percent: null, amount: rate.amount }
            : null,
          amount: r.amount,
        };
      });
    return { month, staffId, items };
  }

  /** The member's own commission lines (payroll.self.read); 404 without a staff profile here. */
  async myLines(ctx: SalonContext, userId: string, month: Month): Promise<CommissionLines> {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { salonId: ctx.salonId, deletedAt: null, member: { userId } },
      select: { id: true },
    });
    if (!profile) throw payrollError.staff();
    return this.lines(ctx, month, profile.id);
  }

  /** The member's own estimate (payroll.self.read). Never takes a staff id from the client. */
  async mine(ctx: SalonContext, userId: string, month: Month): Promise<MyEarnings> {
    const now = this.clock.now();
    const today = await this.data.today(ctx.salonId, now);
    const phase = monthProgress(month, today).phase;
    const profile = await this.prisma.staffProfile.findFirst({
      where: { salonId: ctx.salonId, deletedAt: null, member: { userId } },
      select: { id: true },
    });
    const empty: MyEarnings = {
      month,
      phase,
      hasProfile: false,
      closed: false,
      paidOn: null,
      baseType: null,
      base: 0,
      commissionEarned: 0,
      commissionProjected: 0,
      earnedLines: 0,
      projectedLines: 0,
      bonus: 0,
      deduction: 0,
      advance: 0,
      totalEstimate: 0,
    };
    if (!profile) return empty;
    const data = await this.data.load(ctx.salonId, month, profile.id);
    const c = computeMonth(data, now);
    const row = c.dto.rows.find((r) => r.staffId === profile.id);
    const mine = c.results.filter((r) => r.staffId === profile.id);
    const projected = c.dto.status === "closed" ? 0 : (row?.projectedCommission ?? 0);
    const line = payrollLine(row?.base ?? 0, (row?.commission ?? 0) + projected, [
      { kind: "bonus", amount: row?.bonus ?? 0 },
      { kind: "deduction", amount: row?.deduction ?? 0 },
      { kind: "advance", amount: row?.advance ?? 0 },
    ]);
    return {
      ...empty,
      hasProfile: true,
      closed: c.dto.status === "closed",
      paidOn: row?.paidOn ?? null,
      baseType: row?.baseType ?? null,
      base: row?.base ?? 0,
      commissionEarned: row?.commission ?? 0,
      commissionProjected: projected,
      earnedLines: row?.commissionLines ?? mine.filter((r) => r.state === "earned").length,
      projectedLines:
        c.dto.status === "closed" ? 0 : mine.filter((r) => r.state === "projected").length,
      bonus: line.bonus,
      deduction: line.deduction,
      advance: line.advance,
      totalEstimate: line.total,
    };
  }

  async addAdjustment(
    ctx: SalonContext,
    userId: string,
    input: AdjustmentInput,
  ): Promise<PayrollAdjustment> {
    return this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      await this.assertStaff(ctx.salonId, input.staffId, true, tx);
      await assertMonthOpen(tx, ctx.salonId, input.month);
      const row = await tx.payrollAdjustment.create({
        data: {
          salonId: ctx.salonId,
          staffId: input.staffId,
          month: monthDate(input.month),
          kind: input.kind,
          amountMinor: BigInt(input.amount),
          reason: input.reason,
          createdByUserId: userId,
        },
      });
      await this.audit.record(
        {
          action: "payroll.adjustment_added",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "staff",
          targetId: input.staffId,
          // Kind and amount only: the reason is free text and stays out of the audit log.
          metadata: { month: input.month, kind: input.kind, amount: input.amount, id: row.id },
        },
        tx,
      );
      return {
        id: row.id,
        staffId: row.staffId,
        kind: row.kind,
        amount: Number(row.amountMinor),
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async removeAdjustment(ctx: SalonContext, userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      const row = await tx.payrollAdjustment.findFirst({
        where: { id, salonId: ctx.salonId, deletedAt: null },
      });
      if (!row) throw payrollError.adjustment();
      const month = row.month.toISOString().slice(0, 7);
      await assertMonthOpen(tx, ctx.salonId, month);
      await tx.payrollAdjustment.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), deletedByUserId: userId },
      });
      await this.audit.record(
        {
          action: "payroll.adjustment_removed",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "staff",
          targetId: row.staffId,
          metadata: { month, kind: row.kind, amount: Number(row.amountMinor), id: row.id },
        },
        tx,
      );
    });
  }

  /** Snapshots the month (read-only afterwards). A month that has not started cannot be closed. */
  async close(ctx: SalonContext, userId: string, month: Month): Promise<PayrollMonth> {
    const now = this.clock.now();
    const today = await this.data.today(ctx.salonId, now);
    if (monthProgress(month, today).phase === "future") throw payrollError.future();
    await this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      await assertMonthOpen(tx, ctx.salonId, month);
      const data = await this.data.load(ctx.salonId, month);
      const dto = computeMonth({ ...data, closed: null }, now).dto;
      const snapshot = snapshotOf(dto);
      await tx.payrollMonth.upsert({
        where: { salonId_month: { salonId: ctx.salonId, month: monthDate(month) } },
        create: {
          salonId: ctx.salonId,
          month: monthDate(month),
          closedAt: now,
          closedByUserId: userId,
          snapshot,
        },
        update: { closedAt: now, closedByUserId: userId, snapshot },
      });
      await this.audit.record(
        {
          action: "payroll.month_closed",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "payroll_month",
          metadata: { month, people: dto.rows.length, total: dto.totals.total },
        },
        tx,
      );
    });
    return this.month(ctx, month);
  }

  /** Back to live figures; the reason is required and audited ("paid on" marks are kept). */
  async reopen(
    ctx: SalonContext,
    userId: string,
    month: Month,
    reason: string,
  ): Promise<PayrollMonth> {
    await this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      const row = await tx.payrollMonth.findUnique({
        where: { salonId_month: { salonId: ctx.salonId, month: monthDate(month) } },
      });
      if (!row?.closedAt) throw payrollError.notClosed();
      await tx.payrollMonth.update({
        where: { id: row.id },
        data: { closedAt: null, reopenedAt: this.clock.now(), reopenedByUserId: userId },
      });
      await this.audit.record(
        {
          action: "payroll.month_reopened",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "payroll_month",
          targetId: row.id,
          // The reason is the owner's own words about their bookkeeping, not client data.
          metadata: { month, reason: reason.slice(0, 300) },
        },
        tx,
      );
    });
    return this.month(ctx, month);
  }

  async markPaid(
    ctx: SalonContext,
    userId: string,
    month: Month,
    staffId: string,
    paidOn: string | null,
  ): Promise<PayrollMonth> {
    await this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      await this.assertStaff(ctx.salonId, staffId, true, tx);
      const row = await tx.payrollMonth.findUnique({
        where: { salonId_month: { salonId: ctx.salonId, month: monthDate(month) } },
      });
      if (!row?.closedAt) throw payrollError.notClosed();
      if (paidOn === null) {
        await tx.payrollPayout.deleteMany({
          where: { salonId: ctx.salonId, payrollMonthId: row.id, staffId },
        });
      } else {
        await tx.payrollPayout.upsert({
          where: { payrollMonthId_staffId: { payrollMonthId: row.id, staffId } },
          create: {
            salonId: ctx.salonId,
            payrollMonthId: row.id,
            staffId,
            paidOn: new Date(`${paidOn}T00:00:00Z`),
            markedByUserId: userId,
          },
          update: { paidOn: new Date(`${paidOn}T00:00:00Z`), markedByUserId: userId },
        });
      }
      await this.audit.record(
        {
          action: paidOn === null ? "payroll.paid_mark_removed" : "payroll.marked_paid",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "staff",
          targetId: staffId,
          metadata: { month, paidOn },
        },
        tx,
      );
    });
    return this.month(ctx, month);
  }

  async recordExport(ctx: SalonContext, month: Month, format: string, rows: number) {
    await this.audit.record({
      action: "payroll.exported",
      salonId: ctx.salonId,
      organizationId: ctx.organizationId,
      targetType: "payroll_month",
      metadata: { month, format, rows },
    });
  }

  /** A staff profile of this salon (removed ones allowed for history); otherwise 404. */
  async assertStaff(
    salonId: string,
    staffId: string,
    includeRemoved = false,
    tx?: Tx,
  ): Promise<{ id: string; displayName: string }> {
    const s = await (tx ?? this.prisma).staffProfile.findFirst({
      where: { id: staffId, salonId, ...(includeRemoved ? {} : { deletedAt: null }) },
      select: { id: true, displayName: true },
    });
    if (!s) throw payrollError.staff();
    return s;
  }

  localToday(salonId: string): Promise<string> {
    return this.data.today(salonId, this.clock.now());
  }

  now(): Date {
    return this.clock.now();
  }

  /** Salon-local date of an instant (tests and callers that only hold a Date). */
  static local(at: Date, timeZone: string): string {
    return toLocal(at.getTime(), timeZone).date;
  }
}
