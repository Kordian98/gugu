import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { channelEnabled } from "../domain/catalog";
import { idempotencyKey } from "../domain/idempotency";
import { planReminders, REMINDER_STATUSES } from "../domain/reminders";
import { DeliveryQueue } from "./delivery-queue";
import { NotifyClock } from "./notify-clock";
import { NotificationSettingsService } from "./settings.service";

const DAY = 86_400_000;
const PENDING = ["scheduled", "queued"] as const;

/**
 * Email reminders (spec 11 G8, R19). One delayed `notify.send` job per (booking, offset, version):
 * `sync` derives the wanted reminders from the booking's *current* state, so it is idempotent and
 * safe for out-of-order or repeated events. A reschedule or status change bumps the version: old
 * rows are marked skipped (`superseded`/`stale`) and their jobs removed; the worker re-checks
 * status, version and start time at send time anyway. Zalo reminders (module `zalo`) go first;
 * the email reminder is the fallback and the worker checks what Zalo did (see SenderService).
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly queue: DeliveryQueue,
    private readonly clock: NotifyClock,
  ) {}

  async sync(salonId: string, bookingId: string): Promise<{ planned: number; dropped: number }> {
    const now = this.clock.now();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, salonId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        version: true,
        customerName: true,
        customerEmail: true,
        customerAnonymisedAt: true,
      },
    });
    const existing = await this.prisma.notificationDelivery.findMany({
      where: { salonId, bookingId, event: "booking.reminder", status: { in: [...PENDING] } },
      select: { id: true, idempotencyKey: true },
    });
    const settings = await this.settings.stored(salonId);
    const active =
      booking !== null &&
      (REMINDER_STATUSES as readonly string[]).includes(booking.status) &&
      booking.customerName !== null &&
      booking.customerAnonymisedAt === null &&
      booking.customerEmail !== null;
    const wanted =
      active && channelEnabled(settings.events, "booking.reminder", "email")
        ? planReminders(booking.startsAt, settings.reminderOffsets, now).map((r) => ({
            ...r,
            key: idempotencyKey({
              event: "booking.reminder",
              entityId: booking.id,
              entityVersion: booking.version,
              recipientId: "customer",
              channel: "email",
              variant: r.variant,
            }),
          }))
        : [];
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const stale = existing.filter((r) => !wantedKeys.has(r.idempotencyKey));
    if (stale.length > 0) {
      await this.prisma.notificationDelivery.updateMany({
        where: { id: { in: stale.map((r) => r.id) }, status: { in: [...PENDING] } },
        data: { status: "skipped", reason: active ? "superseded" : "stale", lockedUntil: null },
      });
      for (const r of stale) await this.queue.remove(r.idempotencyKey);
    }
    if (!booking || wanted.length === 0) return { planned: 0, dropped: stale.length };

    await this.prisma.notificationDelivery.createMany({
      data: wanted.map((w) => ({
        salonId,
        bookingId,
        event: "booking.reminder",
        createdAt: now,
        variant: w.variant,
        audience: "customer" as const,
        channel: "email",
        idempotencyKey: w.key,
        status: "scheduled" as const,
        scheduledFor: w.sendAt,
        entityVersion: booking.version,
        meta: { startsAt: booking.startsAt.toISOString(), offsetMinutes: w.offsetMinutes },
      })),
      skipDuplicates: true,
    });
    const rows = await this.prisma.notificationDelivery.findMany({
      where: { idempotencyKey: { in: [...wantedKeys] }, status: { in: [...PENDING] } },
      select: { id: true, idempotencyKey: true, scheduledFor: true },
    });
    await this.queue.enqueue(rows);
    return { planned: rows.length, dropped: stale.length };
  }

  /** After a settings change: re-plan reminders of this salon's upcoming bookings. */
  async resyncSalon(salonId: string): Promise<number> {
    const now = this.clock.now();
    const bookings = await this.prisma.booking.findMany({
      where: {
        salonId,
        status: { in: [...REMINDER_STATUSES] },
        startsAt: { gt: now, lte: new Date(now.getTime() + 8 * DAY) },
        customerEmail: { not: null },
      },
      select: { id: true },
      orderBy: { startsAt: "asc" },
      take: 2_000,
    });
    // Rows of bookings that lost their email or status are dropped by sync too.
    for (const b of bookings) await this.sync(salonId, b.id);
    return bookings.length;
  }

  /**
   * Reconciliation (platform-level, every 10 min, all salons): guards against a lost Redis by
   * re-planning reminders for the next 48 h and re-enqueueing pending deliveries. Each salon's
   * rows are still handled with that salon's id; nothing crosses tenants.
   */
  async reconcile(): Promise<{ bookings: number; requeued: number }> {
    const now = this.clock.now();
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: [...REMINDER_STATUSES] },
        startsAt: { gt: now, lte: new Date(now.getTime() + 2 * DAY) },
        customerEmail: { not: null },
      },
      select: { id: true, salonId: true },
      orderBy: { startsAt: "asc" },
      take: 1_000,
    });
    for (const b of bookings) await this.sync(b.salonId, b.id);
    const pending = await this.prisma.notificationDelivery.findMany({
      where: {
        status: { in: [...PENDING] },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date(now.getTime() + 2 * DAY) } }],
        createdAt: { gt: new Date(now.getTime() - 7 * DAY) },
      },
      select: { id: true, idempotencyKey: true, scheduledFor: true },
      take: 1_000,
    });
    await this.queue.enqueue(pending);
    return { bookings: bookings.length, requeued: pending.length };
  }
}
