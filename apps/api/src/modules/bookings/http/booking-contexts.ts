import { Injectable } from "@nestjs/common";
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

  /** Public booking page: only live (`active`) salons; drafts look like they don't exist. */
  async forPublicSlug(slug: string): Promise<SalonBookingContext> {
    const ctx = await loadSalonContext(this.prisma, { slug });
    if (!ctx?.isLive) throw notFound();
    return ctx;
  }
}
