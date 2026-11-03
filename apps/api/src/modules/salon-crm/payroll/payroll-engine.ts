import type { PayrollMonth, PayrollRow, PayrollSnapshot } from "@gugu/contracts";
import {
  basePayForMonth,
  type CommissionLineResult,
  commissionTotalsByStaff,
  computeCommissions,
  monthOf,
  monthProgress,
  payrollLine,
  policyAt,
  toLocal,
} from "@gugu/domain";
import { payrollSnapshotSchema } from "@gugu/contracts";
import type { MonthData, MonthLine } from "./payroll-data";

/**
 * Glue between the loaded month and the pure engine (packages/domain/src/payroll). A pending or
 * confirmed line whose start has passed without being completed is stale (most likely an
 * unmarked no-show): it is neither earned nor projected.
 */
export function freshLines(lines: readonly MonthLine[], now: Date): MonthLine[] {
  return lines.map((l) =>
    (l.status === "pending" || l.status === "confirmed") && l.startsAt.getTime() < now.getTime()
      ? { ...l, status: "stale" }
      : l,
  );
}

export interface ComputedMonth {
  dto: PayrollMonth;
  results: CommissionLineResult[];
  /** Lines of this month (attributed), after the stale rule. */
  lines: MonthLine[];
}

/** Live payroll for an open month, or the snapshot of a closed one (payouts stay live). */
export function computeMonth(data: MonthData, now: Date): ComputedMonth {
  const today = toLocal(now.getTime(), data.timeZone).date;
  const all = freshLines(data.lines, now);
  const results = computeCommissions(all, data.pay, data.policy).filter(
    (r) => monthOf(r.date) === data.month,
  );
  const lines = all.filter((l) => monthOf(l.date) === data.month);
  const totals = commissionTotalsByStaff(results);
  const paid = new Map(data.closed?.payouts.map((p) => [p.staffId, p.paidOn]) ?? []);
  const isClosed = data.closed?.closedAt != null;
  const phase = monthProgress(data.month, today).phase;
  const commissionBase = policyAt(data.policy, `${data.month}-01`);

  let rows: PayrollRow[];
  if (isClosed) {
    const snap = payrollSnapshotSchema.parse(data.closed?.snapshot);
    rows = snap.rows.map((r) => ({ ...r, paidOn: paid.get(r.staffId) ?? null }));
  } else {
    rows = [];
    for (const s of data.staff) {
      const versions = data.pay.get(s.id) ?? [];
      const base = basePayForMonth({
        versions,
        month: data.month,
        employedUntil: s.employedUntil,
        workMinutesByDate: s.workMinutesByDate,
      });
      const c = totals.get(s.id) ?? { earned: 0, projected: 0, earnedLines: 0, projectedLines: 0 };
      const adj = data.adjustments.filter((a) => a.staffId === s.id);
      // Removed staff only appear for months they still have something in.
      if (s.removed && base.employedDays === 0 && c.earnedLines + c.projectedLines === 0) {
        if (adj.length === 0) continue;
      }
      const line = payrollLine(base.amount, c.earned, adj);
      rows.push({
        staffId: s.id,
        displayName: s.displayName,
        removed: s.removed,
        baseType: base.baseType,
        base: base.amount,
        employedDays: base.employedDays,
        workingDays: base.workingDays,
        workMinutes: base.workMinutes,
        commission: c.earned,
        commissionLines: c.earnedLines,
        projectedCommission: c.projected,
        bonus: line.bonus,
        deduction: line.deduction,
        advance: line.advance,
        total: line.total,
        paidOn: paid.get(s.id) ?? null,
      });
    }
  }
  const sum = (k: "base" | "commission" | "bonus" | "deduction" | "advance" | "total") =>
    rows.reduce((n, r) => n + r[k], 0);
  return {
    results,
    lines,
    dto: {
      month: data.month,
      phase,
      status: isClosed ? "closed" : "open",
      closedAt: data.closed?.closedAt?.toISOString() ?? null,
      reopenedAt: data.closed?.reopenedAt?.toISOString() ?? null,
      commissionBase,
      rows,
      totals: {
        base: sum("base"),
        commission: sum("commission"),
        bonus: sum("bonus"),
        deduction: sum("deduction"),
        advance: sum("advance"),
        total: sum("total"),
      },
      adjustments: data.adjustments.map((a) => ({
        id: a.id,
        staffId: a.staffId,
        kind: a.kind,
        amount: a.amount,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      })),
    },
  };
}

export function snapshotOf(dto: PayrollMonth): PayrollSnapshot {
  return {
    version: 1,
    commissionBase: dto.commissionBase,
    rows: dto.rows.map((r) => ({
      staffId: r.staffId,
      displayName: r.displayName,
      removed: r.removed,
      baseType: r.baseType,
      base: r.base,
      employedDays: r.employedDays,
      workingDays: r.workingDays,
      workMinutes: r.workMinutes,
      commission: r.commission,
      commissionLines: r.commissionLines,
      projectedCommission: 0,
      bonus: r.bonus,
      deduction: r.deduction,
      advance: r.advance,
      total: r.total,
    })),
    totals: dto.totals,
    payrollCost: dto.totals.base + dto.totals.commission + dto.totals.bonus - dto.totals.deduction,
  };
}
