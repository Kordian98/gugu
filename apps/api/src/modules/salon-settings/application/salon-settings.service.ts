import { Injectable } from "@nestjs/common";
import {
  type BookingSettings,
  type HolidayInput,
  holidayInputSchema,
  type Holiday,
  type Onboarding,
  ONBOARDING_STEPS,
  type OpeningHours,
  type PoliciesInput,
  SALON_ERRORS,
  type SalonProfileInput,
  type SalonSettings,
  SETTINGS_ERRORS,
} from "@gugu/contracts";
import { normalizeVnPhone } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { bumpAvailabilityVersion } from "../domain/availability-version";
import { onboardingProgress } from "../domain/onboarding";
import { setupStateOf } from "../domain/setup";
import { fromDateColumn, fromTimeColumn, toDateColumn, toTimeColumn } from "../domain/wall-clock";

type Tx = Prisma.TransactionClient;

const text = (v: unknown): { vi: string; en: string } | null => {
  if (v === null || typeof v !== "object") return null;
  const t = v as Partial<Record<"vi" | "en", string>>;
  return { vi: t.vi ?? "", en: t.en ?? "" };
};

const jsonOrNull = (v: { vi: string; en: string } | null | undefined) =>
  v && (v.vi || v.en) ? v : null;

/**
 * Salon profile, booking settings, policies, opening hours, holidays, setup progress and go-live
 * (07 M7.5–7.6). Every query is scoped by the guard-resolved SalonContext.
 */
