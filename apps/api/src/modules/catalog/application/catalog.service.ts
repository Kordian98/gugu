import { Injectable } from "@nestjs/common";
import {
  CATALOG_ERRORS,
  type ReorderInput,
  type Service,
  type ServiceInputParsed,
  type ServiceList,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { bumpAvailabilityVersion } from "../../salon-settings/salon-settings.facade";

type Tx = Prisma.TransactionClient;

const SERVICE_INCLUDE = {
  variants: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
  addOns: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
  staff: {
    where: { variantId: null, staff: { deletedAt: null } },
    select: { staffId: true },
  },
} as const satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof SERVICE_INCLUDE }>;

const text = (v: unknown): { vi: string; en: string } => {
  const t = (v ?? {}) as Partial<Record<"vi" | "en", string>>;
  return { vi: t.vi ?? "", en: t.en ?? "" };
};
const num = (v: bigint | null): number | null => (v === null ? null : Number(v));
const big = (v: number | null): bigint | null => (v === null ? null : BigInt(v));

function toDto(s: ServiceRow): Service {
  return {
    id: s.id,
    categoryId: s.categoryId,
    name: text(s.name),
    description: s.description === null ? null : text(s.description),
    price: Number(s.priceAmountMinor),
    priceMax: num(s.priceMaxAmountMinor),
    currency: s.currency,
    durationMinutes: s.durationMinutes,
    bufferBeforeMinutes: s.bufferBeforeMinutes,
    bufferAfterMinutes: s.bufferAfterMinutes,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    variants: s.variants.map((v) => ({
      id: v.id,
      name: text(v.name),
      price: num(v.priceAmountMinor),
      priceMax: num(v.priceMaxAmountMinor),
      durationMinutes: v.durationMinutes,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
    addOns: s.addOns.map((a) => ({
      id: a.id,
      name: text(a.name),
      extraDurationMinutes: a.extraDurationMinutes,
      extraPrice: Number(a.extraPriceAmountMinor),
      extraPriceMax: num(a.extraPriceMaxAmountMinor),
      isActive: a.isActive,
      sortOrder: a.sortOrder,
    })),
    staffIds: s.staff.map((x) => x.staffId),
  };
}

/**
 * Service catalogue: services with variants, add-ons (q17) and staff assignment (07 M7.4).
 * Writes bump the availability version (06 cache) and are audited. Deletion is soft: bookings keep
 * their snapshots (04 §3.5).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: SalonContext): Promise<ServiceList> {
    const rows = await this.prisma.service.findMany({
      where: { salonId: ctx.salonId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: SERVICE_INCLUDE,
      take: 500,
    });
    return { items: rows.map(toDto) };
  }

  async create(ctx: SalonContext, input: ServiceInputParsed): Promise<Service> {
    await this.assertRefs(ctx, input);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.service.aggregate({
        where: { salonId: ctx.salonId, deletedAt: null },
        _max: { sortOrder: true },
      });
      const service = await tx.service.create({
        data: {
          salonId: ctx.salonId,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          ...this.fields(input),
        },
      });
      await this.syncChildren(tx, ctx.salonId, service.id, input);
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "catalog.service_created", service.id);
      return toDto(
        await tx.service.findUniqueOrThrow({ where: { id: service.id }, include: SERVICE_INCLUDE }),
      );
    });
  }

  async update(ctx: SalonContext, serviceId: string, input: ServiceInputParsed): Promise<Service> {
    await this.assertRefs(ctx, input);
    return this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, ctx, serviceId);
      await tx.service.update({ where: { id: serviceId }, data: this.fields(input) });
      await this.syncChildren(tx, ctx.salonId, serviceId, input);
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "catalog.service_updated", serviceId);
      return toDto(
        await tx.service.findUniqueOrThrow({ where: { id: serviceId }, include: SERVICE_INCLUDE }),
      );
    });
  }

  async setActive(ctx: SalonContext, serviceId: string, isActive: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, ctx, serviceId);
      await tx.service.update({ where: { id: serviceId }, data: { isActive } });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "catalog.service_updated", serviceId);
    });
  }

  async remove(ctx: SalonContext, serviceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, ctx, serviceId);
      const now = new Date();
      await tx.service.update({
        where: { id: serviceId },
        data: { deletedAt: now, isActive: false },
      });
      await tx.staffService.deleteMany({ where: { salonId: ctx.salonId, serviceId } });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      await this.record(tx, ctx, "catalog.service_deleted", serviceId);
    });
  }

  /** `ids` must be exactly the salon's non-deleted services, in the new order. */
  async reorder(ctx: SalonContext, input: ReorderInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.service.findMany({
        where: { salonId: ctx.salonId, deletedAt: null },
        select: { id: true },
      });
      const ids = new Set(current.map((s) => s.id));
      if (
        ids.size !== input.ids.length ||
        new Set(input.ids).size !== input.ids.length ||
        !input.ids.every((id) => ids.has(id))
      ) {
        throw new AppError(
          400,
          CATALOG_ERRORS.invalidReorder,
          "Order must list every service once",
        );
      }
      for (const [index, id] of input.ids.entries()) {
        await tx.service.update({ where: { id }, data: { sortOrder: index } });
      }
    });
  }

  private fields(input: ServiceInputParsed) {
    return {
      name: input.name,
      description:
        input.description && (input.description.vi || input.description.en)
          ? input.description
          : Prisma.DbNull,
      categoryId: input.categoryId,
      priceAmountMinor: BigInt(input.price),
      priceMaxAmountMinor: big(input.priceMax),
      durationMinutes: input.durationMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
      isActive: input.isActive,
    };
  }

  /** Upserts variants/add-ons by id (ids of other services are ignored) and replaces staff links. */
  private async syncChildren(
    tx: Tx,
    salonId: string,
    serviceId: string,
    input: ServiceInputParsed,
  ) {
    const now = new Date();
    const keepVariants: string[] = [];
    for (const [sortOrder, v] of input.variants.entries()) {
      const data = {
        name: v.name,
        priceAmountMinor: big(v.price),
        priceMaxAmountMinor: big(v.priceMax),
        durationMinutes: v.durationMinutes,
        isActive: v.isActive,
        sortOrder,
      };
      const updated = v.id
        ? await tx.serviceVariant.updateMany({
            where: { id: v.id, salonId, serviceId, deletedAt: null },
            data,
          })
        : { count: 0 };
      if (updated.count === 1 && v.id) keepVariants.push(v.id);
      else
        keepVariants.push(
          (await tx.serviceVariant.create({ data: { ...data, salonId, serviceId } })).id,
        );
    }
    await tx.serviceVariant.updateMany({
      where: { salonId, serviceId, deletedAt: null, id: { notIn: keepVariants } },
      data: { deletedAt: now, isActive: false },
    });
    await tx.staffService.deleteMany({
      where: { salonId, serviceId, variantId: { not: null, notIn: keepVariants } },
    });

    const keepAddOns: string[] = [];
    for (const [sortOrder, a] of input.addOns.entries()) {
      const data = {
        name: a.name,
        extraDurationMinutes: a.extraDurationMinutes,
        extraPriceAmountMinor: BigInt(a.extraPrice),
        extraPriceMaxAmountMinor: big(a.extraPriceMax),
        isActive: a.isActive,
        maxQuantity: 1,
        sortOrder,
      };
      const updated = a.id
        ? await tx.serviceAddOn.updateMany({
            where: { id: a.id, salonId, serviceId, deletedAt: null },
            data,
          })
        : { count: 0 };
      if (updated.count === 1 && a.id) keepAddOns.push(a.id);
      else
        keepAddOns.push(
          (await tx.serviceAddOn.create({ data: { ...data, salonId, serviceId } })).id,
        );
    }
    await tx.serviceAddOn.updateMany({
      where: { salonId, serviceId, deletedAt: null, id: { notIn: keepAddOns } },
      data: { deletedAt: now, isActive: false },
    });

    const staffIds = [...new Set(input.staffIds)];
    await tx.staffService.deleteMany({
      where: { salonId, serviceId, variantId: null, staffId: { notIn: staffIds } },
    });
    const existing = await tx.staffService.findMany({
      where: { salonId, serviceId, variantId: null },
      select: { staffId: true },
    });
    const have = new Set(existing.map((e) => e.staffId));
    const add = staffIds.filter((id) => !have.has(id));
    if (add.length) {
      await tx.staffService.createMany({
        data: add.map((staffId) => ({ salonId, serviceId, staffId })),
      });
    }
  }

  /** Category must exist; staff must belong to this salon (the composite FK is the backstop). */
  private async assertRefs(ctx: SalonContext, input: ServiceInputParsed) {
    if (input.categoryId) {
      const cat = await this.prisma.serviceCategory.findFirst({
        where: { id: input.categoryId, isActive: true },
      });
      if (!cat) throw new AppError(400, CATALOG_ERRORS.unknownCategory, "Unknown category");
    }
    const staffIds = [...new Set(input.staffIds)];
    if (staffIds.length) {
      const n = await this.prisma.staffProfile.count({
        where: { salonId: ctx.salonId, deletedAt: null, id: { in: staffIds } },
      });
      if (n !== staffIds.length)
        throw new AppError(400, CATALOG_ERRORS.unknownStaff, "Unknown staff");
    }
  }

  private async findOwned(tx: Tx, ctx: SalonContext, serviceId: string) {
    const s = await tx.service.findFirst({
      where: { id: serviceId, salonId: ctx.salonId, deletedAt: null },
    });
    if (!s) throw new AppError(404, CATALOG_ERRORS.serviceNotFound, "Service not found");
    return s;
  }

  private record(
    tx: Tx,
    ctx: SalonContext,
    action: "catalog.service_created" | "catalog.service_updated" | "catalog.service_deleted",
    serviceId: string,
  ) {
    return this.audit.record(
      {
        action,
        salonId: ctx.salonId,
        organizationId: ctx.organizationId,
        targetType: "service",
        targetId: serviceId,
      },
      tx,
    );
  }
}
