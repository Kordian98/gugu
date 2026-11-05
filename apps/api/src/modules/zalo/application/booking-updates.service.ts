import { Injectable } from "@nestjs/common";
import { createI18n, formatDateTimeShort } from "@gugu/localization";
import { UPCOMING_BOOKING_STATUSES } from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { decideCs } from "../domain/window";
import { type OutboundItem, OutboundService } from "./outbound.service";
import { templateData } from "./reminders.service";
import { ZaloClock } from "./zalo-clock";

type Update = "confirmed" | "cancelled" | "rescheduled";

/**
 * Tells Zalo customers about changes the salon makes in GuGu Studio (topic 06 outbox events):
 * staff-entered bookings for a known Zalo customer (confirmation), a pending booking confirmed,
 * a booking cancelled or moved by the salon. Changes the customer made in the chat are skipped
 * (the bot already answered). Fed by `ZaloBookingEventsHandler` from the outbox relay (04-S5) right
 * after the commit. Reschedules dedupe by booking revision; other updates by outbox event id.
 */
@Injectable()
export class BookingUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundService,
    private readonly clock: ZaloClock,
  ) {}

  async handle(eventId: string, type: string, payload: Record<string, unknown>): Promise<number> {
    const bookingId = typeof payload["bookingId"] === "string" ? payload["bookingId"] : null;
    if (!bookingId) return 0;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        services: { orderBy: { sequence: "asc" } },
        zaloLink: { include: { conversation: true } },
        salon: { select: { name: true, timezone: true, zaloConnection: true } },
      },
    });
    const conn = booking?.salon.zaloConnection;
    if (!booking || conn?.status !== "connected") return 0;

    let update: Update | null = null;
    if (type === "booking.created") {
      if (booking.createdByActorType !== "salon_member") return 0;
      update = "confirmed";
    } else if (type === "booking.status_changed") {
      if (payload["actorType"] !== "salon_member") return 0;
      if (payload["to"] === "confirmed" && payload["from"] === "pending") update = "confirmed";
      else if (payload["to"] === "cancelled_by_salon") update = "cancelled";
    } else if (type === "booking.rescheduled" && payload["actorType"] === "salon_member") {
      update = "rescheduled";
    }
    if (!update) return 0;
    const version = payload["version"];
    // Also protects A→B→A moves and a cancellation/completion before the outbox was consumed.
    if (
      update === "rescheduled" &&
      (!UPCOMING_BOOKING_STATUSES.includes(booking.status) ||
        typeof version !== "number" ||
        version !== booking.version ||
        (typeof payload["toStartsAt"] === "string" &&
          payload["toStartsAt"] !== booking.startsAt.toISOString()))
    )
      return 0;

    let conv = booking.zaloLink?.conversation ?? null;
    if (!conv && booking.customerPhoneE164) {
      const matches = await this.prisma.zaloConversation.findMany({
        where: { salonId: booking.salonId, phoneE164: booking.customerPhoneE164 },
        take: 2,
      });
      conv = matches.length === 1 ? (matches[0] ?? null) : null;
      if (conv) {
        await this.prisma.zaloBookingLink.upsert({
          where: { bookingId },
          create: { bookingId, salonId: booking.salonId, conversationId: conv.id },
          update: {},
        });
      }
    }
    if (!conv) return 0;

    const { t } = createI18n("vi");
    const tz = booking.salon.timezone;
    const time = formatDateTimeShort(booking.startsAt, "vi", tz);
    // Every service of a multi-service booking (M6.8): "Sơn gel + Pedicure".
    const service = booking.services
      .map((l) => ((l.name ?? {}) as { vi?: string }).vi ?? "")
      .join(" + ");
    const vars = { ref: booking.referenceCode, service, when: time, salon: booking.salon.name };
    const text =
      update === "confirmed"
        ? t("zalo:bot.updateConfirmed", vars)
        : update === "cancelled"
          ? t("zalo:bot.updateCancelled", vars)
          : t("zalo:bot.updateRescheduled", vars);
    const dedupKey =
      update === "rescheduled" && typeof version === "number"
        ? `booking_update:rescheduled:${booking.id}:${String(version)}`
        : `booking_update:${eventId}`;
    const decision = decideCs(conv.lastUserInteractionAt, this.clock.now(), conn.allowPaidMessages);
    // A move reconfirms the appointment at its new time. Use the existing approved confirmation
    // template when consultation messages cannot be sent; cancellation has no such template.
    const item: OutboundItem =
      decision.send || update === "cancelled"
        ? {
            channel: "cs",
            purpose: `booking_${update}`,
            conversationId: conv.id,
            sender: "system",
            bookingId,
            ...(update === "rescheduled" ? { bookingVersion: booking.version } : {}),
            dedupKey,
            message: { kind: "text", text, buttons: [] },
          }
        : {
            channel: "template",
            purpose: update === "rescheduled" ? "booking_rescheduled" : "booking_confirmation",
            conversationId: conv.id,
            bookingId,
            ...(update === "rescheduled" ? { bookingVersion: booking.version } : {}),
            templateKey: "booking_confirmation",
            phoneE164: conv.phoneE164 ?? booking.customerPhoneE164,
            data: templateData(
              booking.customerName ?? conv.displayName ?? "",
              booking.referenceCode,
              service,
              time,
              booking.salon.name,
            ),
            previewText: text,
            dedupKey,
          };
    return (await this.outbound.send(booking.salonId, [item])).length;
  }
}
