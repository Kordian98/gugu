import { Injectable } from "@nestjs/common";
import {
  ZALO_ERRORS,
  type ZaloAttention,
  type ZaloConversation,
  type ZaloConversationList,
  type ZaloMessageList,
  type ZaloNotificationList,
  type ZaloSendLog,
} from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import type { SalonContext } from "../../../common/guards/principal";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { AuditService } from "../../audit/audit.facade";
import { INITIAL_BOT_STATE } from "../domain/bot/types";
import { decideCs, sendWindow } from "../domain/window";
import { OutboundService } from "./outbound.service";
import { ZaloClock } from "./zalo-clock";

const notFound = () =>
  new AppError(404, ZALO_ERRORS.conversationNotFound, "Conversation not found");

/** Keyset cursor: `<iso timestamp>|<uuid>` of the last row. */
const encode = (at: Date | null, id: string) =>
  Buffer.from(`${at?.toISOString() ?? ""}|${id}`).toString("base64url");
const decode = (cursor: string | undefined) => {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, "base64url").toString().split("|");
  return id ? { at: at ? new Date(at) : null, id } : null;
};

/** Staff side of Zalo: conversations, history, reply, take over / release, notifications, send log. */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundService,
    private readonly clock: ZaloClock,
    private readonly audit: AuditService,
  ) {}

  async conversations(
    salon: SalonContext,
    query: { cursor?: string; limit: number; filter: "all" | "needs_staff" | "unread" },
  ): Promise<ZaloConversationList> {
    const after = decode(query.cursor);
    const where: Prisma.ZaloConversationWhereInput = {
      salonId: salon.salonId,
      ...(query.filter === "needs_staff" ? { mode: "staff" } : {}),
      ...(query.filter === "unread" ? { unreadCount: { gt: 0 } } : {}),
      ...(after?.at
        ? {
            OR: [
              { lastMessageAt: { lt: after.at } },
              { lastMessageAt: after.at, id: { lt: after.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.zaloConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: query.limit + 1,
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const page = rows.slice(0, query.limit);
    const items = page.map((c) => this.toConversation(salon, c));
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > query.limit && last ? encode(last.lastMessageAt, last.id) : null,
    };
  }

  /** One conversation (the inbox opens it from "needs attention" or a link). */
  async conversationDetail(salon: SalonContext, id: string): Promise<ZaloConversation> {
    const c = await this.prisma.zaloConversation.findFirst({
      where: { id, salonId: salon.salonId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!c) throw notFound();
    return this.toConversation(salon, c);
  }

  private toConversation(
    salon: SalonContext,
    c: Prisma.ZaloConversationGetPayload<{ include: { messages: true } }>,
  ): ZaloConversation {
    const showPhone = salon.permissions.has("customers.phone.read");
    const now = this.clock.now();
    return {
      id: c.id,
      displayName: c.displayName,
      phone: showPhone ? c.phoneE164 : null,
      mode: c.mode,
      assignedUserId: c.assignedUserId,
      handoffRequestedAt: c.handoffRequestedAt?.toISOString() ?? null,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: c.messages[0]?.text?.slice(0, 120) ?? null,
      unreadCount: c.unreadCount,
      window: sendWindow(c.lastUserInteractionAt, now),
      followed: c.unfollowedAt === null,
    };
  }

  private async conversation(salonId: string, id: string) {
    const conv = await this.prisma.zaloConversation.findFirst({ where: { id, salonId } });
    if (!conv) throw notFound();
    return conv;
  }

  async messages(
    salonId: string,
    conversationId: string,
    query: { cursor?: string; limit: number },
  ): Promise<ZaloMessageList> {
    await this.conversation(salonId, conversationId);
    const after = decode(query.cursor);
    const rows = await this.prisma.zaloMessage.findMany({
      where: {
        salonId,
        conversationId,
        ...(after?.at
          ? { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const logs = await this.prisma.zaloSendLog.findMany({
      where: { salonId, messageId: { in: page.map((m) => m.id) } },
      select: { messageId: true, status: true },
    });
    const status = new Map(logs.map((l) => [l.messageId, l.status]));
    const last = page.at(-1);
    return {
      // Oldest first for display.
      items: page.reverse().map((m) => ({
        id: m.id,
        direction: m.direction,
        sender: m.sender,
        kind: m.kind,
        text: m.text,
        buttons: ((m.payload as { buttons?: string[] } | null)?.buttons ?? []).slice(0, 5),
        status: m.direction === "outbound" ? (status.get(m.id) ?? null) : null,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit && last ? encode(last.createdAt, last.id) : null,
    };
  }

  /** Staff reply. Replying takes the conversation over from the bot. */
  async reply(
    salon: SalonContext,
    userId: string,
    conversationId: string,
    text: string,
  ): Promise<void> {
    const conv = await this.conversation(salon.salonId, conversationId);
    const conn = await this.prisma.zaloOaConnection.findUnique({
      where: { salonId: salon.salonId },
    });
    if (conn?.status !== "connected") {
      throw new AppError(409, ZALO_ERRORS.notConnected, "No Zalo OA is connected");
    }
    const decision = decideCs(conv.lastUserInteractionAt, this.clock.now(), conn.allowPaidMessages);
    if (!decision.send) {
      throw new AppError(
        422,
        decision.reason === "window_closed"
          ? ZALO_ERRORS.windowClosed
          : ZALO_ERRORS.paidMessagesOff,
        "This customer can't be messaged right now",
      );
    }
    const ids = await this.prisma.$transaction(async (tx) => {
      await tx.zaloConversation.update({
        where: { id: conv.id },
        data: {
          mode: "staff",
          assignedUserId: conv.assignedUserId ?? userId,
          unreadCount: 0,
          lastStaffActivityAt: this.clock.now(),
        },
      });
      return this.outbound.record(
        salon.salonId,
        [
          {
            channel: "cs",
            purpose: "staff_reply",
            conversationId: conv.id,
            sender: "staff",
            staffUserId: userId,
            message: { kind: "text", text, buttons: [] },
          },
        ],
        tx,
      );
    });
    await this.outbound.enqueue(salon.salonId, ids);
  }

  async takeOver(salonId: string, userId: string, conversationId: string): Promise<void> {
    await this.conversation(salonId, conversationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.zaloConversation.update({
        where: { id: conversationId },
        data: { mode: "staff", assignedUserId: userId, lastStaffActivityAt: this.clock.now() },
      });
      await this.audit.record(
        {
          action: "zalo.conversation_taken_over",
          actor: { type: "user", id: userId },
          salonId,
          targetType: "zalo_conversation",
          targetId: conversationId,
        },
        tx,
      );
    });
  }

  /** Back to the bot, starting from its menu on the customer's next message. */
  async release(salonId: string, userId: string, conversationId: string): Promise<void> {
    await this.conversation(salonId, conversationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.zaloConversation.update({
        where: { id: conversationId },
        data: {
          mode: "bot",
          assignedUserId: null,
          handoffRequestedAt: null,
          staffNoticeAt: null,
          botState: { ...INITIAL_BOT_STATE } as unknown as Prisma.InputJsonObject,
        },
      });
      await this.audit.record(
        {
          action: "zalo.conversation_released",
          actor: { type: "user", id: userId },
          salonId,
          targetType: "zalo_conversation",
          targetId: conversationId,
        },
        tx,
      );
    });
  }

  async markRead(salonId: string, conversationId: string): Promise<void> {
    await this.conversation(salonId, conversationId);
    await this.prisma.zaloConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });
    await this.prisma.zaloStaffNotification.updateMany({
      where: { salonId, conversationId, readAt: null },
      data: { readAt: this.clock.now() },
    });
  }

  /**
   * Customers waiting for a person: staff-mode chats nobody took over yet, or with unread messages.
   * Longest waiting first; feeds the sidebar badge, the Today card and the pinned inbox section.
   */
  async attention(salonId: string): Promise<ZaloAttention> {
    const where: Prisma.ZaloConversationWhereInput = {
      salonId,
      mode: "staff",
      OR: [{ assignedUserId: null }, { unreadCount: { gt: 0 } }],
    };
    const [waiting, rows] = await Promise.all([
      this.prisma.zaloConversation.count({ where }),
      this.prisma.zaloConversation.findMany({
        where,
        orderBy: [{ handoffRequestedAt: { sort: "asc", nulls: "last" } }, { lastMessageAt: "asc" }],
        take: 5,
        include: {
          messages: {
            where: { direction: "inbound" },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      }),
    ]);
    return {
      waiting,
      items: rows.map((c) => ({
        conversationId: c.id,
        displayName: c.displayName,
        since:
          (c.handoffRequestedAt ?? c.lastStaffActivityAt ?? c.lastMessageAt)?.toISOString() ?? null,
        assigned: c.assignedUserId !== null,
        unreadCount: c.unreadCount,
        lastMessages: c.messages
          .reverse()
          .map((m) => ({ kind: m.kind, text: m.text, createdAt: m.createdAt.toISOString() })),
      })),
    };
  }

  async notifications(salonId: string): Promise<ZaloNotificationList> {
    const rows = await this.prisma.zaloStaffNotification.findMany({
      where: { salonId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      items: rows.map((n) => ({
        id: n.id,
        kind: n.kind as ZaloNotificationList["items"][number]["kind"],
        conversationId: n.conversationId,
        bookingId: n.bookingId,
        read: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async markNotificationsRead(salonId: string): Promise<void> {
    await this.prisma.zaloStaffNotification.updateMany({
      where: { salonId, readAt: null },
      data: { readAt: this.clock.now() },
    });
  }

  async sendLog(salonId: string, query: { cursor?: string; limit: number }): Promise<ZaloSendLog> {
    const after = decode(query.cursor);
    const rows = await this.prisma.zaloSendLog.findMany({
      where: {
        salonId,
        ...(after?.at
          ? { OR: [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((l) => ({
        id: l.id,
        channel: l.channel as "cs" | "template",
        purpose: l.purpose,
        tier: l.tier as "free" | "paid" | "template" | null,
        status: l.status,
        costEstimateVnd: l.costEstimateVnd,
        errorCode: l.errorCode,
        attempts: l.attempts,
        createdAt: l.createdAt.toISOString(),
        sentAt: l.sentAt?.toISOString() ?? null,
      })),
      nextCursor: rows.length > query.limit && last ? encode(last.createdAt, last.id) : null,
    };
  }
}