@Injectable()
export class SalonSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(ctx: SalonContext): Promise<SalonSettings> {
    const salon = await this.prisma.salon.findFirst({
      where: { id: ctx.salonId, deletedAt: null },
      include: {
        location: true,
        settings: true,
        openingHours: { orderBy: [{ weekday: "asc" }, { opensAt: "asc" }] },
        holidays: { orderBy: { startDate: "asc" } },
      },
    });
    if (!salon) throw new AppError(404, COMMON_ERRORS.notFound, "Not found");
    const s = salon.settings ?? (await this.ensureSettings(this.prisma, ctx.salonId));
    const days = new Map<number, { start: string; end: string }[]>();
    for (const h of salon.openingHours) {
      const list = days.get(h.weekday) ?? [];
      list.push({ start: fromTimeColumn(h.opensAt), end: fromTimeColumn(h.closesAt) });
      days.set(h.weekday, list);
    }
    return {
      profile: {
        name: salon.name,
        phone: salon.phoneE164,
        description: text(s.description),
        address: salon.location
          ? {
              streetAddress: salon.location.addressLine,
              provinceId: salon.location.provinceId,
              wardId: salon.location.wardId,
            }
          : null,
        status: salon.status,
        slug: salon.slug,
      },
      booking: this.bookingOf(s),
      policies: {
        bookingPolicy: text(s.bookingPolicy),
        cancellationPolicy: text(s.cancellationPolicy),
      },
      openingHours: {
        days: [...days.entries()].map(([weekday, intervals]) => ({ weekday, intervals })),
      },
      holidays: salon.holidays.map((h) => this.holidayOf(h)),
    };
  }

  async updateProfile(ctx: SalonContext, input: SalonProfileInput): Promise<void> {
    const phone =
      input.phone === undefined
        ? undefined
        : input.phone === null
          ? null
          : normalizeVnPhone(input.phone);
    if (input.phone != null && !phone)
      throw new AppError(400, SALON_ERRORS.invalidPhone, "Invalid phone");
    if (input.wardId != null && input.provinceId != null) {
      const ward = await this.prisma.location.findFirst({
        where: { id: input.wardId, level: "ward", parentId: input.provinceId, isActive: true },
      });
      if (!ward) throw new AppError(400, SALON_ERRORS.unknownLocation, "Unknown location");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.salon.update({
        where: { id: ctx.salonId, organizationId: ctx.organizationId },
        data: { name: input.name, ...(phone !== undefined ? { phoneE164: phone } : {}) },
      });
      if (input.streetAddress === null) {
        await tx.salonLocation.deleteMany({ where: { salonId: ctx.salonId } });
      } else if (input.streetAddress !== undefined && input.provinceId && input.wardId) {
        await tx.salonLocation.upsert({
          where: { salonId: ctx.salonId },
          create: {
            salonId: ctx.salonId,
            addressLine: input.streetAddress,
            provinceId: input.provinceId,
            wardId: input.wardId,
          },
          update: {
            addressLine: input.streetAddress,
            provinceId: input.provinceId,
            wardId: input.wardId,
          },
        });
      }
      if (input.description !== undefined)
        await tx.salonSettings.upsert({
          where: { salonId: ctx.salonId },
          create: {
            salonId: ctx.salonId,
            description: jsonOrNull(input.description) ?? Prisma.DbNull,
          },
          update: { description: jsonOrNull(input.description) ?? Prisma.DbNull },
        });
      await this.record(tx, ctx, "salon.profile_updated", { fields: "profile" });
    });
  }

  async updateBooking(ctx: SalonContext, input: BookingSettings): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.salonSettings.upsert({
        where: { salonId: ctx.salonId },
        create: { salonId: ctx.salonId, ...input, availabilityVersion: 1 },
        update: { ...input, availabilityVersion: { increment: 1 } },
      });
      await this.record(tx, ctx, "salon.settings_updated", {
        section: "booking",
        confirmationMode: input.confirmationMode,
      });
    });
  }

  async updatePolicies(ctx: SalonContext, input: PoliciesInput): Promise<void> {
    const data = {
      bookingPolicy: jsonOrNull(input.bookingPolicy) ?? Prisma.DbNull,
      cancellationPolicy: jsonOrNull(input.cancellationPolicy) ?? Prisma.DbNull,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.salonSettings.upsert({
        where: { salonId: ctx.salonId },
        create: { salonId: ctx.salonId, ...data },
        update: data,
      });
      await this.record(tx, ctx, "salon.settings_updated", { section: "policies" });
    });
  }

  async replaceOpeningHours(ctx: SalonContext, input: OpeningHours): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.salonOpeningHours.deleteMany({ where: { salonId: ctx.salonId } });
      const rows = input.days.flatMap((d) =>
        d.intervals.map((i) => ({
          salonId: ctx.salonId,
          weekday: d.weekday,
          opensAt: toTimeColumn(i.start),
          closesAt: toTimeColumn(i.end),
        })),
      );
      if (rows.length) await tx.salonOpeningHours.createMany({ data: rows });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "salon.settings_updated", { section: "opening_hours" });
    });
  }

  async addHoliday(ctx: SalonContext, raw: HolidayInput): Promise<Holiday> {
    const input = holidayInputSchema.parse(raw);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.salonHoliday.create({
        data: {
          salonId: ctx.salonId,
          startDate: toDateColumn(input.startDate),
          endDate: toDateColumn(input.endDate),
          closed: input.closed,
          opensAt: !input.closed && input.interval ? toTimeColumn(input.interval.start) : null,
          closesAt: !input.closed && input.interval ? toTimeColumn(input.interval.end) : null,
          reason: input.reason,
        },
      });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "salon.settings_updated", { section: "holidays" });
      return this.holidayOf(row);
    });
  }

  async removeHoliday(ctx: SalonContext, holidayId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.salonHoliday.deleteMany({
        where: { id: holidayId, salonId: ctx.salonId },
      });
      if (count === 0) throw new AppError(404, SETTINGS_ERRORS.holidayNotFound, "Not found");
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "salon.settings_updated", { section: "holidays" });
    });
  }

  async onboarding(ctx: SalonContext): Promise<Onboarding> {
    const assigned = { deletedAt: null, isBookable: true };
    const [
      salon,
      activeServices,
      openingDays,
      readyStaff,
      bookableStaff,
      unassignedServices,
      staffWithoutServices,
      zalo,
    ] = await Promise.all([
      this.prisma.salon.findFirstOrThrow({
        where: { id: ctx.salonId },
        select: {
          status: true,
          phoneE164: true,
          location: { select: { id: true } },
          setup: true,
        },
      }),
      this.prisma.service.count({
        where: { salonId: ctx.salonId, isActive: true, deletedAt: null },
      }),
      this.prisma.salonOpeningHours
        .groupBy({ by: ["weekday"], where: { salonId: ctx.salonId } })
        .then((g) => g.length),
      this.prisma.staffProfile.count({
        where: {
          salonId: ctx.salonId,
          deletedAt: null,
          isBookable: true,
          schedules: { some: {} },
          services: { some: { service: { deletedAt: null, isActive: true } } },
        },
      }),
      this.prisma.staffProfile.count({ where: { salonId: ctx.salonId, ...assigned } }),
      this.prisma.service.count({
        where: {
          salonId: ctx.salonId,
          isActive: true,
          deletedAt: null,
          staff: { none: { staff: assigned } },
        },
      }),
      this.prisma.staffProfile.count({
        where: {
          salonId: ctx.salonId,
          ...assigned,
          services: { none: { service: { deletedAt: null, isActive: true } } },
        },
      }),
      this.prisma.zaloOaConnection.findUnique({
        where: { salonId: ctx.salonId },
        select: { status: true },
      }),
    ]);
    // Business basics: named in the setup wizard, or phone + address from the old registration form.
    const businessDone =
      (salon.setup?.nameConfirmed ?? false) ||
      (salon.phoneE164 !== null && salon.location !== null);
    const { done, canGoLive } = onboardingProgress({
      hasBusinessBasics: businessDone,
      activeServices,
      openingDays,
      readyStaff,
      status: salon.status,
    });
    return {
      done,
      total: ONBOARDING_STEPS.length,
      canGoLive,
      issues: { unassignedServices, staffWithoutServices },
      setup: salon.setup
        ? setupStateOf(salon.setup, {
            businessDone,
            openingDays,
            activeServices,
            bookableStaff,
            zaloConnected: zalo?.status === "connected" || zalo?.status === "needs_reauth",
          })
        : null,
    };
  }

  /** Go live when the checklist is complete; false when not ready or already live. */
  async goLiveIfReady(ctx: SalonContext): Promise<boolean> {
    const progress = await this.onboarding(ctx);
    if (!progress.canGoLive) return false;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.salon.updateMany({
        where: { id: ctx.salonId, status: "draft" },
        data: { status: "active" },
      });
      if (count === 1) await this.record(tx, ctx, "salon.went_live", { via: "setup" });
      return count === 1;
    });
  }

  /** Draft → active once the checklist is complete (07 §3.7 "Go live"). */
  async goLive(ctx: SalonContext): Promise<void> {
    const progress = await this.onboarding(ctx);
    if (!progress.canGoLive) {
      throw new AppError(409, SETTINGS_ERRORS.goLiveIncomplete, "Setup incomplete", {
        detail: progress.done.join(","),
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.salon.update({
        where: { id: ctx.salonId, status: "draft" },
        data: { status: "active" },
      });
      await this.record(tx, ctx, "salon.went_live", {});
    });
  }

  private ensureSettings(db: Tx | PrismaService, salonId: string) {
    return db.salonSettings.upsert({ where: { salonId }, create: { salonId }, update: {} });
  }

  private bookingOf(s: {
    confirmationMode: "auto" | "manual";
    manualConfirmWindowHours: number;
    confirmNewClients: boolean;
    hideStaffChoice: boolean;
    minLeadTimeMinutes: number;
    bookingWindowDays: number;
    cancellationCutoffMinutes: number;
    rescheduleCutoffMinutes: number;
    slotGranularityMinutes: number;
  }): BookingSettings {
    const g = s.slotGranularityMinutes;
    return {
      confirmationMode: s.confirmationMode,
      manualConfirmWindowHours: s.manualConfirmWindowHours,
      confirmNewClients: s.confirmNewClients,
      hideStaffChoice: s.hideStaffChoice,
      minLeadTimeMinutes: s.minLeadTimeMinutes,
      bookingWindowDays: s.bookingWindowDays,
      cancellationCutoffMinutes: s.cancellationCutoffMinutes,
      rescheduleCutoffMinutes: s.rescheduleCutoffMinutes,
      slotGranularityMinutes: g === 5 || g === 10 || g === 30 ? g : 15,
    };
  }

  private holidayOf(h: {
    id: string;
    startDate: Date;
    endDate: Date;
    closed: boolean;
    opensAt: Date | null;
    closesAt: Date | null;
    reason: string | null;
  }): Holiday {
    return {
      id: h.id,
      startDate: fromDateColumn(h.startDate),
      endDate: fromDateColumn(h.endDate),
      closed: h.closed,
      interval:
        h.opensAt && h.closesAt
          ? { start: fromTimeColumn(h.opensAt), end: fromTimeColumn(h.closesAt) }
          : null,
      reason: h.reason,
    };
  }

  private record(
    tx: Tx,
    ctx: SalonContext,
    action: "salon.profile_updated" | "salon.settings_updated" | "salon.went_live",
    metadata: Record<string, string>,
  ) {
    return this.audit.record(
      {
        action,
        salonId: ctx.salonId,
        organizationId: ctx.organizationId,
        targetType: "salon",
        targetId: ctx.salonId,
        metadata,
      },
      tx,
    );
  }
}
