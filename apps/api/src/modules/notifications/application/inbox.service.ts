import { Injectable } from "@nestjs/common";
import {
  type Inbox,
  type InboxItem,
  type InboxQuery,
  type MemberNotificationPrefs,
  TEAM_NOTIFICATION_EVENTS,
} from "@gugu/contracts";
import type { SalonContext } from "../../../common/guards/principal";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { CATALOG, type TeamEventDef } from "../domain/catalog";
import { NotifyClock } from "./notify-clock";
import { RecipientsService } from "./recipients.service";

const localized = (v: unknown): { vi: string; en: string } | null => {
  const o = v as { vi?: unknown; en?: unknown } | null | undefined;
  return o && typeof o.vi === "string"
    ? { vi: o.vi, en: typeof o.en === "string" ? o.en : "" }
    : null;
};

/**
 * The member's own bell (spec 11 §4.5, panel only): items are the member's (`user_id`) in this
 * salon. Booking and conversation details are joined at read time and filtered by the member's
 * *current* access (a staff member moved off a booking no longer sees it), so nothing personal is
 * copied into the inbox table and revoked access takes effect immediately.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: RecipientsService,
    private readonly clock: NotifyClock,
  ) {}

  async list(salon: SalonContext, userId: string, q: InboxQuery): Promise<Inbox> {
    const where = { salonId: salon.salonId, userId };
    const rows = await this.prisma.notification.findMany({
      where: { ...where, ...(q.cursor ? { id: { lt: q.cursor } } : {}) },
      orderBy: { id: "desc" },
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const bookingIds = [...new Set(page.flatMap((r) => (r.bookingId ? [r.bookingId] : [])))];
    const convIds = [...new Set(page.flatMap((r) => (r.conversationId ? [r.conversationId] : [])))];
    const [bookings, convs, unread] = await Promise.all([
      bookingIds.length
        ? this.prisma.booking.findMany({
            where: { salonId: salon.salonId, id: { in: bookingIds } },
            select: {
              id: true,
              referenceCode: true,
              startsAt: true,
              staffId: true,
              customerName: true,
              customerAnonymisedAt: true,
              staff: { select: { displayName: true } },
              services: { select: { name: true }, orderBy: { sequence: "asc" }, take: 1 },
            },
          })
        : [],
      convIds.length && salon.permissions.has("zalo.inbox.use")
        ? this.prisma.zaloConversation.findMany({
            where: { salonId: salon.salonId, id: { in: convIds } },
            select: { id: true, displayName: true },
          })
        : [],
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const convById = new Map(convs.map((c) => [c.id, c]));
    const items: InboxItem[] = [];
    for (const r of page) {
      const event = r.event as (typeof TEAM_NOTIFICATION_EVENTS)[number];
      if (!(TEAM_NOTIFICATION_EVENTS as readonly string[]).includes(event)) continue;
      const rule = (CATALOG[event] as TeamEventDef).permission;
      const b = r.bookingId ? bookingById.get(r.bookingId) : undefined;
      if (!(await this.recipients.allowed(salon, userId, rule, b ? [b.staffId] : []))) continue;
      const c = r.conversationId ? convById.get(r.conversationId) : undefined;
      items.push({
        id: r.id,
        event,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
        booking: b
          ? {
              id: b.id,
              referenceCode: b.referenceCode,
              startsAt: b.startsAt.toISOString(),
              service: localized(b.services[0]?.name),
              customerName: b.customerAnonymisedAt ? null : b.customerName,
              customerAnonymised: b.customerAnonymisedAt !== null,
              staffName: b.staff.displayName,
            }
          : null,
        conversation: c ? { id: c.id, displayName: c.displayName } : null,
      });
    }
    return {
      items,
      unread,
      nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async markRead(salonId: string, userId: string, ids: string[] | undefined): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { salonId, userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: this.clock.now() },
    });
    return count;
  }

  async prefs(salonId: string, userId: string): Promise<MemberNotificationPrefs> {
    const p = await this.prisma.notificationMemberPref.findUnique({
      where: { salonId_userId: { salonId, userId } },
    });
    return { emailEnabled: p?.emailEnabled ?? true };
  }

  async setPrefs(
    salonId: string,
    userId: string,
    input: MemberNotificationPrefs,
  ): Promise<MemberNotificationPrefs> {
    const p = await this.prisma.notificationMemberPref.upsert({
      where: { salonId_userId: { salonId, userId } },
      create: { salonId, userId, emailEnabled: input.emailEnabled },
      update: { emailEnabled: input.emailEnabled },
    });
    return { emailEnabled: p.emailEnabled };
  }
}
