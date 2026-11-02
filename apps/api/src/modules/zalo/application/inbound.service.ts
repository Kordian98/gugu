import { Inject, Injectable, Logger } from "@nestjs/common";
import { createI18n } from "@gugu/localization";
import { normalizeVnPhone } from "@gugu/domain";
import { Prisma, type ZaloConversation } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { ZALO_CLIENT, type ZaloClient } from "../client/zalo-client";
import { runBot } from "../domain/bot/engine";
import { keywordCommand, parsePayload } from "../domain/bot/payload";
import type { BotInput, BotReply, BotState } from "../domain/bot/types";
import { BotPortsFactory } from "./bot-ports";
import { ConnectionService } from "./connection.service";
import { type OutboundItem, OutboundService } from "./outbound.service";
import { oaIdOf, userIdOf, type ZaloEnvelope } from "./webhook-ingest.service";
import { ZaloClock } from "./zalo-clock";

/** Customer events that count as an interaction (open the 48 h / 7 d window). */
const INTERACTIONS = new Set([
  "follow",
  "user_send_text",
  "user_send_image",
  "user_send_link",
  "user_send_audio",
  "user_send_video",
  "user_send_sticker",
  "user_send_location",
  "user_send_file",
  "user_send_gif",
  "user_submit_info",
  "user_click_button",
]);

interface Inbound {
  kind: string;
  text: string | null;
  payload: Prisma.InputJsonObject | undefined;
  bot: BotInput | null;
}

/** Maps a Zalo event to a chat-history row and a bot input (null = the bot stays quiet). */
export function toInbound(e: ZaloEnvelope & Record<string, unknown>): Inbound | null {
  const text = e.message?.text ?? null;
  switch (e.event_name) {
    case "follow":
      return { kind: "follow", text: null, payload: undefined, bot: { kind: "follow" } };
    case "unfollow":
      return { kind: "unfollow", text: null, payload: undefined, bot: null };
    case "user_send_text":
      if (text?.startsWith("gg|")) {
        return {
          kind: "button",
          text: null,
          payload: { payload: text },
          bot: { kind: "payload", payload: text },
        };
      }
      return { kind: "text", text, payload: undefined, bot: { kind: "text", text: text ?? "" } };
    case "user_submit_info": {
      const info = (e["info"] ?? {}) as { name?: string; phone?: string };
      return {
        kind: "user_info",
        text: info.name ?? null,
        payload: undefined,
        bot: { kind: "user_info", phone: info.phone ?? null, name: info.name ?? null },
      };
    }
    default:
      if (e.event_name.startsWith("user_send_")) {
        // Stickers, images, files…: kept for staff; the bot answers with its menu.
        return {
          kind: e.event_name.slice("user_send_".length),
          text: null,
          payload: undefined,
          bot: { kind: "text", text: "" },
        };
      }
      return null;
  }
}

/**
 * Worker side of the webhook: stores the customer's message, updates the send window, and — when
 * the bot owns the conversation — runs the rule-based booking bot and queues its replies as the
 * salon. One conversation is processed at a time (row lock), so taps arrive in a consistent state.
 */
