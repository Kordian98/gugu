import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../../infrastructure/queue/queue.service";
import { QUEUES } from "../../../infrastructure/queue/queues";
import { type CsMessage, ZALO_CLIENT, ZaloApiError, type ZaloClient } from "../client/zalo-client";
import { decideCs } from "../domain/window";
import { ConnectionService } from "./connection.service";
import { recordFunnel } from "./funnel.recorder";
import { UsageQueries } from "./usage.queries";
import { ZaloClock } from "./zalo-clock";

/** Job names on the `zalo` queue that this module enqueues (processor: jobs/zalo.processor.ts). */
export const ZALO_JOBS = { inbound: "zalo.inbound", send: "zalo.send" } as const;

export type TemplateKey = "booking_confirmation" | "booking_reminder";

/**
 * Template parameter names GuGu fills. Salons register their ZBS templates with exactly these
 * parameters (runbook docs/runbooks/zalo-go-live.md).
 */
export interface TemplateData {
  customer_name: string;
  booking_code: string;
  service_name: string;
  booking_time: string;
  salon_name: string;
}

export type OutboundItem =
  | {
      channel: "cs";
      purpose: string;
      conversationId: string;
      sender: "bot" | "staff" | "system";
      staffUserId?: string | null;
      bookingId?: string | null;
      message: CsMessage;
      /** Defaults to a fresh key; pass one for sends that must happen once (reminders). */
      dedupKey?: string;
    }
  | {
      channel: "template";
      purpose: string;
      conversationId: string | null;
      bookingId: string;
      templateKey: TemplateKey;
      phoneE164: string | null;
      data: TemplateData;
      /** Shown in the panel's chat history. */
      previewText: string;
      dedupKey: string;
    };

type StoredRequest =
  | { channel: "cs"; userId: string; message: CsMessage }
  | { channel: "template"; templateKey: TemplateKey; phoneE164: string | null; data: TemplateData };

/**
 * Every outbound Zalo message goes through here: a chat-history row, a send-log row (status, tier,
 * cost) and one BullMQ job per batch so a reply's messages arrive in order. The worker decides the
 * window/quota at send time, retries transient errors with backoff and refreshes expired tokens.
 */
