import { Injectable } from "@nestjs/common";
import type { BookingMessage, BookingMessages, ZaloReach } from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { AppError } from "../../../common/problem/app-error";
import { COMMON_ERRORS } from "../../../common/problem/error-codes";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { ZaloDeliveryQueries } from "../../zalo/zalo.facade";

const notFound = () => new AppError(404, COMMON_ERRORS.notFound, "Booking not found");

/**
 * "Messages sent" timeline of one booking for the CRM drawer (spec 11 §9 `notifications.bookingLog`):
 * the booking's Zalo sends (module `zalo`) — the only messages a salon's customer ever gets (X26) —
 * plus whether the salon's OA can reach the customer now (`zaloReach`), so staff know when to call.
 * Channel, status, reason and times only — no address, no content. Same booking scope as
 * the booking itself: `bookings.read`, or `bookings.read.own` for the member's own bookings
 * (another salon's booking or someone else's for own-scope staff → 404).
 */
@Injectable()
export class TimelineQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zalo: ZaloDeliveryQueries,
  ) {}

  async forBooking(
    salon: SalonContext,
    userId: string,
    bookingId: string,
  ): Promise<BookingMessages> {
    let staffOnly: string | null = null;
    if (!salon.permissions.has("bookings.read")) {
      if (!salon.permissions.has("bookings.read.own")) {
        throw new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
      }
      const own = await this.prisma.staffProfile.findFirst({
        where: { salonId: salon.salonId, deletedAt: null, member: { userId } },
        select: { id: true },
      });
      if (!own) throw new AppError(403, COMMON_ERRORS.forbidden, "Permission required");
      staffOnly = own.id;
    }
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        salonId: salon.salonId,
        // Own scope: any service of the appointment (M6.8).
        ...(staffOnly
          ? { OR: [{ staffId: staffOnly }, { services: { some: { staffId: staffOnly } } }] }
          : {}),
      },
      select: { id: true },
    });
    if (!booking) throw notFound();
    const [sends, messaging, route] = await Promise.all([
      this.zalo.forBooking(salon.salonId, bookingId),
      this.zalo.customerMessaging(salon.salonId),
      this.zalo.route(salon.salonId, bookingId),
    ]);
    const items: BookingMessage[] = sends.map((z) => ({
      id: z.id,
      channel: z.channel === "template" ? "zalo_template" : "zalo_chat",
      kind: z.purpose,
      offsetMinutes: z.purpose === "reminder_24h" ? 1440 : z.purpose === "reminder_2h" ? 120 : null,
      status: z.status,
      reason: z.errorCode,
      sentAt: z.sentAt?.toISOString() ?? null,
      createdAt: z.createdAt.toISOString(),
    }));
    const zaloReach: ZaloReach = !messaging.connected
      ? "not_connected"
      : route.usable
        ? "reachable"
        : "not_linked";
    return { items, zaloReach };
  }
}
