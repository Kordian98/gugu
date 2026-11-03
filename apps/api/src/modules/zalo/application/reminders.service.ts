import { Injectable } from "@nestjs/common";
import { createI18n } from "@gugu/localization";
import { UPCOMING_BOOKING_STATUSES } from "@gugu/domain";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { bookingPayload } from "../domain/bot/payload";
import { decideCs } from "../domain/window";
import { type OutboundItem, OutboundService, type TemplateData } from "./outbound.service";
import { ZaloClock } from "./zalo-clock";

const HOUR = 3_600_000;
const BATCH = 200;

export type ReminderKind = "reminder_24h" | "reminder_2h";

/**
 * Which reminder is due for a booking now (pure). 24 h: inside 24 h but more than 2 h ahead; 2 h:
 * inside 2 h. A reminder is skipped when the booking was made after its moment (the confirmation
 * already told the customer).
 */
export function dueReminder(
  b: { startsAt: Date; createdAt: Date },
  now: Date,
  enabled: { h24: boolean; h2: boolean },
): ReminderKind | null {
  const lead = b.startsAt.getTime() - now.getTime();
  if (lead <= 0) return null;
  if (lead <= 2 * HOUR) {
    return enabled.h2 && b.createdAt.getTime() <= b.startsAt.getTime() - 2 * HOUR
      ? "reminder_2h"
      : null;
  }
  if (lead <= 24 * HOUR) {
    return enabled.h24 && b.createdAt.getTime() <= b.startsAt.getTime() - 24 * HOUR
      ? "reminder_24h"
      : null;
  }
  return null;
}

/**
 * Appointment reminders (24 h and 2 h, q40: on by default) for bookings linked to a Zalo
 * conversation — made by the bot, or by staff for a customer whose phone matches exactly one
 * conversation. Inside the 7-day window the reminder is a consultation message with
 * Confirm / Reschedule / Cancel buttons handled by the bot; otherwise a ZBS template message.
 * Each (booking, reminder) is logged once (dedup key), whatever the outcome.
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundService,
    private readonly clock: ZaloClock,
  ) {}

  async scan(): Promise<{ queued: number }> {
    const now = this.clock.now();
    await this.linkByPhone(now);
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [...UPCOMING_BOOKING_STATUSES] },
        startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
        zaloLink: { isNot: null },
        salon: { zaloConnection: { status: "connected" } },
      },
      include: {
        zaloLink: { include: { conversation: true } },
        services: { orderBy: { sequence: "asc" } },
        salon: { select: { name: true, timezone: true, zaloConnection: true } },
      },
      orderBy: { startsAt: "asc" },
      take: BATCH,
    });
    let queued = 0;
    for (const b of bookings) {
      const conn = b.salon.zaloConnection;
      const conv = b.zaloLink?.conversation;
      if (!conn || !conv) continue;
      const kind = dueReminder(b, now, { h24: conn.reminder24h, h2: conn.reminder2h });
      if (!kind) continue;
      const dedupKey = `${kind}:${b.id}`;
      if (await this.prisma.zaloSendLog.count({ where: { dedupKey } })) continue;

      const locale = "vi" as const;
      const { t } = createI18n(locale);
      const time = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: b.salon.timezone,
      }).format(b.startsAt);
      // Every service of a multi-service booking (M6.8): "Sơn gel + Pedicure".
      const serviceName = b.services
        .map((l) => ((l.name ?? {}) as { vi?: string }).vi ?? "")
        .join(" + ");
      const text = t(`zalo:bot.${kind === "reminder_24h" ? "reminder24h" : "reminder2h"}`, {
        when: time,
        service: serviceName,
        salon: b.salon.name,
        ref: b.referenceCode,
      });
      const decision = decideCs(conv.lastUserInteractionAt, now, conn.allowPaidMessages);
      const item: OutboundItem = decision.send
        ? {
            channel: "cs",
            purpose: kind,
            conversationId: conv.id,
            sender: "system",
            bookingId: b.id,
            dedupKey,
            message: {
              kind: "text",
              text,
              buttons: [
                { title: t("zalo:bot.reminderConfirm"), payload: bookingPayload("confirm", b.id) },
                { title: t("zalo:bot.changeTime"), payload: bookingPayload("resched", b.id) },
                { title: t("zalo:bot.cancelFlow"), payload: bookingPayload("cancel", b.id) },
              ],
            },
          }
        : {
            channel: "template",
            purpose: kind,
            conversationId: conv.id,
            bookingId: b.id,
            templateKey: "booking_reminder",
            phoneE164: conv.phoneE164 ?? b.customerPhoneE164,
            data: templateData(
              b.customerName ?? conv.displayName ?? "",
              b.referenceCode,
              serviceName,
              time,
              b.salon.name,
            ),
            previewText: text,
            dedupKey,
          };
      const ids = await this.outbound.send(b.salonId, [item]);
      queued += ids.length;
    }
    return { queued };
  }

  /**
   * Staff-entered bookings (phone, walk-in, Zalo chat) get reminders when the customer's phone
   * matches exactly one Zalo conversation of that salon.
   */
  private async linkByPhone(now: Date): Promise<void> {
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: { in: [...UPCOMING_BOOKING_STATUSES] },
        startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
        zaloLink: { is: null },
        customerPhoneE164: { not: null },
        salon: { zaloConnection: { status: "connected" } },
      },
      select: { id: true, salonId: true, customerPhoneE164: true },
      take: BATCH,
    });
    for (const b of candidates) {
      const convs = await this.prisma.zaloConversation.findMany({
        where: { salonId: b.salonId, phoneE164: b.customerPhoneE164 },
        select: { id: true },
        take: 2,
      });
      const only = convs.length === 1 ? convs[0] : undefined;
      if (!only) continue;
      await this.prisma.zaloBookingLink.upsert({
        where: { bookingId: b.id },
        create: { bookingId: b.id, salonId: b.salonId, conversationId: only.id },
        update: {},
      });
    }
  }
}

export function templateData(
  customer: string,
  code: string,
  service: string,
  time: string,
  salon: string,
): TemplateData {
  return {
    customer_name: customer,
    booking_code: code,
    service_name: service,
    booking_time: time,
    salon_name: salon,
  };
}
