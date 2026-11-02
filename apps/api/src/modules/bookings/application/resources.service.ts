import { Injectable } from "@nestjs/common";
import {
  type CreateResourceInput,
  type CreateResourceTypeInput,
  RESOURCE_ERRORS,
  type ResourceRequirement,
  type ResourceTypeList,
  type UpdateResourceInput,
  type UpdateResourceTypeInput,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { bumpAvailabilityVersion } from "../../salon-settings/salon-settings.facade";
import { lockClaims } from "../infra/occupancy";
import { replaceServiceResourceRequirements } from "../infra/resource-requirements";
import { BookingClock } from "./booking-clock";

type Tx = Prisma.TransactionClient;

const typeNotFound = () =>
  new AppError(404, RESOURCE_ERRORS.typeNotFound, "Resource type not found");
const resourceNotFound = () => new AppError(404, RESOURCE_ERRORS.notFound, "Resource not found");

/**
 * Resource types, resources and service requirements (M6.6). Capacity is the number of active
 * units; changing it adds units or deactivates the highest-numbered free ones. Units holding future
 * active claims are never deactivated (409 `resource.in_use`), so a capacity cut can't strand a
 * booking. Every write bumps `availability_version`.
 */
@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: BookingClock,
  ) {}

  async list(ctx: SalonContext): Promise<ResourceTypeList> {
    const types = await this.prisma.resourceType.findMany({
      where: { salonId: ctx.salonId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { requirements: { where: { service: { deletedAt: null } } } } },
        resources: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { _count: { select: { units: { where: { isActive: true } } } } },
        },
      },
    });
    return {
      items: types.map((t) => ({
        id: t.id,
        name: t.name,
        sortOrder: t.sortOrder,
        requiredByServiceCount: t._count.requirements,
        resources: t.resources.map((r) => ({
          id: r.id,
          resourceTypeId: r.resourceTypeId,
          name: r.name,
          capacity: r._count.units,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
        })),
      })),
    };
  }

  async createType(ctx: SalonContext, input: CreateResourceTypeInput): Promise<{ id: string }> {
    const type = await this.prisma.resourceType.create({
      data: { salonId: ctx.salonId, name: input.name, sortOrder: input.sortOrder ?? 0 },
      select: { id: true },
    });
    return type;
  }

  async updateType(ctx: SalonContext, id: string, input: UpdateResourceTypeInput): Promise<void> {
    const { count } = await this.prisma.resourceType.updateMany({
      where: { id, salonId: ctx.salonId, deletedAt: null },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    if (count === 0) throw typeNotFound();
  }

  /** Soft delete; refused while a service requires it or it still has resources. */
  async deleteType(ctx: SalonContext, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const type = await tx.resourceType.findFirst({
        where: { id, salonId: ctx.salonId, deletedAt: null },
        include: {
          _count: {
            select: {
              requirements: { where: { service: { deletedAt: null } } },
              resources: { where: { deletedAt: null } },
            },
          },
        },
      });
      if (!type) throw typeNotFound();
      if (type._count.requirements > 0 || type._count.resources > 0) {
        throw new AppError(409, RESOURCE_ERRORS.typeInUse, "Resource type is still in use", {
          detail: "Remove it from services and delete its resources first.",
        });
      }
      await tx.resourceType.update({ where: { id }, data: { deletedAt: this.clock.now() } });
    });
  }

  async createResource(ctx: SalonContext, input: CreateResourceInput): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const type = await tx.resourceType.findFirst({
        where: { id: input.resourceTypeId, salonId: ctx.salonId, deletedAt: null },
      });
      if (!type) throw typeNotFound();
      const resource = await tx.resource.create({
        data: {
          salonId: ctx.salonId,
          resourceTypeId: type.id,
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
        },
        select: { id: true },
      });
      await tx.resourceUnit.createMany({
        data: Array.from({ length: input.capacity }, (_, i) => ({
          salonId: ctx.salonId,
          resourceId: resource.id,
          position: i + 1,
        })),
      });
      await bumpAvailabilityVersion(tx, ctx.salonId);
      return resource;
    });
  }

  async updateResource(ctx: SalonContext, id: string, input: UpdateResourceInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.findFirst({
        where: { id, salonId: ctx.salonId, deletedAt: null },
        include: { units: { orderBy: { position: "asc" } } },
      });
      if (!resource) throw resourceNotFound();
      await tx.resource.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (input.isActive === false) {
        await this.assertUnitsFree(
          tx,
          resource.units.filter((u) => u.isActive).map((u) => u.id),
        );
      }
      if (input.capacity !== undefined)
        await this.setCapacity(tx, ctx.salonId, resource, input.capacity);
      await bumpAvailabilityVersion(tx, ctx.salonId);
    });
  }

  async deleteResource(ctx: SalonContext, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource.findFirst({
        where: { id, salonId: ctx.salonId, deletedAt: null },
        include: { units: { where: { isActive: true } } },
      });
      if (!resource) throw resourceNotFound();
      const unitIds = resource.units.map((u) => u.id);
      await this.assertUnitsFree(tx, unitIds);
      await tx.resourceUnit.updateMany({
        where: { id: { in: unitIds } },
        data: { isActive: false },
      });
      await tx.resource.update({
        where: { id },
        data: { deletedAt: this.clock.now(), isActive: false },
      });
      await bumpAvailabilityVersion(tx, ctx.salonId);
    });
  }

  async requirements(ctx: SalonContext, serviceId: string): Promise<ResourceRequirement[]> {
    await this.assertService(this.prisma, ctx.salonId, serviceId);
    const rows = await this.prisma.serviceResourceRequirement.findMany({
      where: { salonId: ctx.salonId, serviceId, type: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({ resourceTypeId: r.resourceTypeId, quantity: r.quantity }));
  }

  async replaceRequirements(
    ctx: SalonContext,
    serviceId: string,
    items: readonly ResourceRequirement[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertService(tx, ctx.salonId, serviceId);
      await replaceServiceResourceRequirements(tx, ctx.salonId, serviceId, items);
      await bumpAvailabilityVersion(tx, ctx.salonId);
    });
  }

  private async assertService(db: Tx, salonId: string, serviceId: string): Promise<void> {
    const n = await db.service.count({ where: { id: serviceId, salonId, deletedAt: null } });
    if (n === 0) throw new AppError(404, "common.not_found", "Service not found");
  }

  /**
   * Grows by adding (or reactivating) units, shrinks by deactivating the highest-numbered units
   * without future claims. Locks the units first so no booking can claim one mid-change.
   */
  private async setCapacity(
    tx: Tx,
    salonId: string,
    resource: { id: string; units: { id: string; position: number; isActive: boolean }[] },
    capacity: number,
  ): Promise<void> {
    const active = resource.units.filter((u) => u.isActive);
    if (capacity > active.length) {
      const inactive = resource.units.filter((u) => !u.isActive);
      const reactivate = inactive.slice(0, capacity - active.length);
      await tx.resourceUnit.updateMany({
        where: { id: { in: reactivate.map((u) => u.id) } },
        data: { isActive: true },
      });
      const missing = capacity - active.length - reactivate.length;
      const last = resource.units.at(-1)?.position ?? 0;
      if (missing > 0) {
        await tx.resourceUnit.createMany({
          data: Array.from({ length: missing }, (_, i) => ({
            salonId,
            resourceId: resource.id,
            position: last + i + 1,
          })),
        });
      }
      return;
    }
    if (capacity === active.length) return;
    await lockClaims(
      tx,
      active.map((u) => u.id),
    );
    const busy = new Set(
      await this.unitsWithFutureClaims(
        tx,
        active.map((u) => u.id),
      ),
    );
    const removable = active.filter((u) => !busy.has(u.id)).sort((a, b) => b.position - a.position);
    const toRemove = active.length - capacity;
    if (removable.length < toRemove) throw this.inUse();
    await tx.resourceUnit.updateMany({
      where: { id: { in: removable.slice(0, toRemove).map((u) => u.id) } },
      data: { isActive: false },
    });
  }

  private async assertUnitsFree(tx: Tx, unitIds: string[]): Promise<void> {
    if (unitIds.length === 0) return;
    await lockClaims(tx, unitIds);
    if ((await this.unitsWithFutureClaims(tx, unitIds)).length > 0) throw this.inUse();
  }

  private async unitsWithFutureClaims(tx: Tx, unitIds: string[]): Promise<string[]> {
    const now = this.clock.now();
    const rows = await tx.$queryRaw<{ unit_id: string }[]>`
      SELECT DISTINCT resource_unit_id AS unit_id FROM booking_occupancy
      WHERE resource_unit_id = ANY(${unitIds}::uuid[])
        AND active AND (expires_at IS NULL OR expires_at > ${now})
        AND upper(period) > ${now}`;
    return rows.map((r) => r.unit_id);
  }

  private inUse(): AppError {
    return new AppError(409, RESOURCE_ERRORS.inUse, "Resource has upcoming bookings", {
      detail: "Move or cancel the upcoming bookings that use it first.",
    });
  }
}
