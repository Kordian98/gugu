import { Injectable } from "@nestjs/common";
import { createI18n } from "@gugu/localization";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../../infrastructure/redis/redis.service";
import { decideCs } from "../domain/window";
import { type OutboundItem, OutboundService } from "./outbound.service";
import { templateData } from "./reminders.service";
import { ZaloClock } from "./zalo-clock";

const CURSOR_KEY = "zalo:booking-events-cursor";
/** Only events at least this old are read, so slower transactions that commit late are not skipped. */
const LAG_MS = 30_000;
const BATCH = 200;

type Update = "confirmed" | "cancelled" | "rescheduled";

/**
 * Tells Zalo customers about changes the salon makes in GuGu Studio (topic 06 outbox events):
 * staff-entered bookings for a known Zalo customer (confirmation), a pending booking confirmed,
 * a booking cancelled or moved by the salon. Changes the customer made in the chat are skipped
 * (the bot already answered). Reads the transactional outbox with its own cursor until the shared
 * relay (04-S5) exists; then this becomes a normal event consumer.
 */
@Injectable()
export class BookingUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly outbound: OutboundService,
    private readonly clock: ZaloClock,
  ) {}

  async scan(): Promise<{ queued: number }> {
    const now = this.clock.now();
    const until = new Date(now.getTime() - LAG_MS);
    const cursor = await this.redis.client.get(CURSOR_KEY);
    if (!cursor) {
      // First run: start from now, never replay history.
      await this.redis.client.set(CURSOR_KEY, until.toISOString());
      return { queued: 0 };
    }
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        aggregateType: "booking",
        type: { in: ["booking.created", "booking.status_changed", "booking.rescheduled"] },
        occurredAt: { gt: new Date(cursor), lte: until },
      },
      orderBy: { occurredAt: "asc" },
      take: BATCH,
    });
    let queued = 0;
    for (const event of events) {
      queued += await this.handle(event.id, event.type, event.payload as Record<string, unknown>);
    }
    const last = events.at(-1);
    const next = events.length === BATCH && last ? last.occurredAt : until;
    await this.redis.client.set(CURSOR_KEY, next.toISOString());
    return { queued };
  }

  private async handle(
    eventId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<number> {
    const bookingId = typeof payload["bookingId"] === "string" ? payload["bookingId"] : null;
    if (!bookingId) return 0;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        services: true,
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
    const time = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    }).format(booking.startsAt);
    const service = ((booking.services[0]?.name ?? {}) as { vi?: string }).vi ?? "";
    const vars = { ref: booking.referenceCode, service, when: time, salon: booking.salon.name };
    const text =
      update === "confirmed"
        ? t("zalo:bot.updateConfirmed", vars)
        : update === "cancelled"
          ? t("zalo:bot.updateCancelled", vars)
          : t("zalo:bot.rescheduled", vars);
    const dedupKey = `booking_update:${eventId}`;
    const decision = decideCs(conv.lastUserInteractionAt, this.clock.now(), conn.allowPaidMessages);
    // Outside the 7-day window only a confirmation has a template; other changes are still logged
    // (as rejected) so staff can see the customer was not told and call instead.
    const item: OutboundItem =
      decision.send || update !== "confirmed"
        ? {
            channel: "cs",
            purpose: `booking_${update}`,
            conversationId: conv.id,
            sender: "system",
            bookingId,
            dedupKey,
            message: { kind: "text", text, buttons: [] },
          }
        : {
            channel: "template",
            purpose: "booking_confirmation",
            conversationId: conv.id,
            bookingId,
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
