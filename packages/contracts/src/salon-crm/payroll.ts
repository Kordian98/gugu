import { z } from "zod";
import { uuidV7Schema } from "../common/ids";
import { revenueKindSchema } from "../assistant/pii-free";

/**
 * Staff pay & commission, monthly payroll, fixed costs and the owner's "This month" profit view
 * (topic 07, owner request 2026-11-04, ADR-0016). Enum values mirror packages/domain/src/payroll
 * (parity test in apps/api). Money is whole VND. Bookkeeping only: GuGu pays nobody and computes
 * no tax or social insurance; every figure is an estimate before tax and insurance.
 */

export const BASE_PAY_TYPE_VALUES = ["none", "monthly", "daily", "hourly"] as const;
export const basePayTypeSchema = z.enum(BASE_PAY_TYPE_VALUES);
export type BasePayTypeValue = z.infer<typeof basePayTypeSchema>;

export const COMMISSION_BASE_VALUES = ["price_after_discount", "price_minus_cost"] as const;
export const commissionBaseSchema = z.enum(COMMISSION_BASE_VALUES);

export const ADJUSTMENT_KIND_VALUES = ["bonus", "deduction", "advance"] as const;
export const adjustmentKindSchema = z.enum(ADJUSTMENT_KIND_VALUES);

export const SALON_COST_CATEGORIES = [
  "rent",
  "utilities",
  "products",
  "marketing",
  "other",
] as const;
export const salonCostCategorySchema = z.enum(SALON_COST_CATEGORIES);

/** Salon-local calendar month `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalid_month");
export const monthQuerySchema = z.object({ month: monthSchema.optional() });
export type MonthQuery = z.infer<typeof monthQuerySchema>;

const vnd = z.number().int().min(0).max(10_000_000_000);
const signedVnd = z.number().int();
const percent = z.number().min(0).max(100);
const localDate = z.iso.date();

// ─── Pay settings ──────────────────────────────────────────────────────────────────────────

export const commissionOverrideSchema = z
  .object({
    serviceId: uuidV7Schema,
    variantId: uuidV7Schema.nullable().default(null),
    kind: z.enum(["percent", "fixed"]),
    /** For kind percent: 0–100 (two decimals). */
    percent: percent.nullable().default(null),
    /** For kind fixed: VND per service performed. */
    amount: vnd.nullable().default(null),
  })
  .refine((o) => (o.kind === "percent" ? o.percent !== null : o.amount !== null), {
    path: ["kind"],
    message: "rate_required",
  });
export type CommissionOverride = z.infer<typeof commissionOverrideSchema>;

export const payVersionInputSchema = z
  .object({
    effectiveFrom: localDate,
    baseType: basePayTypeSchema,
    baseAmount: vnd.default(0),
    commissionPercent: percent.default(0),
    overrides: z.array(commissionOverrideSchema).max(200).default([]),
  })
  .refine(
    (v) =>
      new Set(v.overrides.map((o) => `${o.serviceId}:${o.variantId ?? ""}`)).size ===
      v.overrides.length,
    { path: ["overrides"], message: "duplicate_override" },
  );
export type PayVersionInput = z.input<typeof payVersionInputSchema>;

export const payVersionSchema = z.object({
  id: uuidV7Schema,
  effectiveFrom: z.string(),
  baseType: basePayTypeSchema,
  baseAmount: vnd,
  commissionPercent: percent,
  overrides: z.array(commissionOverrideSchema),
  createdAt: z.iso.datetime(),
});
export type PayVersion = z.infer<typeof payVersionSchema>;

export const staffPaySchema = z.object({
  staffId: uuidV7Schema,
  displayName: z.string(),
  /** Version in force today (salon timezone), null before the first. */
  current: payVersionSchema.nullable(),
  /** Newest first; past versions stay so earlier months never change. */
  versions: z.array(payVersionSchema),
});
export type StaffPay = z.infer<typeof staffPaySchema>;

export const commissionPolicyInputSchema = z.object({
  base: commissionBaseSchema,
  effectiveFrom: localDate,
});
export type CommissionPolicyInput = z.infer<typeof commissionPolicyInputSchema>;

export const payrollSettingsSchema = z.object({
  commissionBase: commissionBaseSchema,
  history: z.array(z.object({ effectiveFrom: z.string(), base: commissionBaseSchema })),
  staff: z.array(
    z.object({
      staffId: uuidV7Schema,
      displayName: z.string(),
      current: payVersionSchema.nullable(),
    }),
  ),
  /** Managers and whether the owner let them see/manage payroll (override grant). */
  managers: z.array(
    z.object({ memberId: uuidV7Schema, displayName: z.string(), granted: z.boolean() }),
  ),
});
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;