@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly config: AppConfig,
    private readonly clock: ZaloClock,
    private readonly connections: ConnectionService,
    private readonly usage: UsageQueries,
    @Inject(ZALO_CLIENT) private readonly client: ZaloClient,
  ) {}

  /** Writes messages + send logs (inside `tx` when given) and returns the send-log ids. */
  async record(
    salonId: string,
    items: readonly OutboundItem[],
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const db = tx ?? this.prisma;
    const keys = items.map((i) => i.dedupKey).filter((k): k is string => k !== undefined);
    const existing = new Set(
      keys.length === 0
        ? []
        : (
            await db.zaloSendLog.findMany({
              where: { dedupKey: { in: keys } },
              select: { dedupKey: true },
            })
          ).map((r) => r.dedupKey),
    );
    const ids: string[] = [];
    for (const item of items) {
      if (item.dedupKey && existing.has(item.dedupKey)) continue;
      let messageId: string | null = null;
      let request: StoredRequest;
      if (item.channel === "cs") {
        const conv = await db.zaloConversation.findFirstOrThrow({
          where: { id: item.conversationId, salonId },
          select: { zaloUserId: true },
        });
        request = { channel: "cs", userId: conv.zaloUserId, message: item.message };
        const msg = await db.zaloMessage.create({
          data: {
            salonId,
            conversationId: item.conversationId,
            direction: "outbound",
            sender: item.sender,
            staffUserId: item.staffUserId ?? null,
            kind: item.message.kind === "text" ? "text" : "request_info",
            text: item.message.kind === "text" ? item.message.text : item.message.subtitle,
            ...(item.message.kind === "text" && item.message.buttons.length > 0
              ? { payload: { buttons: item.message.buttons.map((b) => b.title) } }
              : {}),
          },
          select: { id: true },
        });
        messageId = msg.id;
      } else {
        request = {
          channel: "template",
          templateKey: item.templateKey,
          phoneE164: item.phoneE164,
          data: item.data,
        };
        if (item.conversationId) {
          const msg = await db.zaloMessage.create({
            data: {
              salonId,
              conversationId: item.conversationId,
              direction: "outbound",
              sender: "system",
              kind: "template",
              text: item.previewText,
            },
            select: { id: true },
          });
          messageId = msg.id;
        }
      }
      const log = await db.zaloSendLog.create({
        data: {
          salonId,
          conversationId: item.conversationId,
          bookingId: item.bookingId ?? null,
          messageId,
          channel: item.channel,
          purpose: item.purpose,
          dedupKey: item.dedupKey ?? `${item.purpose}:${messageId ?? randomUUID()}`,
          request: request as unknown as Prisma.InputJsonObject,
          // Module clock, so send-log periods line up with funnel events (and tests' fake time).
          createdAt: this.clock.now(),
        },
        select: { id: true },
      });
      ids.push(log.id);
    }
    if (item0Conversation(items) && ids.length > 0) {
      await db.zaloConversation.updateMany({
        where: { id: item0Conversation(items) ?? "", salonId },
        data: { lastMessageAt: this.clock.now() },
      });
    }
    return ids;
  }

  /** Enqueues one ordered batch (call after the recording transaction committed). */
  async enqueue(salonId: string, logIds: readonly string[]): Promise<void> {
    if (logIds.length === 0) return;
    await this.queues.add(
      QUEUES.zalo,
      ZALO_JOBS.send,
      { salonId, logIds },
      { jobId: `send-${logIds[0] ?? ""}` },
    );
  }

  /**
   * Records and enqueues in one transaction. A concurrent duplicate (same dedup key from a
   * redelivered event) loses on the unique index and counts as "already queued".
   */
  async send(salonId: string, items: readonly OutboundItem[]): Promise<string[]> {
    let ids: string[];
    try {
      ids = await this.prisma.$transaction((tx) => this.record(salonId, items, tx));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return [];
      throw error;
    }
    await this.enqueue(salonId, ids);
    return ids;
  }

  /**
   * Sends a batch in order. Already-final rows are skipped, so a retried job resumes where it
   * stopped. Throws on a retryable failure (BullMQ backs off); on the final attempt it marks the
   * remaining rows failed instead.
   */
  async processBatch(
    salonId: string,
    logIds: readonly string[],
    finalAttempt: boolean,
  ): Promise<void> {
    for (const id of logIds) {
      const log = await this.prisma.zaloSendLog.findFirst({ where: { id, salonId } });
      if (log?.status !== "queued") continue;
      try {
        await this.sendOne(log);
      } catch (error) {
        const retryable = error instanceof ZaloApiError && error.retryable;
        await this.prisma.zaloSendLog.update({
          where: { id },
          data: {
            attempts: { increment: 1 },
            errorCode: error instanceof ZaloApiError ? error.kind : "internal",
            ...(retryable && !finalAttempt ? {} : { status: "failed", request: {} }),
          },
        });
        if (retryable && !finalAttempt) throw error;
        // Permanent failure of one message: drop the rest of the batch too (keeps order honest).
        await this.prisma.zaloSendLog.updateMany({
          where: { id: { in: [...logIds] }, salonId, status: "queued" },
          data: { status: "failed", errorCode: "batch_aborted", request: {} },
        });
        this.logger.warn({ salonId, logId: id, err: (error as Error).message }, "zalo send failed");
        return;
      }
    }
  }

  private async reject(id: string, errorCode: string): Promise<void> {
    await this.prisma.zaloSendLog.update({
      where: { id },
      data: { status: "rejected", errorCode, request: {} },
    });
  }

  private async sendOne(log: {
    id: string;
    salonId: string;
    purpose: string;
    conversationId: string | null;
    request: Prisma.JsonValue;
  }): Promise<void> {
    const request = log.request as unknown as StoredRequest;
    const conn = await this.prisma.zaloOaConnection.findUnique({ where: { salonId: log.salonId } });
    if (conn?.status !== "connected") return this.reject(log.id, "not_connected");

    let tier: "free" | "paid" | "template";
    let cost = 0;
    if (request.channel === "cs") {
      const conv = log.conversationId
        ? await this.prisma.zaloConversation.findFirst({
            where: { id: log.conversationId, salonId: log.salonId },
            select: { lastUserInteractionAt: true, unfollowedAt: true },
          })
        : null;
      const decision = decideCs(
        conv?.lastUserInteractionAt ?? null,
        this.clock.now(),
        conn.allowPaidMessages,
      );
      if (!decision.send) {
        if (log.purpose === "bot_reply" && log.conversationId) {
          await recordFunnel(
            this.prisma,
            log.salonId,
            log.conversationId,
            [
              {
                event: "reply_blocked",
                reason: decision.reason === "window_closed" ? "out_of_window" : "paid_off",
              },
            ],
            this.clock.now(),
          );
        }
        return this.reject(log.id, decision.reason);
      }
      tier = decision.tier;
      cost = tier === "paid" ? this.config.env.ZALO_PRICE_CS_PAID_VND : 0;
    } else {
      const templateId = ((conn.templateIds ?? {}) as Record<string, string | undefined>)[
        request.templateKey
      ];
      if (!templateId) return this.reject(log.id, "no_template");
      if (!request.phoneE164) return this.reject(log.id, "no_phone");
      const limit = await this.usage.templateLimit(log.salonId, conn.monthlyTemplateCap);
      if (limit !== null && (await this.usage.templatesSentThisMonth(log.salonId)) >= limit) {
        return this.reject(log.id, "quota_exceeded");
      }
      tier = "template";
      cost = this.config.env.ZALO_PRICE_TEMPLATE_VND;
    }

    const attempt = async (force: boolean) => {
      const token = await this.connections.accessToken(log.salonId, { force });
      if (!token) return null;
      if (request.channel === "cs")
        return this.client.sendCs(token, request.userId, request.message);
      const templateId =
        ((conn.templateIds ?? {}) as Record<string, string>)[request.templateKey] ?? "";
      return this.client.sendTemplate(token, {
        phoneE164: request.phoneE164 ?? "",
        templateId,
        data: { ...request.data },
        trackingId: log.id,
      });
    };

    let result: { messageId: string } | null;
    try {
      result = await attempt(false);
    } catch (error) {
      if (!(error instanceof ZaloApiError)) throw error;
      if (error.kind === "token_invalid") {
        // Zalo says the token is dead before our expiry estimate: refresh once and retry.
        result = await attempt(true).catch(async (retryError: unknown) => {
          if (retryError instanceof ZaloApiError && retryError.kind === "token_invalid") {
            await this.connections.markNeedsReauth(log.salonId, retryError.message);
            return null;
          }
          throw retryError;
        });
      } else if (error.kind === "window_closed" || error.kind === "user_unreachable") {
        return this.reject(log.id, error.kind);
      } else if (error.kind === "quota_exceeded" || error.kind === "template_invalid") {
        return this.reject(log.id, error.kind);
      } else {
        throw error;
      }
    }
    if (!result) return this.reject(log.id, "not_connected");
    await this.prisma.zaloSendLog.update({
      where: { id: log.id },
      data: {
        status: "sent",
        tier,
        costEstimateVnd: cost,
        zaloMessageId: result.messageId || null,
        sentAt: this.clock.now(),
        attempts: { increment: 1 },
        request: {},
      },
    });
  }
}

function item0Conversation(items: readonly OutboundItem[]): string | null {
  return items.find((i) => i.conversationId)?.conversationId ?? null;
}
