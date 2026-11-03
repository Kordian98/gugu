import { Injectable } from "@nestjs/common";
import { SALON_SUSPENDED_ERROR } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { loadSalonContext, type SalonBookingContext } from "../infra/booking-inputs";

const notFound = () => new AppError(404, COMMON_ERRORS.notFound, "Salon not found");

/** Salon + booking settings for a request (tenant id from the guard, or a public slug). */
@Injectable()
export class BookingContexts {
  constructor(private readonly prisma: PrismaService) {}

  async forSalon(salonId: string): Promise<SalonBookingContext> {
    const ctx = await loadSalonContext(this.prisma, { id: salonId });
    if (!ctx) throw notFound();
    return ctx;
  }

  /**
   * Writes outside the salon guard (customer manage links) honour platform suspension the same way
   * the guard does for members: read-only, 403 `salon.suspended` (topic 12 M12.6).
   */
  async assertWritable(salonId: string): Promise<void> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { status: true },
    });
    if (salon?.status === "suspended") {
      throw new AppError(403, SALON_SUSPENDED_ERROR, "Salon is suspended");
    }
  }

  /** Public booking page: only live (`active`) salons; drafts look like they don't exist. */
  async forPublicSlug(slug: string): Promise<SalonBookingContext> {
    const ctx = await loadSalonContext(this.prisma, { slug });
    if (!ctx?.isLive) throw notFound();
    return ctx;
  }
}