export const managerAccessInputSchema = z.object({ granted: z.boolean() });

// ─── Payroll month ─────────────────────────────────────────────────────────────────────────

export const payrollRowSchema = z.object({
  staffId: uuidV7Schema,
  displayName: z.string(),
  /** The staff profile was removed (kept for months it worked). */
  removed: z.boolean(),
  baseType: basePayTypeSchema.nullable(),
  base: vnd,
  employedDays: z.number().int(),
  workingDays: z.number().int(),
  workMinutes: z.number().int(),
  /** Earned on completed services this month. */
  commission: vnd,
  commissionLines: z.number().int(),
  /** Expected on services still to come (open months only; 0 once closed). */
  projectedCommission: vnd,
  bonus: vnd,
  deduction: vnd,
  advance: vnd,
  /** base + commission + bonus − deduction − advance. */
  total: signedVnd,
  paidOn: z.string().nullable(),
});
export type PayrollRow = z.infer<typeof payrollRowSchema>;

export const payrollTotalsSchema = z.object({
  base: vnd,
  commission: vnd,
  bonus: vnd,
  deduction: vnd,
  advance: vnd,
  total: signedVnd,
});

export const payrollAdjustmentSchema = z.object({
  id: uuidV7Schema,
  staffId: uuidV7Schema,
  kind: adjustmentKindSchema,
  amount: vnd,
  reason: z.string(),
  createdAt: z.iso.datetime(),
});
export type PayrollAdjustment = z.infer<typeof payrollAdjustmentSchema>;

export const payrollMonthSchema = z.object({
  month: monthSchema,
  phase: z.enum(["past", "current", "future"]),
  status: z.enum(["open", "closed"]),
  closedAt: z.iso.datetime().nullable(),
  reopenedAt: z.iso.datetime().nullable(),
  commissionBase: commissionBaseSchema,
  rows: z.array(payrollRowSchema),
  totals: payrollTotalsSchema,
  adjustments: z.array(payrollAdjustmentSchema),
});
export type PayrollMonth = z.infer<typeof payrollMonthSchema>;

/** Stored in payroll_months.snapshot at closing. */
export const payrollSnapshotSchema = z.object({
  version: z.literal(1),
  commissionBase: commissionBaseSchema,
  rows: z.array(payrollRowSchema.omit({ paidOn: true })),
  totals: payrollTotalsSchema,
  /** Service costs and commission totals for the profit view of a closed month. */
  payrollCost: signedVnd,
});
export type PayrollSnapshot = z.infer<typeof payrollSnapshotSchema>;

export const commissionLineSchema = z.object({
  lineId: uuidV7Schema,
  bookingId: uuidV7Schema,
  date: z.string(),
  service: z.object({ vi: z.string(), en: z.string() }),
  state: z.enum(["earned", "projected"]),
  price: vnd,
  base: vnd,
  rate: z
    .object({
      kind: z.enum(["percent", "fixed"]),
      percent: z.number().nullable(),
      amount: z.number().nullable(),
    })
    .nullable(),
  amount: vnd,
});
export const commissionLinesSchema = z.object({
  month: monthSchema,
  staffId: uuidV7Schema,
  items: z.array(commissionLineSchema),
});
export type CommissionLines = z.infer<typeof commissionLinesSchema>;

export const payrollStaffParamsSchema = z.object({ salonId: uuidV7Schema, staffId: uuidV7Schema });
export const payrollMonthParamsSchema = z.object({ salonId: uuidV7Schema, month: monthSchema });
export const payrollMonthStaffParamsSchema = payrollMonthParamsSchema.extend({
  staffId: uuidV7Schema,
});
export const payrollAdjustmentParamsSchema = z.object({
  salonId: uuidV7Schema,
  adjustmentId: uuidV7Schema,
});

export const adjustmentInputSchema = z.object({
  month: monthSchema,
  staffId: uuidV7Schema,
  kind: adjustmentKindSchema,
  amount: vnd.min(1),
  reason: z.string().trim().min(1).max(300),
});
export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;

export const reasonInputSchema = z.object({ reason: z.string().trim().min(1).max(300) });
export const paidInputSchema = z.object({ paidOn: localDate });

export const exportQuerySchema = z.object({
  month: monthSchema,
  format: z.enum(["csv", "xlsx"]).default("csv"),
  locale: z.enum(["vi", "en"]).default("vi"),
});
export type PayrollExportQuery = z.infer<typeof exportQuerySchema>;