@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ZaloClock,
    private readonly ports: BotPortsFactory,
    private readonly outbound: OutboundService,
    private readonly connections: ConnectionService,
    @Inject(ZALO_CLIENT) private readonly client: ZaloClient,
  ) {}

  async process(eventId: string): Promise<{ status: string }> {
    const event = await this.prisma.zaloWebhookEvent.findUnique({ where: { id: eventId } });
    if (event?.status !== "received" || !event.salonId) return { status: "skipped" };
    const salonId = event.salonId;
    const e = event.payload as unknown as ZaloEnvelope & Record<string, unknown>;
    const conn = await this.prisma.zaloOaConnection.findUnique({ where: { salonId } });
    const userId = userIdOf(e);
    if (conn?.status !== "connected" || conn.oaId !== oaIdOf(e) || !userId) {
      return this.finish(eventId, "ignored");
    }

    if (e.event_name.startsWith("oa_send_"))
      return this.echo(eventId, salonId, conn.oaId, userId, e);
    const inbound = toInbound(e);
    if (!inbound) return this.finish(eventId, "ignored");

    // Committed before the locked transaction so bookings made meanwhile can reference it.
    const conv = await this.upsertConversation(salonId, conn.oaId, userId);
    let logIds: string[] = [];
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM zalo_conversations WHERE id = ${conv.id}::uuid FOR NO KEY UPDATE`;
        // Re-check under the lock: a parallel retry may have handled this event already.
        const still = await tx.zaloWebhookEvent.findUnique({
          where: { id: eventId },
          select: { status: true },
        });
        if (still?.status !== "received") return;
        const current = await tx.zaloConversation.findUniqueOrThrow({ where: { id: conv.id } });
        const at = event.occurredAt;
        const interacted = INTERACTIONS.has(e.event_name);
        await tx.zaloMessage.create({
          data: {
            salonId,
            conversationId: conv.id,
            direction: "inbound",
            sender: "customer",
            kind: inbound.kind,
            text: inbound.text,
            ...(inbound.payload ? { payload: inbound.payload } : {}),
            zaloMessageId: e.message?.msg_id ?? null,
            createdAt: at,
          },
        });
        const update: Prisma.ZaloConversationUpdateInput = {
          lastMessageAt: at,
          // Unread counts only what staff must read: chats a person handles (hand-off or bot off).
          unreadCount: {
            increment:
              inbound.kind !== "follow" &&
              inbound.kind !== "unfollow" &&
              (current.mode === "staff" || !conn.botEnabled)
                ? 1
                : 0,
          },
          ...(interacted && (!current.lastUserInteractionAt || current.lastUserInteractionAt < at)
            ? { lastUserInteractionAt: at }
            : {}),
          ...(inbound.kind === "follow" ? { followedAt: at, unfollowedAt: null } : {}),
          ...(inbound.kind === "unfollow" ? { unfollowedAt: at } : {}),
        };

        // A hand-off nobody has taken over yet must not trap the customer: "menu", greetings or
        // "Đặt lịch" hand the chat back to the bot. Once a staff member takes over, the bot stays out.
        let mode = current.mode;
        if (inbound.bot && mode === "staff" && !current.assignedUserId && conn.botEnabled) {
          const cmd =
            inbound.bot.kind === "text"
              ? keywordCommand(inbound.bot.text)
              : inbound.bot.kind === "payload"
                ? (() => {
                    const p = parsePayload(inbound.bot.payload);
                    return p.kind === "global" ? p.command : null;
                  })()
                : null;
          if (cmd === "menu" || cmd === "book") {
            mode = "bot";
            update.mode = "bot";
            update.handoffRequestedAt = null;
          }
        }

        if (inbound.bot && mode === "bot" && conn.botEnabled) {
          const locale = "vi" as const;
          const { t } = createI18n(locale);
          const ports = await this.ports.forConversation(
            {
              id: current.id,
              salonId,
              displayName: current.displayName,
              phoneE164: current.phoneE164,
            },
            locale,
            event.eventKey,
          );
          const result = await runBot(current.botState as unknown as BotState, inbound.bot, ports, {
            now: this.clock.now(),
            locale,
            t: (key, vars) => t(`zalo:${key}`, vars ?? {}),
          });
          update.botState = result.state as unknown as Prisma.InputJsonObject;
          for (const effect of result.effects) {
            if (effect.type === "contact") {
              if (effect.phone)
                update.phoneE164 = normalizeVnPhone(effect.phone) ?? current.phoneE164;
              if (effect.name && !current.displayName) update.displayName = effect.name;
            } else if (effect.type === "handoff") {
              update.mode = "staff";
              update.handoffRequestedAt = this.clock.now();
              await tx.zaloStaffNotification.create({
                data: { salonId, kind: "handoff_requested", conversationId: conv.id },
              });
            } else {
              await tx.zaloStaffNotification.create({
                data: {
                  salonId,
                  kind: effect.kind,
                  conversationId: conv.id,
                  bookingId: effect.bookingId,
                },
              });
            }
          }
          logIds = await this.outbound.record(salonId, this.toItems(conv.id, result.replies), tx);
        } else if (inbound.kind === "user_info" && inbound.bot?.kind === "user_info") {
          const phone = inbound.bot.phone ? normalizeVnPhone(inbound.bot.phone) : null;
          if (phone) update.phoneE164 = phone;
        }

        await tx.zaloConversation.update({ where: { id: conv.id }, data: update });
        await tx.zaloWebhookEvent.update({
          where: { id: eventId },
          data: { status: "processed", processedAt: this.clock.now() },
        });
      },
      { timeout: 60_000, maxWait: 30_000 },
    );
    await this.outbound.enqueue(salonId, logIds);
    return { status: "processed" };
  }

  private toItems(conversationId: string, replies: readonly BotReply[]): OutboundItem[] {
    return replies.map((r) => ({
      channel: "cs" as const,
      purpose: "bot_reply",
      conversationId,
      sender: "bot" as const,
      message:
        r.kind === "text"
          ? { kind: "text" as const, text: r.text, buttons: r.buttons }
          : { kind: "request_info" as const, title: r.title, subtitle: r.subtitle },
    }));
  }

  private async upsertConversation(
    salonId: string,
    oaId: string,
    zaloUserId: string,
  ): Promise<ZaloConversation> {
    const existing = await this.prisma.zaloConversation.findUnique({
      where: { oaId_zaloUserId: { oaId, zaloUserId } },
    });
    if (existing) {
      if (existing.salonId === salonId) return existing;
      // The OA moved to another salon: records belong to one salon only, start a fresh one.
      throw new Error("zalo conversation belongs to another salon");
    }
    const name = await this.lookupName(salonId, zaloUserId);
    try {
      return await this.prisma.zaloConversation.create({
        data: { salonId, oaId, zaloUserId, displayName: name },
      });
    } catch (error) {
      // Two first messages processed in parallel: the other one created it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.prisma.zaloConversation.findUniqueOrThrow({
          where: { oaId_zaloUserId: { oaId, zaloUserId } },
        });
      }
      throw error;
    }
  }

  private async lookupName(salonId: string, userId: string): Promise<string | null> {
    try {
      const token = await this.connections.accessToken(salonId);
      return token ? await this.client.getUserName(token, userId) : null;
    } catch {
      return null; // a name is nice to have; never block the conversation on it
    }
  }

  /**
   * `oa_send_*`: the salon answered from Zalo's own apps (OA Manager). Kept in the history so the
   * panel shows the whole conversation; our own API sends are recognised by message id and skipped.
   */
  private async echo(
    eventId: string,
    salonId: string,
    oaId: string,
    userId: string,
    e: ZaloEnvelope,
  ): Promise<{ status: string }> {
    const msgId = e.message?.msg_id ?? null;
    const ours = msgId
      ? await this.prisma.zaloSendLog.count({ where: { salonId, zaloMessageId: msgId } })
      : 0;
    const conv = await this.prisma.zaloConversation.findUnique({
      where: { oaId_zaloUserId: { oaId, zaloUserId: userId } },
    });
    if (ours === 0 && conv?.salonId === salonId) {
      await this.prisma.zaloMessage.create({
        data: {
          salonId,
          conversationId: conv.id,
          direction: "outbound",
          sender: "staff",
          kind: e.event_name.slice("oa_send_".length),
          text: e.message?.text ?? null,
          zaloMessageId: msgId,
        },
      });
    }
    return this.finish(eventId, "processed");
  }

  private async finish(
    eventId: string,
    status: "processed" | "ignored",
  ): Promise<{ status: string }> {
    await this.prisma.zaloWebhookEvent.updateMany({
      where: { id: eventId, status: "received" },
      data: { status, processedAt: this.clock.now() },
    });
    return { status };
  }

  async markFailed(eventId: string, error: string): Promise<void> {
    await this.prisma.zaloWebhookEvent.updateMany({
      where: { id: eventId, status: "received" },
      data: { status: "failed", error: error.slice(0, 200) },
    });
    this.logger.warn({ eventId }, "zalo inbound event failed");
  }
}
