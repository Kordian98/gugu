import { Injectable } from "@nestjs/common";
import type { CustomerNotificationEvent, TeamNotificationEvent } from "@gugu/contracts";
import type { DomainEvent } from "../../../infrastructure/outbox/domain-events";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { ZaloDeliveryQueries } from "../../zalo/zalo.facade";
import { channelEnabled, teamDef } from "../domain/catalog";
import { idempotencyKey } from "../domain/idempotency";
import { DeliveryQueue } from "./delivery-queue";
import { NotifyClock } from "./notify-clock";
import { RecipientsService } from "./recipients.service";
import { RemindersService } from "./reminders.service";
import { NotificationSettingsService } from "./settings.service";

/** How long an email fallback waits before first checking what Zalo did. */
export const ZALO_GRACE_MS = 90_000;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

/**
 * Turns domain events from the outbox (bookings, Zalo hand-off, settings) into delivery rows and
 * `notify.send` jobs. Idempotent: every row has a deterministic key (unique index) and the job id
 * is that key, so a redelivered or replayed event changes nothing.
 *
 * Customer messages only for changes the salon made (`actorType = salon_member`): changes the
 * customer made in the Zalo chat were already answered there. Customer channel plan: Zalo, then
 * email, then none — see `customer()`.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly recipients: RecipientsService,
    private readonly reminders: RemindersService,
    private readonly zalo: ZaloDeliveryQueries,
    private readonly queue: DeliveryQueue,
    private readonly clock: NotifyClock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const p = event.payload;
    const salonId = event.salonId;
    if (!salonId) return;
    if (event.type === "notifications.settings_updated") {
      await this.reminders.resyncSalon(salonId);
      return;
    }
    if (event.type === "zalo.handoff_requested") {
      const conversationId = str(p["conversationId"]);
      if (!conversationId) return;
      await this.team("salon.zalo_handoff", salonId, {
        entityId: conversationId,
        version: event.id,
        bookingId: null,
        conversationId,
        actorId: null,
        staffIds: [],
      });
      return;
    }

    const bookingId = str(p["bookingId"]);
    if (!bookingId) return;
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, salonId },
      select: { id: true, staffId: true, services: { select: { staffId: true } } },
    });
    if (!booking) return;
    // Every staff member of the appointment (multi-service bookings, M6.8).
    const staffOfBooking = [
      ...new Set([booking.staffId, ...booking.services.map((l) => l.staffId)]),
    ];
    const version = int(p["version"]) ?? event.id;
    const bySalon = p["actorType"] === "salon_member";
    const actorId = bySalon ? str(p["actorId"]) : null;
    const team = (e: TeamNotificationEvent, staffIds: string[]) =>
      this.team(e, salonId, {
        entityId: booking.id,
        version,
        bookingId: booking.id,
        conversationId: null,
        actorId,
        staffIds,
      });

    if (event.type === "booking.created") {
      if (bySalon && p["status"] === "confirmed") {
        await this.customer("booking.confirmed", salonId, booking.id, version, event.id);
      }
      await team("salon.booking_received", staffOfBooking);
    } else if (event.type === "booking.status_changed") {
      const to = str(p["to"]);
      if (bySalon && to === "confirmed" && p["from"] === "pending") {
        await this.customer("booking.confirmed", salonId, booking.id, version, event.id);
      }
      if (bySalon && to === "cancelled_by_salon") {
        await this.customer("booking.cancelled_by_salon", salonId, booking.id, version, event.id);
      }
      if (to === "cancelled_by_salon" || to === "cancelled_by_customer") {
        await team("salon.booking_cancelled", staffOfBooking);
      }
    } else if (event.type === "booking.rescheduled") {
      if (bySalon) {
        await this.customer("booking.rescheduled", salonId, booking.id, version, event.id);
      }
      const moved = [p["fromStaffIds"], p["toStaffIds"]].flatMap((v) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [],
      );
      const staffIds = [
        str(p["fromStaffId"]),
        str(p["toStaffId"]),
        ...moved,
        ...staffOfBooking,
      ].filter((s): s is string => s !== null);
      await team("salon.booking_rescheduled", [...new Set(staffIds)]);
    } else {
      return;
    }
    await this.reminders.sync(salonId, booking.id);
  }

  /**
   * One customer email row per (event, booking, version):
   * - no email and no Zalo route → `skipped/no_contact` (the timeline explains why nothing went);
   * - Zalo route → `queued` as the fallback of `zalo_template`, checked after a grace period
   *   against the Zalo send log (`booking_update:<eventId>`, written by module `zalo`);
   * - email only → `queued` now; salon turned it off → `skipped/disabled`.
   */
  private async customer(
    event: CustomerNotificationEvent,
    salonId: string,
    bookingId: string,
    version: number | string,
    sourceEventId: string,
  ): Promise<void> {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, salonId },
      select: {
        customerName: true,
        customerEmail: true,
        customerAnonymisedAt: true,
        startsAt: true,
        salon: { select: { defaultLocale: true } },
      },
    });
    if (!b || b.customerName === null || b.customerAnonymisedAt !== null) return;
    const now = this.clock.now();
    const route = await this.zalo.route(salonId, bookingId);
    const settings = await this.settings.stored(salonId);
    const hasEmail = b.customerEmail !== null;
    if (!hasEmail && route.usable) return; // Zalo only; its own log shows the send.

    const base = {
      salonId,
      bookingId,
      event,
      // Module clock: the Zalo wait and reconciliation windows use the same time source.
      createdAt: now,
      audience: "customer" as const,
      channel: "email",
      locale: b.salon.defaultLocale,
      entityVersion: typeof version === "number" ? version : null,
      idempotencyKey: idempotencyKey({
        event,
        entityId: bookingId,
        entityVersion: version,
        recipientId: "customer",
        channel: "email",
      }),
      meta: {
        sourceEventId,
        startsAt: b.startsAt.toISOString(),
        ...(route.usable ? { zaloDedupKey: `booking_update:${sourceEventId}` } : {}),
      },
    };
    let row: Prisma.NotificationDeliveryCreateManyInput;
    if (!hasEmail) row = { ...base, status: "skipped", reason: "no_contact" };
    else if (!channelEnabled(settings.events, event, "email")) {
      row = { ...base, status: "skipped", reason: "disabled" };
    } else if (route.usable) {
      row = {
        ...base,
        status: "queued",
        fallbackOf: "zalo_template",
        scheduledFor: new Date(now.getTime() + ZALO_GRACE_MS),
      };
    } else row = { ...base, status: "queued", scheduledFor: now };
    await this.insertAndEnqueue([row]);
  }

  /** Bell item (+ email copy) for every allowed team member except the one who made the change. */
  private async team(
    event: TeamNotificationEvent,
    salonId: string,
    target: {
      entityId: string;
      version: number | string;
      bookingId: string | null;
      conversationId: string | null;
      actorId: string | null;
      staffIds: string[];
    },
  ): Promise<void> {
    const def = teamDef(event);
    const settings = await this.settings.stored(salonId);
    const inApp = channelEnabled(settings.events, event, "in_app");
    const email = channelEnabled(settings.events, event, "email");
    if (!inApp && !email) return;
    const people = await this.recipients.forTeam(
      salonId,
      def.permission,
      target.staffIds,
      target.actorId,
    );
    const now = this.clock.now();
    const rows: Prisma.NotificationDeliveryCreateManyInput[] = [];
    for (const r of people) {
      const base = {
        salonId,
        createdAt: now,
        bookingId: target.bookingId,
        conversationId: target.conversationId,
        event,
        audience: "team" as const,
        recipientUserId: r.userId,
        locale: r.locale,
        entityVersion: typeof target.version === "number" ? target.version : null,
      };
      const key = (channel: string) =>
        idempotencyKey({
          event,
          entityId: target.entityId,
          entityVersion: target.version,
          recipientId: r.userId,
          channel,
        });
      if (inApp) {
        rows.push({
          ...base,
          channel: "in_app",
          idempotencyKey: key("in_app"),
          status: "sent",
          sentAt: now,
        });
      }
      if (email) {
        const skip = !r.emailEnabled ? "muted" : r.email === null ? "no_email" : null;
        rows.push({
          ...base,
          channel: "email",
          idempotencyKey: key("email"),
          ...(skip ? { status: "skipped", reason: skip } : { status: "queued", scheduledFor: now }),
        });
      }
    }
    await this.insertAndEnqueue(rows);
  }

  /** Insert (duplicates ignored), create bell items for in-app rows, enqueue queued rows. */
  private async insertAndEnqueue(rows: Prisma.NotificationDeliveryCreateManyInput[]) {
    if (rows.length === 0) return;
    const keys = rows.map((r) => r.idempotencyKey);
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.notificationDelivery.createMany({ data: rows, skipDuplicates: true });
      const all = await tx.notificationDelivery.findMany({
        where: { idempotencyKey: { in: keys } },
        select: {
          id: true,
          idempotencyKey: true,
          scheduledFor: true,
          status: true,
          channel: true,
          salonId: true,
          recipientUserId: true,
          event: true,
          bookingId: true,
          conversationId: true,
        },
      });
      const inApp = all.filter((r) => r.channel === "in_app" && r.recipientUserId);
      if (inApp.length > 0) {
        await tx.notification.createMany({
          data: inApp.map((r) => ({
            salonId: r.salonId,
            userId: r.recipientUserId ?? "",
            event: r.event,
            bookingId: r.bookingId,
            conversationId: r.conversationId,
            deliveryId: r.id,
            createdAt: this.clock.now(),
          })),
          skipDuplicates: true,
        });
      }
      return all;
    });
    await this.queue.enqueue(saved.filter((r) => r.channel === "email" && r.status === "queued"));
  }
}
