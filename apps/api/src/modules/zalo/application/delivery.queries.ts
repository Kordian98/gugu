import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

export type ZaloSendOutcome = "queued" | "sent" | "failed" | "rejected";

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
 * route to this booking's customer, what happened to a given Zalo send, and the booking's Zalo
 * send log for the CRM timeline. Email is only the fallback, so it must know what Zalo did.
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

  /** The salon has a connected OA (Zalo goes first, email is the fallback). */
  async connected(salonId: string): Promise<boolean> {
    const conn = await this.prisma.zaloOaConnection.findUnique({
      where: { salonId },
      select: { status: true },
    });
    return conn?.status === "connected";
  }

  /** Outcome of one Zalo send by its dedup key, or null when Zalo never logged it. */
  async outcome(salonId: string, dedupKey: string): Promise<ZaloSendOutcome | null> {
    const log = await this.prisma.zaloSendLog.findFirst({
      where: { salonId, dedupKey },
      select: { status: true },
    });
    return log?.status ?? null;
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
