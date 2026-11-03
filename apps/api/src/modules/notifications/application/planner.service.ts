import { Injectable } from "@nestjs/common";
import type { TeamNotificationEvent } from "@gugu/contracts";
import type { DomainEvent } from "../../../infrastructure/outbox/domain-events";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { channelEnabled, teamDef } from "../domain/catalog";
import { idempotencyKey } from "../domain/idempotency";
import { DeliveryQueue } from "./delivery-queue";
import { NotifyClock } from "./notify-clock";
import { RecipientsService } from "./recipients.service";
import { NotificationSettingsService } from "./settings.service";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

/**
 * Turns domain events from the outbox (bookings, Zalo hand-off) into team delivery rows (bell +
 * email copy) and `notify.send` jobs. Idempotent: every row has a deterministic key (unique index)
 * and the job id is that key, so a redelivered or replayed event changes nothing.
 *
 * Customers are not planned here (X26): the salon's Zalo OA tells them about changes the salon
 * made and sends their reminders (module `zalo`, from the same outbox events); when the OA cannot
 * reach the customer nothing is sent. GuGu never emails a salon's customers.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly recipients: RecipientsService,
    private readonly queue: DeliveryQueue,
    private readonly clock: NotifyClock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const p = event.payload;
    const salonId = event.salonId;
    if (!salonId) return;
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
      await team("salon.booking_received", staffOfBooking);
    } else if (event.type === "booking.status_changed") {
      const to = str(p["to"]);
      if (to === "cancelled_by_salon" || to === "cancelled_by_customer") {
        await team("salon.booking_cancelled", staffOfBooking);
      }
    } else if (event.type === "booking.rescheduled") {
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
    }
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
