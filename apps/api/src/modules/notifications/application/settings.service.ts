import { Injectable } from "@nestjs/common";
import {
  DEFAULT_REMINDER_OFFSETS,
  isTeamEvent,
  type NotificationSettings,
  type NotificationSettingsInput,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { appendOutbox } from "../../../infrastructure/outbox/outbox.writer";
import { OutboxRelay } from "../../../infrastructure/outbox/outbox.relay";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { ZaloDeliveryQueries } from "../../zalo/zalo.facade";
import { ALL_EVENTS, channelEnabled, type StoredEventSettings } from "../domain/catalog";

export interface StoredSettings {
  events: StoredEventSettings;
  replyToEmail: string | null;
  reminderOffsets: number[];
}

/**
 * Per-salon notification settings (topic 11): on/off per event × channel, reminder offsets
 * (salon_settings.reminder_offsets, default 24 h + 2 h) and the reply-to address for customer
 * emails. Saving writes an audit row and a `notifications.settings_updated` outbox event so the
 * worker re-plans pending reminders.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxRelay,
    private readonly zalo: ZaloDeliveryQueries,
  ) {}

  async stored(salonId: string): Promise<StoredSettings> {
    const [row, salonSettings] = await Promise.all([
      this.prisma.notificationSettings.findUnique({ where: { salonId } }),
      this.prisma.salonSettings.findUnique({
        where: { salonId },
        select: { reminderOffsets: true },
      }),
    ]);
    return {
      events: (row?.events ?? {}) as StoredEventSettings,
      replyToEmail: row?.replyToEmail ?? null,
      reminderOffsets: salonSettings?.reminderOffsets ?? [...DEFAULT_REMINDER_OFFSETS],
    };
  }

  async get(salonId: string): Promise<NotificationSettings> {
    const [s, zaloConnected] = await Promise.all([
      this.stored(salonId),
      this.zalo.connected(salonId),
    ]);
    return {
      events: ALL_EVENTS.map((event) => {
        const team = isTeamEvent(event);
        return {
          event,
          audience: team ? "team" : "customer",
          email: channelEnabled(s.events, event, "email"),
          inApp: team ? channelEnabled(s.events, event, "in_app") : null,
        };
      }),
      reminderOffsetsMinutes: [...s.reminderOffsets].sort((a, b) => b - a),
      replyToEmail: s.replyToEmail,
      zaloConnected,
    };
  }

  async update(
    salon: SalonContext,
    userId: string,
    input: NotificationSettingsInput,
  ): Promise<NotificationSettings> {
    const current = await this.stored(salon.salonId);
    const events: StoredEventSettings = { ...current.events };
    for (const e of input.events) {
      events[e.event] = {
        email: e.email,
        ...(isTeamEvent(e.event) && typeof e.inApp === "boolean" ? { in_app: e.inApp } : {}),
      };
    }
    const offsets = [...input.reminderOffsetsMinutes].sort((a, b) => b - a);
    const replyTo = input.replyToEmail?.trim().toLowerCase() || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationSettings.upsert({
        where: { salonId: salon.salonId },
        create: {
          salonId: salon.salonId,
          events: events,
          replyToEmail: replyTo,
        },
        update: { events: events, replyToEmail: replyTo },
      });
      await tx.salonSettings.upsert({
        where: { salonId: salon.salonId },
        create: { salonId: salon.salonId, reminderOffsets: offsets },
        update: { reminderOffsets: offsets },
      });
      await this.audit.record(
        {
          action: "notifications.settings_updated",
          actor: { type: "user", id: userId },
          salonId: salon.salonId,
          targetType: "salon",
          targetId: salon.salonId,
          // Codes only; the reply-to address itself is personal data and stays out of the audit.
          metadata: {
            reminderOffsets: offsets.join(","),
            replyToSet: replyTo !== null,
            disabled: ALL_EVENTS.flatMap((e) =>
              (["email", "in_app"] as const)
                .filter((c) => events[e]?.[c] === false)
                .map((c) => `${e}:${c}`),
            ).join(","),
          },
        },
        tx,
      );
      await appendOutbox(tx, {
        salonId: salon.salonId,
        aggregateType: "salon",
        aggregateId: salon.salonId,
        type: "notifications.settings_updated",
        payload: { salonId: salon.salonId },
      });
    });
    await this.outbox.kick();
    return this.get(salon.salonId);
  }
}
