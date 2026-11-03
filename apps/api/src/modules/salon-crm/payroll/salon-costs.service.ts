import { Injectable } from "@nestjs/common";
import {
  PAYROLL_ERRORS,
  type SalonCost,
  type SalonCostInput,
  type SalonCostList,
  salonCostInputSchema,
  type SalonCostUpdate,
} from "@gugu/contracts";
import { addMonths, type Month } from "@gugu/domain";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { monthDate } from "./payroll-data";

type Row = Prisma.SalonCostGetPayload<object>;
const monthOfDate = (d: Date): Month => d.toISOString().slice(0, 7);

const toDto = (r: Row): SalonCost => ({
  id: r.id,
  name: r.name,
  category: r.category,
  amount: Number(r.amountMinor),
  recurring: r.recurring,
  startMonth: monthOfDate(r.startMonth),
  endMonth: r.endMonth ? monthOfDate(r.endMonth) : null,
});

const notFound = () => new AppError(404, PAYROLL_ERRORS.costNotFound, "Cost not found");

/**
 * Owner-entered monthly costs for the profit view (rent, utilities, products, marketing…).
 * Changes apply from the month being edited: a recurring cost that started earlier is ended the
 * month before and a new one starts, so earlier months keep their figures.
 */
@Injectable()
export class SalonCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Costs that apply to `month`. */
  async forMonth(salonId: string, month: Month): Promise<SalonCostList> {
    const m = monthDate(month);
    const rows = await this.prisma.salonCost.findMany({
      where: {
        salonId,
        deletedAt: null,
        startMonth: { lte: m },
        OR: [
          { recurring: false, startMonth: m },
          { recurring: true, OR: [{ endMonth: null }, { endMonth: { gte: m } }] },
        ],
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });
    const items = rows.map(toDto);
    return { month, items, total: items.reduce((n, c) => n + c.amount, 0) };
  }

  async create(ctx: SalonContext, userId: string, raw: SalonCostInput): Promise<SalonCost> {
    const input = salonCostInputSchema.parse(raw);
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.salonCost.create({
        data: {
          salonId: ctx.salonId,
          name: input.name,
          category: input.category,
          amountMinor: BigInt(input.amount),
          recurring: input.recurring,
          startMonth: monthDate(input.month),
          createdByUserId: userId,
        },
      });
      await this.record(
        ctx,
        "costs.created",
        r.id,
        { month: input.month, recurring: input.recurring },
        tx,
      );
      return r;
    });
    return toDto(row);
  }

  async update(ctx: SalonContext, userId: string, id: string, input: SalonCostUpdate) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.salonCost.findFirst({
        where: { id, salonId: ctx.salonId, deletedAt: null },
      });
      if (!row) throw notFound();
      const data = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.amount !== undefined ? { amountMinor: BigInt(input.amount) } : {}),
      };
      const m = monthDate(input.month);
      let result: Row;
      if (row.recurring && row.startMonth < m) {
        // Split: earlier months keep the old figure.
        await tx.salonCost.update({
          where: { id: row.id },
          data: { endMonth: monthDate(addMonths(input.month, -1)) },
        });
        result = await tx.salonCost.create({
          data: {
            salonId: ctx.salonId,
            name: row.name,
            category: row.category,
            amountMinor: row.amountMinor,
            recurring: true,
            startMonth: m,
            endMonth: row.endMonth,
            createdByUserId: userId,
            ...data,
          },
        });
      } else {
        result = await tx.salonCost.update({ where: { id: row.id }, data });
      }
      await this.record(ctx, "costs.updated", row.id, { month: input.month, newId: result.id }, tx);
      return toDto(result);
    });
  }

  /** From `month` on: a recurring cost started earlier ends the month before; otherwise removed. */
  async remove(ctx: SalonContext, id: string, month: Month): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.salonCost.findFirst({
        where: { id, salonId: ctx.salonId, deletedAt: null },
      });
      if (!row) throw notFound();
      const m = monthDate(month);
      if (row.recurring && row.startMonth < m) {
        await tx.salonCost.update({
          where: { id: row.id },
          data: { endMonth: monthDate(addMonths(month, -1)) },
        });
      } else {
        await tx.salonCost.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
      }
      await this.record(ctx, "costs.removed", row.id, { month }, tx);
    });
  }

  private record(
    ctx: SalonContext,
    action: "costs.created" | "costs.updated" | "costs.removed",
    id: string,
    metadata: Record<string, string | boolean>,
    tx: Prisma.TransactionClient,
  ) {
    return this.audit.record(
      {
        action,
        salonId: ctx.salonId,
        organizationId: ctx.organizationId,
        targetType: "salon_cost",
        targetId: id,
        metadata,
      },
      tx,
    );
  }
}
