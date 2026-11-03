import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

export type ZaloSendOutcome = "queued" | "sent" | "failed" | "rejected";

/** What the salon's OA sends to customers on its own (connection + reminder switches). */
export interface ZaloCustomerMessaging {
  connected: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
}

export interface ZaloRoute {
  /** Connected OA and the booking is (or can be) linked to exactly one conversation. */
  usable: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
}

export interface ZaloBookingSend {
  id: string;
  channel: "cs" | "template";
  purpose: string;
  status: ZaloSendOutcome;
  errorCode: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

/**
 * Read-only view of Zalo delivery for the notifications module (topic 11): is there a usable Zalo
 * route to this booking's customer, what the OA sends on its own, and the booking's Zalo send log
 * for the CRM timeline. The salon's OA is the only way GuGu reaches a salon's customers (X26).
 * Mirrors the linking rule of BookingUpdatesService/RemindersService (link, or exactly one
 * conversation with the booking's phone). Never returns message text, Zalo user ids or phones.
 */
@Injectable()
export class ZaloDeliveryQueries {
  constructor(private readonly prisma: PrismaService) {}

  async route(salonId: string, bookingId: string): Promise<ZaloRoute> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, salonId },
      select: {
        customerPhoneE164: true,
        zaloLink: { select: { conversationId: true } },
        salon: {
          select: {
            zaloConnection: { select: { status: true, reminder24h: true, reminder2h: true } },
          },
        },
      },
    });
    const conn = booking?.salon.zaloConnection;
    const none = { usable: false, reminder24h: false, reminder2h: false };
    if (!booking || conn?.status !== "connected") return none;
    let linked = booking.zaloLink !== null;
    if (!linked && booking.customerPhoneE164) {
      const matches = await this.prisma.zaloConversation.count({
        where: { salonId, phoneE164: booking.customerPhoneE164 },
      });
      linked = matches === 1;
    }
    return linked
      ? { usable: true, reminder24h: conn.reminder24h, reminder2h: conn.reminder2h }
      : none;
  }

  /** Connected OA and its reminder switches (reminders off when not connected). */
  async customerMessaging(salonId: string): Promise<ZaloCustomerMessaging> {
    const conn = await this.prisma.zaloOaConnection.findUnique({
      where: { salonId },
      select: { status: true, reminder24h: true, reminder2h: true },
    });
    const connected = conn?.status === "connected";
    return {
      connected,
      reminder24h: connected && conn.reminder24h,
      reminder2h: connected && conn.reminder2h,
    };
  }

  /** Customer-facing Zalo sends about one booking (bot replies excluded). */
  async forBooking(salonId: string, bookingId: string): Promise<ZaloBookingSend[]> {
    const rows = await this.prisma.zaloSendLog.findMany({
      where: { salonId, bookingId, purpose: { notIn: ["bot_reply", "staff_reply"] } },
      select: {
        id: true,
        channel: true,
        purpose: true,
        status: true,
        errorCode: true,
        createdAt: true,
        sentAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return rows.map((r) => ({ ...r, channel: r.channel === "template" ? "template" : "cs" }));
  }
}
