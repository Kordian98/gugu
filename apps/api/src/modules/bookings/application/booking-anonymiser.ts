import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
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
 *
 * `anonymiseSalonClient` + `cancelForErasure` are the salon-side variant used by the privacy tools
 * (topic 05 step 8, `customers.erase`): one salon, matched by the client's phone numbers, run
 * inside the privacy module's transaction; it also clears staff free text that may describe the
 * person (cancellation reason, offline-sale note, status-history reason text).
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

  /**
   * Salon-scoped anonymisation (customers.erase). Runs in the caller's transaction; returns the
   * ids of all matched bookings and of the upcoming ones (to cancel after commit).
   */
  async anonymiseSalonClient(
    tx: Prisma.TransactionClient,
    salonId: string,
    phones: readonly string[],
  ): Promise<{ bookingIds: string[]; upcomingIds: string[]; anonymised: number }> {
    if (phones.length === 0) return { bookingIds: [], upcomingIds: [], anonymised: 0 };
    const now = this.clock.now();
    const rows = await tx.booking.findMany({
      where: { salonId, customerPhoneE164: { in: [...phones] } },
      select: { id: true, status: true, startsAt: true },
    });
    const bookingIds = rows.map((r) => r.id);
    const upcomingIds = rows
      .filter((r) => (r.status === "pending" || r.status === "confirmed") && r.startsAt > now)
      .map((r) => r.id);
    if (bookingIds.length === 0) return { bookingIds, upcomingIds, anonymised: 0 };
    const { count } = await tx.booking.updateMany({
      where: { salonId, id: { in: bookingIds } },
      data: {
        customerName: ANONYMISED_CUSTOMER_NAME,
        customerPhoneE164: null,
        customerPhoneHash: null,
        customerNote: null,
        customerUserId: null,
        cancellationReason: null,
        overrideReason: null,
        identityVerified: false,
        manageTokenHash: null,
        manageTokenExpiresAt: null,
        customerAnonymisedAt: now,
      },
    });
    await tx.offlineSale.updateMany({
      where: { salonId, bookingId: { in: bookingIds }, note: { not: null } },
      data: { note: null },
    });
    // The only UPDATE the append-only trigger allows (migration add_privacy_admin_mfa).
    await tx.bookingStatusHistory.updateMany({
      where: { salonId, bookingId: { in: bookingIds }, reasonText: { not: null } },
      data: { reasonText: null },
    });
    return { bookingIds, upcomingIds, anonymised: count };
  }

  /**
   * Cancels already-anonymised upcoming bookings after the erasure committed (status history +
   * outbox, so the salon's calendar and notifications follow; customer messages are skipped
   * because the contact snapshot is gone). Returns how many were cancelled.
   */
  async cancelForErasure(salonId: string, bookingIds: readonly string[]): Promise<number> {
    if (bookingIds.length === 0) return 0;
    const ctx = await loadSalonContext(this.prisma, { id: salonId });
    if (!ctx) return 0;
    let cancelled = 0;
    for (const id of bookingIds) {
      try {
        await this.lifecycle.transition(
          ctx,
          { kind: "system" },
          id,
          { to: "cancelled_by_customer", reason: null, reasonCode: "client_data_erased" },
          null,
        );
        cancelled++;
      } catch (error) {
        this.logger.warn(
          { bookingId: id, err: (error as Error).message },
          "cancel on erase failed",
        );
      }
    }
    return cancelled;
  }
}
