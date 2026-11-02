import { Injectable } from "@nestjs/common";
import type {
  CategoryItem,
  LocationItem,
  LocationListQuery,
  SalonMemberList,
  SalonSummary,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

const localized = (name: unknown): { vi: string; en: string } => {
  const n = (name ?? {}) as Partial<Record<"vi" | "en", string>>;
  return { vi: n.vi ?? n.en ?? "", en: n.en ?? n.vi ?? "" };
};

/** Read models for salons and the registration form's reference data. */
@Injectable()
export class SalonQueries {
  constructor(private readonly prisma: PrismaService) {}

  async categories(): Promise<CategoryItem[]> {
    const rows = await this.prisma.serviceCategory.findMany({
      where: { isActive: true, parentId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, name: true },
    });
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: localized(r.name) }));
  }

  async locations(query: LocationListQuery): Promise<LocationItem[]> {
    const rows = await this.prisma.location.findMany({
      where: {
        isActive: true,
        level: query.level,
        ...(query.parentId ? { parentId: query.parentId } : {}),
      },
      orderBy: { nameVi: "asc" },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      level: r.level,
      name: { vi: r.nameVi, en: r.nameEn },
    }));
  }

  /** Scoped by the guard-resolved SalonContext, never by a client-supplied id alone. */
  async summary(ctx: SalonContext): Promise<SalonSummary> {
    const salon = await this.prisma.salon.findFirst({
      where: { id: ctx.salonId, deletedAt: null },
    });
    if (!salon) throw new AppError(404, COMMON_ERRORS.notFound, "Not found");
    return {
      id: salon.id,
      organizationId: salon.organizationId,
      slug: salon.slug,
      name: salon.name,
      status: salon.status,
      timezone: salon.timezone,
      myRole: ctx.role,
      myPermissions: [...ctx.permissions].sort(),
    };
  }

  async members(ctx: SalonContext): Promise<SalonMemberList> {
    const rows = await this.prisma.salonMember.findMany({
      where: { salonId: ctx.salonId, status: { not: "removed" } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { profile: { select: { displayName: true } } } } },
      take: 200,
    });
    return {
      items: rows.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        status: m.status,
        displayName: m.user.profile?.displayName ?? null,
      })),
    };
  }
}
