import { Injectable } from "@nestjs/common";
import { BOOKING_ERRORS, type Hold } from "@gugu/contracts";
import { findSlot, toLocal } from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import {
  loadAvailabilityInput,
  resolveSelection,
  type SalonBookingContext,
  type ServiceSelection,
} from "../infra/booking-inputs";
import {
  insertOccupancy,
  isSlotConflict,
  lockClaims,
  releaseExpiredHolds,
} from "../infra/occupancy";
import { AvailabilityCache } from "../infra/availability-cache";
import { BookingClock } from "./booking-clock";
import { slotTaken } from "./booking-errors";

const MINUTE = 60_000;

/**
 * Temporary holds for the public booking page (spec 06 §3.5): one active hold per device and salon
 * (a new one replaces the old), TTL from salon settings, claimed in booking_occupancy so nobody
 * else can take the slot while the customer types their name and phone.
 */
@Injectable()
export class HoldsCommand {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: BookingClock,
    private readonly cache: AvailabilityCache,
  ) {}

  async create(
    ctx: SalonBookingContext,
    deviceHash: string,
    req: ServiceSelection & { serviceId: string; staffId: string | null; startsAt: Date },
  ): Promise<Hold> {
    const now = this.clock.now();
    try {
      const hold = await this.prisma.$transaction(
        async (tx) => {
          const selection = await resolveSelection(tx, ctx.salonId, req);
          if (req.staffId !== null && ctx.settings.hideStaffChoice) {
            throw new AppError(
              422,
              BOOKING_ERRORS.staffSelectionDisabled,
              "Staff choice is disabled",
            );
          }
          if (req.staffId !== null && !selection.staffTerms.has(req.staffId)) throw slotTaken();
          const candidates = req.staffId ? [req.staffId] : [...selection.staffTerms.keys()];
          if (candidates.length === 0) throw slotTaken();

          const unitIds = selection.units.map((u) => u.unitId);
          await lockClaims(tx, [...candidates, ...unitIds]);
          await releaseExpiredHolds(tx, ctx.salonId, candidates, now, unitIds);
          await tx.bookingHold.deleteMany({ where: { salonId: ctx.salonId, deviceHash } });

          const start = req.startsAt.getTime();
          const date = toLocal(start, ctx.timeZone).date;
          const input = await loadAvailabilityInput(tx, ctx, selection, {
            from: date,
            to: date,
            staffIds: candidates,
            now,
          });
          const option = findSlot(input, start, req.staffId)?.options[0];
          if (!option) throw slotTaken();

          const expiresAt = new Date(now.getTime() + ctx.settings.holdTtlMinutes * MINUTE);
          const hold = await tx.bookingHold.create({
            data: {
              salonId: ctx.salonId,
              staffId: option.staffId,
              serviceId: req.serviceId,
              variantId: selection.variantId,
              addOnIds: [...selection.addOnIds],
              startsAt: new Date(option.start),
              endsAt: new Date(option.end),
              expiresAt,
              deviceHash,
            },
          });
          await insertOccupancy(tx, {
            salonId: ctx.salonId,
            staffId: option.staffId,
            unitIds: option.unitIds,
            period: option.occupancy,
            hold: { id: hold.id, expiresAt },
          });
          return {
            id: hold.id,
            staffId: hold.staffId,
            startsAt: hold.startsAt.toISOString(),
            endsAt: hold.endsAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          };
        },
        { timeout: 20_000, maxWait: 15_000 },
      );
      await this.cache.bumpOccupancy(ctx.salonId);
      return hold;
    } catch (error) {
      if (isSlotConflict(error)) throw slotTaken();
      throw error;
    }
  }

  /** The device releases its hold (customer went back). */
  async release(ctx: SalonBookingContext, deviceHash: string, holdId: string): Promise<void> {
    await this.cache.bumpOccupancy(ctx.salonId);
    await this.prisma.bookingHold.deleteMany({
      where: { id: holdId, salonId: ctx.salonId, deviceHash },
    });
  }
}
