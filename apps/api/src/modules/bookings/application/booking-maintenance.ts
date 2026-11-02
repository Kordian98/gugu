import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { loadSalonContext } from "../infra/booking-inputs";
import { BookingClock } from "./booking-clock";
import { BookingLifecycleCommands } from "./booking-lifecycle.commands";

const BATCH = 100;

/**
 * Periodic housekeeping (maintenance queue, every minute): deletes expired holds (their
 * occupancy cascades) and auto-cancels pending bookings the salon didn't confirm in time (q13).
 * Expired holds never block anyone even before the sweep — writers drop them under the staff lock.
 */
@Injectable()
export class BookingMaintenance {
  private readonly logger = new Logger(BookingMaintenance.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: BookingClock,
    private readonly lifecycle: BookingLifecycleCommands,
  ) {}

  async sweep(): Promise<{ holdsDeleted: number; pendingExpired: number }> {
    const now = this.clock.now();
    const { count: holdsDeleted } = await this.prisma.bookingHold.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    const due = await this.prisma.booking.findMany({
      where: { status: "pending", pendingExpiresAt: { lte: now } },
      select: { id: true, salonId: true },
      orderBy: { pendingExpiresAt: "asc" },
      take: BATCH,
    });
    let pendingExpired = 0;
    for (const b of due) {
      const ctx = await loadSalonContext(this.prisma, { id: b.salonId });
      if (!ctx) continue;
      try {
        await this.lifecycle.transition(
          ctx,
          { kind: "system" },
          b.id,
          { to: "cancelled_by_salon", reason: null, reasonCode: "pending_expired" },
          null,
        );
        pendingExpired++;
      } catch (error) {
        this.logger.warn(
          { bookingId: b.id, err: (error as Error).message },
          "pending expiry failed",
        );
      }
    }
    return { holdsDeleted, pendingExpired };
  }
}
