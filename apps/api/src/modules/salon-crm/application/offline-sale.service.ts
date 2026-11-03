import { Injectable } from "@nestjs/common";
import { OFFLINE_SALE_ERRORS, type OfflineSale } from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import type { CrmScope } from "./crm-scope";

type Row = {
  id: string;
  bookingId: string;
  amountMinor: bigint;
  currency: string;
  method: OfflineSale["method"];
  note: string | null;
  recordedAt: Date;
};

const toDto = (r: Row): OfflineSale => ({
  id: r.id,
  bookingId: r.bookingId,
  amount: Number(r.amountMinor),
  currency: r.currency,
  method: r.method,
  note: r.note,
  recordedAt: r.recordedAt.toISOString(),
  revenueKind: "recorded_offline_sale",
});

/**
 * Optional "amount received" for a completed booking (07 §4.5, q22). One per booking; editing
 * replaces it. Informational: GuGu processes no payment.
 */
@Injectable()
export class OfflineSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** With an own scope, only sales of the member's own bookings (others read as not found). */
  async get(ctx: SalonContext, scope: CrmScope, bookingId: string): Promise<OfflineSale> {
    const row = await this.prisma.offlineSale.findFirst({
      where: {
        salonId: ctx.salonId,
        bookingId,
        // Any line of the member (booking engine read scope; security review L2).
        ...(scope.staffId
          ? {
              booking: {
                OR: [
                  { staffId: scope.staffId },
                  { services: { some: { staffId: scope.staffId } } },
                ],
              },
            }
          : {}),
      },
    });
    if (!row) throw new AppError(404, OFFLINE_SALE_ERRORS.notFound, "No amount recorded");
    return toDto(row);
  }

  async record(
    ctx: SalonContext,
    userId: string,
    bookingId: string,
    input: { amount: number; method: OfflineSale["method"]; note?: string | null | undefined },
  ): Promise<OfflineSale> {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, salonId: ctx.salonId },
        select: { status: true, currency: true },
      });
      if (!booking) throw new AppError(404, "booking.not_found", "Booking not found");
      if (booking.status !== "completed") {
        throw new AppError(409, OFFLINE_SALE_ERRORS.notCompleted, "Booking is not completed");
      }
      const data = {
        amountMinor: BigInt(input.amount),
        method: input.method,
        note: input.note ?? null,
        recordedByUserId: userId,
      };
      const row = await tx.offlineSale.upsert({
        where: { salonId_bookingId: { salonId: ctx.salonId, bookingId } },
        create: { salonId: ctx.salonId, bookingId, currency: booking.currency, ...data },
        update: data,
      });
      await this.audit.record(
        {
          action: "booking.offline_sale_recorded",
          salonId: ctx.salonId,
          organizationId: ctx.organizationId,
          targetType: "booking",
          targetId: bookingId,
          metadata: { method: input.method },
        },
        tx,
      );
      return toDto(row);
    });
  }
}