/** File handed to the browser (bearer API; no cookies on downloads). xlsx is base64. */
export const payrollExportSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  encoding: z.enum(["utf8", "base64"]),
  content: z.string(),
});
export type PayrollExport = z.infer<typeof payrollExportSchema>;

/** A staff member's own estimate (payroll.self.read): never anyone else's. */
export const myEarningsSchema = z.object({
  month: monthSchema,
  phase: z.enum(["past", "current", "future"]),
  hasProfile: z.boolean(),
  closed: z.boolean(),
  paidOn: z.string().nullable(),
  baseType: basePayTypeSchema.nullable(),
  base: vnd,
  commissionEarned: vnd,
  commissionProjected: vnd,
  earnedLines: z.number().int(),
  projectedLines: z.number().int(),
  bonus: vnd,
  deduction: vnd,
  advance: vnd,
  /** base + earned + projected + bonus − deduction − advance. */
  totalEstimate: signedVnd,
});
export type MyEarnings = z.infer<typeof myEarningsSchema>;

// ─── Fixed costs ───────────────────────────────────────────────────────────────────────────

export const salonCostSchema = z.object({
  id: uuidV7Schema,
  name: z.string(),
  category: salonCostCategorySchema,
  amount: vnd,
  recurring: z.boolean(),
  startMonth: monthSchema,
  endMonth: monthSchema.nullable(),
});
export type SalonCost = z.infer<typeof salonCostSchema>;

export const salonCostListSchema = z.object({
  month: monthSchema,
  items: z.array(salonCostSchema),
  total: vnd,
});
export type SalonCostList = z.infer<typeof salonCostListSchema>;

export const salonCostInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: salonCostCategorySchema.default("other"),
  amount: vnd,
  recurring: z.boolean().default(true),
  /** First month it applies to (one-off: the only month). */
  month: monthSchema,
});
export type SalonCostInput = z.input<typeof salonCostInputSchema>;

/** Edit from `month` on: a recurring cost started earlier is split so past months keep the old value. */
export const salonCostUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  category: salonCostCategorySchema.optional(),
  amount: vnd.optional(),
  month: monthSchema,
});
export type SalonCostUpdate = z.input<typeof salonCostUpdateSchema>;
export const salonCostParamsSchema = z.object({ salonId: uuidV7Schema, costId: uuidV7Schema });

// ─── Profit view ───────────────────────────────────────────────────────────────────────────

export const profitMetricValueSchema = z.object({
  value: z.number().nullable(),
  unit: z.enum(["count", "ratio", "vnd"]),
  revenueKind: revenueKindSchema.nullable(),
  basis: z.enum(["actual", "projected", "mixed", "assumption"]),
});

export const profitSchema = z.object({
  month: monthSchema,
  phase: z.enum(["past", "current", "future"]),
  elapsedDays: z.number().int(),
  daysInMonth: z.number().int(),
  /** Keys = the `profit.*` entries of the metric catalogue (tested). */
  metrics: z.record(z.string(), profitMetricValueSchema),
  breakdown: z.object({
    revenueEarned: signedVnd,
    revenueEarnedRecorded: signedVnd,
    revenueUpcoming: signedVnd,
    noShowAllowance: signedVnd,
    revenueTotal: signedVnd,
    serviceCostsActual: signedVnd,
    serviceCostsProjected: signedVnd,
    serviceCosts: signedVnd,
    basePay: signedVnd,
    commissionEarned: signedVnd,
    commissionProjected: signedVnd,
    adjustments: signedVnd,
    payroll: signedVnd,
    otherCosts: signedVnd,
    grossProfit: signedVnd,
    netProfit: signedVnd,
    grossMargin: z.number().nullable(),
    netMargin: z.number().nullable(),
    monthProgress: z.number(),
  }),
  noShow: z.object({
    rate: z.number().nullable(),
    /** Finished appointments in the last 90 days the rate is based on. */
    sample: z.number().int(),
  }),
  servicesWithoutCost: z.number().int(),
  /** Payroll figures come from the closed month's snapshot. */
  payrollClosed: z.boolean(),
  costs: z.array(salonCostSchema),
});
export type Profit = z.infer<typeof profitSchema>;

export const PAYROLL_ERRORS = {
  monthClosed: "payroll.month_closed",
  monthNotClosed: "payroll.month_not_closed",
  monthInFuture: "payroll.month_in_future",
  staffNotFound: "payroll.staff_not_found",
  invalidOverride: "payroll.invalid_override",
  adjustmentNotFound: "payroll.adjustment_not_found",
  costNotFound: "payroll.cost_not_found",
  notManager: "payroll.not_a_manager",
} as const;
