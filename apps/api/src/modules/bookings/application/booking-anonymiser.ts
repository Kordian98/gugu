import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { loadSalonContext } from "../infra/booking-inputs";
import { BookingClock } from "./booking-clock";
import { BookingLifecycleCommands } from "./booking-lifecycle.commands";

/** Stored in place of the customer's name; clients show a localized "deleted customer" label. */
export const ANONYMISED_CUSTOMER_NAME = "[deleted]";

/**
 * Account-deletion hook for bookings (q71, spec 06 §3.13). Called by the privacy job (topic 05)
 * when a customer's grace period ends. Bookings are never deleted — salons keep their history and
 * metrics — but:
 * 1. upcoming pending/confirmed bookings are cancelled as `cancelled_by_customer`, reason code
 *    `account_deleted`, actor `system` (status history + outbox, so the salon is told);
 * 2. every matching booking loses its contact snapshot: name → placeholder, phone, phone hash,
 *    customer note, account link and manage link cleared; `customer_anonymised_at` set.
 * Matches bookings linked to the account and bookings entered with the account's phone number.
 * Idempotent: re-running finds nothing left to change.
 * Not covered here: free-text reasons in the append-only status history, Zalo conversations (09),
 * salon client profiles/notes (07/05).
 */
@Injectable()
export class BookingAnonymiser {
  private readonly logger = new Logger(BookingAnonymiser.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: BookingLifecycleCommands,
    private readonly clock: BookingClock,
  ) {}

  async anonymiseCustomer(who: {
    userId: string;
    phoneE164: string | null;
  }): Promise<{ cancelled: number; anonymised: number }> {
    const match = {
      OR: [
        { customerUserId: who.userId },
        ...(who.phoneE164 ? [{ customerPhoneE164: who.phoneE164 }] : []),
      ],
    };
    const now = this.clock.now();
    const upcoming = await this.prisma.booking.findMany({
      where: { ...match, status: { in: ["pending", "confirmed"] }, startsAt: { gt: now } },
      select: { id: true, salonId: true },
    });
    let cancelled = 0;
    for (const b of upcoming) {
      const ctx = await loadSalonContext(this.prisma, { id: b.salonId });
      if (!ctx) continue;
      try {
        await this.lifecycle.transition(
          ctx,
          { kind: "system" },
          b.id,
          { to: "cancelled_by_customer", reason: null, reasonCode: "account_deleted" },
          null,
        );
        cancelled++;
      } catch (error) {
        // Raced with a salon change (e.g. just checked in): the booking stays, still anonymised.
        this.logger.warn(
          { bookingId: b.id, err: (error as Error).message },
          "cancel on deletion failed",
        );
      }
    }
    const { count } = await this.prisma.booking.updateMany({
      where: { ...match, customerAnonymisedAt: null },
      data: {
        customerName: ANONYMISED_CUSTOMER_NAME,
        customerPhoneE164: null,
        customerPhoneHash: null,
        customerNote: null,
        customerUserId: null,
        identityVerified: false,
        manageTokenHash: null,
        manageTokenExpiresAt: null,
        customerAnonymisedAt: now,
      },
    });
    return { cancelled, anonymised: count };
  }
}
