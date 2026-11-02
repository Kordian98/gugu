import { Injectable } from "@nestjs/common";
import {
  STAFF_COLORS,
  type StaffMember,
  TEAM_ERRORS,
  type Team,
  type TimeOff,
  type WeeklySchedule,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import {
  bumpAvailabilityVersion,
  fromTimeColumn,
  localDate,
  toDateColumn,
  toTimeColumn,
} from "../../salon-settings/salon-settings.facade";

type Tx = Prisma.TransactionClient;

export type StaffFields = {
  displayName: string;
  color: (typeof STAFF_COLORS)[number];
  isBookable: boolean;
  serviceIds: string[];
};

const color = (c: string): StaffMember["color"] =>
  (STAFF_COLORS as readonly string[]).includes(c) ? (c as StaffMember["color"]) : "lilac";

/**
 * Team: staff profiles, service assignment, weekly schedules + breaks, time off (07 M7.4). Writes
 * that change availability bump the version (06). Schedules are stored as effective-dated rows;
 * a replace ends the current rows yesterday and starts the new ones today (salon-local date), so
 * past days keep the hours they had.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: SalonContext, now = new Date()): Promise<Team> {
    const today = toDateColumn(localDate(now, await this.timezone(ctx)));
    const rows = await this.prisma.staffProfile.findMany({
      where: { salonId: ctx.salonId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 200,
      include: {
        member: { include: { user: { select: { email: true } } } },
        services: {
          where: { variantId: null, service: { deletedAt: null } },
          select: { serviceId: true },
        },
        schedules: {
          where: {
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
            effectiveFrom: { lte: today },
          },
          orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
        },
        breaks: {
          where: { weekday: { not: null } },
          orderBy: [{ weekday: "asc" }, { startsAt: "asc" }],
        },
        timeOff: { where: { endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 50 },
        invitations: {
          where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        color: color(s.color),
        isBookable: s.isBookable,
        sortOrder: s.sortOrder,
        serviceIds: s.services.map((x) => x.serviceId),
        member: s.member
          ? {
              id: s.member.id,
              role: s.member.role,
              status: s.member.status,
              email: s.member.user.email,
            }
          : null,
        pendingInvitation: s.invitations[0]
          ? {
              id: s.invitations[0].id,
              email: s.invitations[0].email,
              role: s.invitations[0].role,
              expiresAt: s.invitations[0].expiresAt.toISOString(),
            }
          : null,
        schedule: { days: this.daysOf(s.schedules, s.breaks) },
        timeOff: s.timeOff.map((t) => this.timeOffOf(t)),
      })),
    };
  }

  async create(ctx: SalonContext, input: StaffFields): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertServices(tx, ctx, input.serviceIds);
      const last = await tx.staffProfile.aggregate({
        where: { salonId: ctx.salonId, deletedAt: null },
        _max: { sortOrder: true },
      });
      const staff = await tx.staffProfile.create({
        data: {
          salonId: ctx.salonId,
          displayName: input.displayName,
          color: input.color,
          isBookable: input.isBookable,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      await this.syncServices(tx, ctx.salonId, staff.id, input.serviceIds);
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "team.staff_created", staff.id);
      return { id: staff.id };
    });
  }

  async update(ctx: SalonContext, staffId: string, input: StaffFields): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, ctx, staffId);
      await this.assertServices(tx, ctx, input.serviceIds);
      await tx.staffProfile.update({
        where: { id: staffId },
        data: { displayName: input.displayName, color: input.color, isBookable: input.isBookable },
      });
      await this.syncServices(tx, ctx.salonId, staffId, input.serviceIds);
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "team.staff_updated", staffId);
    });
  }

  /**
   * Removes a staff profile (soft) and its future working hours and assignments. A linked account
   * loses salon access too, which only the owner may do (`members.roles.write`); the owner's own
   * profile can't be removed.
   */
  async remove(ctx: SalonContext, staffId: string, now = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const staff = await this.findOwned(tx, ctx, staffId);
      if (staff.member) {
        if (staff.member.role === "owner")
          throw new AppError(403, TEAM_ERRORS.cannotChangeOwner, "Owner cannot be removed");
        if (!ctx.permissions.has("members.roles.write"))
          throw new AppError(403, "common.forbidden", "Owner only");
        await tx.salonMember.update({
          where: { id: staff.member.id },
          data: { status: "removed" },
        });
      }
      const today = toDateColumn(localDate(now, await this.timezone(ctx, tx)));
      await tx.staffProfile.update({
        where: { id: staffId },
        data: { deletedAt: now, isBookable: false },
      });
      await tx.staffService.deleteMany({ where: { salonId: ctx.salonId, staffId } });
      await tx.staffSchedule.deleteMany({
        where: { salonId: ctx.salonId, staffId, effectiveFrom: { gte: today } },
      });
      await tx.staffSchedule.updateMany({
        where: {
          salonId: ctx.salonId,
          staffId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        data: { effectiveTo: new Date(today.getTime() - 86_400_000) },
      });
      await tx.salonInvitation.updateMany({
        where: { salonId: ctx.salonId, staffProfileId: staffId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "team.staff_removed", staffId);
    });
  }

  async replaceSchedule(
    ctx: SalonContext,
    staffId: string,
    input: WeeklySchedule,
    now = new Date(),
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, ctx, staffId);
      const today = toDateColumn(localDate(now, await this.timezone(ctx, tx)));
      const yesterday = new Date(today.getTime() - 86_400_000);
      // Rows that start today or later are replaced; older open rows end yesterday.
      await tx.staffSchedule.deleteMany({
        where: { salonId: ctx.salonId, staffId, effectiveFrom: { gte: today } },
      });
      await tx.staffSchedule.updateMany({
        where: {
          salonId: ctx.salonId,
          staffId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        data: { effectiveTo: yesterday },
      });
      const rows = input.days.flatMap((d) =>
        d.intervals.map((i) => ({
          salonId: ctx.salonId,
          staffId,
          weekday: d.weekday,
          startsAt: toTimeColumn(i.start),
          endsAt: toTimeColumn(i.end),
          effectiveFrom: today,
        })),
      );
      if (rows.length) await tx.staffSchedule.createMany({ data: rows });
      await tx.staffBreak.deleteMany({
        where: { salonId: ctx.salonId, staffId, weekday: { not: null } },
      });
      const breaks = input.days.flatMap((d) =>
        d.breaks.map((b) => ({
          salonId: ctx.salonId,
          staffId,
          weekday: d.weekday,
          startsAt: toTimeColumn(b.start),
          endsAt: toTimeColumn(b.end),
        })),
      );
      if (breaks.length) await tx.staffBreak.createMany({ data: breaks });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "team.schedule_updated", staffId);
    });
  }

  async addTimeOff(
    ctx: SalonContext,
    staffId: string,
    input: { startsAt: string; endsAt: string; reason: string | null },
    approvedByUserId: string,
  ): Promise<TimeOff> {
    return this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, ctx, staffId);
      const row = await tx.staffTimeOff.create({
        data: {
          salonId: ctx.salonId,
          staffId,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          reason: input.reason,
          approvedByUserId,
        },
      });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "team.time_off_added", staffId);
      return this.timeOffOf(row);
    });
  }

  async removeTimeOff(ctx: SalonContext, staffId: string, timeOffId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.staffTimeOff.deleteMany({
        where: { id: timeOffId, staffId, salonId: ctx.salonId },
      });
      if (count === 0) throw new AppError(404, TEAM_ERRORS.staffNotFound, "Not found");
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "team.time_off_removed", staffId);
    });
  }

  private daysOf(
    schedules: { weekday: number; startsAt: Date; endsAt: Date }[],
    breaks: { weekday: number | null; startsAt: Date; endsAt: Date }[],
  ): WeeklySchedule["days"] {
    const days = new Map<number, WeeklySchedule["days"][number]>();
    const day = (w: number) => {
      const d = days.get(w) ?? { weekday: w, intervals: [], breaks: [] };
      days.set(w, d);
      return d;
    };
    for (const s of schedules)
      day(s.weekday).intervals.push({
        start: fromTimeColumn(s.startsAt),
        end: fromTimeColumn(s.endsAt),
      });
    for (const b of breaks)
      if (b.weekday !== null)
        day(b.weekday).breaks.push({
          start: fromTimeColumn(b.startsAt),
          end: fromTimeColumn(b.endsAt),
        });
    return [...days.values()].sort((a, b) => a.weekday - b.weekday);
  }

  private timeOffOf(t: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
  }): TimeOff {
    return {
      id: t.id,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      reason: t.reason,
    };
  }

  private async syncServices(tx: Tx, salonId: string, staffId: string, serviceIds: string[]) {
    const ids = [...new Set(serviceIds)];
    await tx.staffService.deleteMany({
      where: { salonId, staffId, variantId: null, serviceId: { notIn: ids } },
    });
    const have = new Set(
      (
        await tx.staffService.findMany({
          where: { salonId, staffId, variantId: null },
          select: { serviceId: true },
        })
      ).map((r) => r.serviceId),
    );
    const add = ids.filter((id) => !have.has(id));
    if (add.length)
      await tx.staffService.createMany({
        data: add.map((serviceId) => ({ salonId, staffId, serviceId })),
      });
  }

  private async assertServices(tx: Tx, ctx: SalonContext, serviceIds: string[]) {
    const ids = [...new Set(serviceIds)];
    if (!ids.length) return;
    const n = await tx.service.count({
      where: { salonId: ctx.salonId, deletedAt: null, id: { in: ids } },
    });
    if (n !== ids.length) throw new AppError(400, "catalog.service_not_found", "Unknown service");
  }

  private async findOwned(tx: Tx, ctx: SalonContext, staffId: string) {
    const s = await tx.staffProfile.findFirst({
      where: { id: staffId, salonId: ctx.salonId, deletedAt: null },
      include: { member: { select: { id: true, role: true } } },
    });
    if (!s) throw new AppError(404, TEAM_ERRORS.staffNotFound, "Staff not found");
    return s;
  }

  private async timezone(ctx: SalonContext, tx?: Tx): Promise<string> {
    const s = await (tx ?? this.prisma).salon.findUniqueOrThrow({
      where: { id: ctx.salonId },
      select: { timezone: true },
    });
    return s.timezone;
  }

  private record(
    tx: Tx,
    ctx: SalonContext,
    action:
      | "team.staff_created"
      | "team.staff_updated"
      | "team.staff_removed"
      | "team.schedule_updated"
      | "team.time_off_added"
      | "team.time_off_removed",
    staffId: string,
  ) {
    return this.audit.record(
      {
        action,
        salonId: ctx.salonId,
        organizationId: ctx.organizationId,
        targetType: "staff_profile",
        targetId: staffId,
      },
      tx,
    );
  }
}
