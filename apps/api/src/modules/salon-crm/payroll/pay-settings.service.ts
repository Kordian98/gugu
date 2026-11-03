import { Injectable } from "@nestjs/common";
import {
  type CommissionPolicyInput,
  PAYROLL_ERRORS,
  type PayVersion,
  type PayVersionInput,
  type PayrollSettings,
  payVersionInputSchema,
  type StaffPay,
} from "@gugu/contracts";
import { monthOf, policyAt, versionAt } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { dateOf, PayrollClock, PayrollData } from "./payroll-data";
import { assertMonthOpen, lockPayroll, PayrollService } from "./payroll.service";

type VersionRow = Awaited<ReturnType<PayrollData["payVersions"]>>[number];

const PAYROLL_GRANTS = ["payroll.read", "payroll.manage"] as const;

function toDto(r: VersionRow): PayVersion {
  return {
    id: r.id,
    effectiveFrom: dateOf(r.effectiveFrom),
    baseType: r.baseType,
    baseAmount: Number(r.baseAmountMinor),
    commissionPercent: r.commissionBps / 100,
    overrides: r.overrides.map((o) => ({
      serviceId: o.serviceId,
      variantId: o.variantId,
      kind: o.kind,
      percent: o.kind === "percent" ? (o.bps ?? 0) / 100 : null,
      amount: o.kind === "fixed" ? Number(o.amountMinor ?? 0n) : null,
    })),
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Effective-dated pay settings (owner request 2026-11-04): saving creates a version from its
 * date (or replaces the version of that exact date); earlier versions are kept so past months
 * never change. A version inside a closed payroll month is refused (409 payroll.month_closed).
 */
@Injectable()
export class PaySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: PayrollData,
    private readonly payroll: PayrollService,
    private readonly audit: AuditService,
    private readonly clock: PayrollClock,
  ) {}

  async settings(ctx: SalonContext): Promise<PayrollSettings> {
    const today = await this.data.today(ctx.salonId, this.clock.now());
    const [policy, staff, versions, managers] = await Promise.all([
      this.data.policy(ctx.salonId),
      this.prisma.staffProfile.findMany({
        where: { salonId: ctx.salonId, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, displayName: true },
      }),
      this.data.payVersions(ctx.salonId),
      this.prisma.salonMember.findMany({
        where: { salonId: ctx.salonId, role: "manager", status: "active" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          permissionsOverride: true,
          user: { select: { email: true, profile: { select: { displayName: true } } } },
          staffProfiles: { where: { deletedAt: null }, select: { displayName: true }, take: 1 },
        },
      }),
    ]);
    return {
      commissionBase: policyAt(policy, today),
      history: policy,
      staff: staff.map((s) => {
        const mine = versions.filter((v) => v.staffId === s.id);
        const current = versionAt(
          mine.map((v) => ({ effectiveFrom: dateOf(v.effectiveFrom), v })),
          today,
        );
        return {
          staffId: s.id,
          displayName: s.displayName,
          current: current ? toDto(current.v) : null,
        };
      }),
      managers: managers.map((m) => {
        const grant = (m.permissionsOverride as { grant?: string[] } | null)?.grant ?? [];
        return {
          memberId: m.id,
          displayName:
            m.staffProfiles[0]?.displayName ?? m.user.profile?.displayName ?? m.user.email ?? "",
          granted: PAYROLL_GRANTS.every((p) => grant.includes(p)),
        };
      }),
    };
  }

  async staffPay(ctx: SalonContext, staffId: string): Promise<StaffPay> {
    const staff = await this.payroll.assertStaff(ctx.salonId, staffId);
    const today = await this.data.today(ctx.salonId, this.clock.now());
    const versions = await this.data.payVersions(ctx.salonId, staffId);
    const current = versionAt(
      versions.map((v) => ({ effectiveFrom: dateOf(v.effectiveFrom), v })),
      today,
    );
    return {
      staffId,
      displayName: staff.displayName,
      current: current ? toDto(current.v) : null,
      versions: versions.map(toDto),
    };
  }

  async saveStaffPay(
    ctx: SalonContext,
    userId: string,
    staffId: string,
    raw: PayVersionInput,
  ): Promise<StaffPay> {
    const input = payVersionInputSchema.parse(raw);
    await this.payroll.assertStaff(ctx.salonId, staffId);
    await this.assertOverrides(ctx.salonId, input.overrides);
    const baseAmount = input.baseType === "none" ? 0 : input.baseAmount;
    await this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      await assertMonthOpen(tx, ctx.salonId, monthOf(input.effectiveFrom));
      const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00Z`);
      const existing = await tx.staffPaySetting.findUnique({
        where: { salonId_staffId_effectiveFrom: { salonId: ctx.salonId, staffId, effectiveFrom } },
        select: { id: true },
      });
      const fields = {
        baseType: input.baseType,
        baseAmountMinor: BigInt(baseAmount),
        commissionBps: Math.round(input.commissionPercent * 100),
        createdByUserId: userId,
      };
      const version = existing
        ? await tx.staffPaySetting.update({ where: { id: existing.id }, data: fields })
        : await tx.staffPaySetting.create({
            data: { salonId: ctx.salonId, staffId, effectiveFrom, ...fields },
          });
      await tx.staffCommissionOverride.deleteMany({
        where: { salonId: ctx.salonId, paySettingId: version.id },
      });
      if (input.overrides.length) {
        await tx.staffCommissionOverride.createMany({
          data: input.overrides.map((o) => ({
            salonId: ctx.salonId,
            paySettingId: version.id,
            serviceId: o.serviceId,
            variantId: o.variantId,
            kind: o.kind,
            bps: o.kind === "percent" ? Math.round((o.percent ?? 0) * 100) : null,
            amountMinor: o.kind === "fixed" ? BigInt(o.amount ?? 0) : null,
          })),
        });
      }
      await this.audit.record(
        {
          action: "payroll.pay_settings_saved",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "staff",
          targetId: staffId,
          metadata: {
            effectiveFrom: input.effectiveFrom,
            baseType: input.baseType,
            replaced: existing !== null,
            overrides: input.overrides.length,
          },
        },
        tx,
      );
    });
    return this.staffPay(ctx, staffId);
  }

  async savePolicy(
    ctx: SalonContext,
    userId: string,
    input: CommissionPolicyInput,
  ): Promise<PayrollSettings> {
    await this.prisma.$transaction(async (tx) => {
      await lockPayroll(tx, ctx.salonId);
      await assertMonthOpen(tx, ctx.salonId, monthOf(input.effectiveFrom));
      const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00Z`);
      await tx.salonCommissionPolicy.upsert({
        where: { salonId_effectiveFrom: { salonId: ctx.salonId, effectiveFrom } },
        create: { salonId: ctx.salonId, effectiveFrom, base: input.base, createdByUserId: userId },
        update: { base: input.base, createdByUserId: userId },
      });
      await this.audit.record(
        {
          action: "payroll.commission_policy_saved",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "salon",
          targetId: ctx.salonId,
          metadata: { effectiveFrom: input.effectiveFrom, base: input.base },
        },
        tx,
      );
    });
    return this.settings(ctx);
  }

  /** Owner lets a manager see and manage payroll (override grant; MANAGER_GRANTABLE_PERMISSIONS). */
  async setManagerAccess(
    ctx: SalonContext,
    memberId: string,
    granted: boolean,
  ): Promise<PayrollSettings> {
    await this.prisma.$transaction(async (tx) => {
      const m = await tx.salonMember.findFirst({
        where: { id: memberId, salonId: ctx.salonId },
        select: { id: true, role: true, permissionsOverride: true },
      });
      if (!m) throw new AppError(404, "common.not_found", "Member not found");
      if (m.role !== "manager") {
        throw new AppError(409, PAYROLL_ERRORS.notManager, "Only managers can be granted payroll");
      }
      const o = (m.permissionsOverride ?? {}) as { grant?: string[]; revoke?: string[] };
      const grant = (o.grant ?? []).filter(
        (p) => !(PAYROLL_GRANTS as readonly string[]).includes(p),
      );
      if (granted) grant.push(...PAYROLL_GRANTS);
      await tx.salonMember.update({
        where: { id: m.id },
        data: { permissionsOverride: { ...o, grant } },
      });
      await this.audit.record(
        {
          action: "payroll.manager_access_changed",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "salon_member",
          targetId: m.id,
          metadata: { granted },
        },
        tx,
      );
    });
    return this.settings(ctx);
  }

  private async assertOverrides(
    salonId: string,
    overrides: { serviceId: string; variantId: string | null }[],
  ): Promise<void> {
    if (!overrides.length) return;
    const serviceIds = [...new Set(overrides.map((o) => o.serviceId))];
    const variantIds = overrides.flatMap((o) => (o.variantId ? [o.variantId] : []));
    const [services, variants] = await Promise.all([
      this.prisma.service.findMany({
        where: { salonId, id: { in: serviceIds } },
        select: { id: true },
      }),
      this.prisma.serviceVariant.findMany({
        where: { salonId, id: { in: variantIds } },
        select: { id: true, serviceId: true },
      }),
    ]);
    const known = new Set(services.map((s) => s.id));
    const variantOf = new Map(variants.map((v) => [v.id, v.serviceId]));
    for (const o of overrides) {
      const ok =
        known.has(o.serviceId) &&
        (o.variantId === null || variantOf.get(o.variantId) === o.serviceId);
      if (!ok)
        throw new AppError(422, PAYROLL_ERRORS.invalidOverride, "Unknown service or variant");
    }
  }
}
