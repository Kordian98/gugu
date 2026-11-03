import { Injectable } from "@nestjs/common";
import type { NotificationSettings, NotificationSettingsInput } from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { ZaloDeliveryQueries } from "../../zalo/zalo.facade";
import { channelEnabled, type StoredEventSettings, TEAM_EVENTS } from "../domain/catalog";

export interface StoredSettings {
  events: StoredEventSettings;
}

/**
 * Per-salon team notification settings (topic 11): bell item and email copy on/off per team event.
 * Settings → Notifications also shows, read-only, what the salon's Zalo OA sends to customers
 * (connection and the 24 h / 2 h reminder switches, which module `zalo` owns and Settings → Zalo
 * edits). There is nothing to configure for customer email: GuGu never emails customers (X26).
 * Saving writes an audit row (codes only).
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly zalo: ZaloDeliveryQueries,
  ) {}

  async stored(salonId: string): Promise<StoredSettings> {
    const row = await this.prisma.notificationSettings.findUnique({ where: { salonId } });
    return { events: (row?.events ?? {}) as StoredEventSettings };
  }

  async get(salonId: string): Promise<NotificationSettings> {
    const [s, zalo] = await Promise.all([
      this.stored(salonId),
      this.zalo.customerMessaging(salonId),
    ]);
    return {
      events: TEAM_EVENTS.map((event) => ({
        event,
        email: channelEnabled(s.events, event, "email"),
        inApp: channelEnabled(s.events, event, "in_app"),
      })),
      zalo,
    };
  }

  async update(
    salon: SalonContext,
    userId: string,
    input: NotificationSettingsInput,
  ): Promise<NotificationSettings> {
    const current = await this.stored(salon.salonId);
    const events: StoredEventSettings = { ...current.events };
    for (const e of input.events) events[e.event] = { email: e.email, in_app: e.inApp };
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationSettings.upsert({
        where: { salonId: salon.salonId },
        create: { salonId: salon.salonId, events },
        update: { events },
      });
      await this.audit.record(
        {
          action: "notifications.settings_updated",
          actor: { type: "user", id: userId },
          salonId: salon.salonId,
          targetType: "salon",
          targetId: salon.salonId,
          metadata: {
            disabled: TEAM_EVENTS.flatMap((e) =>
              (["email", "in_app"] as const)
                .filter((c) => events[e]?.[c] === false)
                .map((c) => `${e}:${c}`),
            ).join(","),
          },
        },
        tx,
      );
    });
    return this.get(salon.salonId);
  }
}
