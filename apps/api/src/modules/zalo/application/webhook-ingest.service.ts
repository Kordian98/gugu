import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { ZALO_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { QueueService } from "../../../infrastructure/queue/queue.service";
import { QUEUES } from "../../../infrastructure/queue/queues";
import { EMULATOR_APP_ID } from "../emulator/emulator-store";
import { isFreshTimestamp, verifyZaloSignature } from "../domain/signature";
import { ZALO_JOBS } from "./outbound.service";
import { ZaloClock } from "./zalo-clock";

/** The fields we rely on; everything else in Zalo's payload is kept but not trusted. */
const envelopeSchema = z
  .object({
    app_id: z.union([z.string(), z.number()]).transform(String).optional(),
    event_name: z.string().min(1).max(64),
    timestamp: z.union([z.string(), z.number()]).transform(String),
    oa_id: z.union([z.string(), z.number()]).transform(String).optional(),
    recipient: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional(),
    sender: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional(),
    follower: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).optional(),
    message: z
      .object({ msg_id: z.string().optional(), text: z.string().optional() })
      .loose()
      .optional(),
  })
  .loose();
export type ZaloEnvelope = z.infer<typeof envelopeSchema>;

/** OA id of an event: user events name it as recipient, follow events as `oa_id`. */
export function oaIdOf(e: ZaloEnvelope): string | null {
  if (e.event_name.startsWith("oa_send_")) return e.sender?.id ?? null;
  return e.recipient?.id ?? e.oa_id ?? null;
}

/** Zalo user id of an event (customer side). */
export function userIdOf(e: ZaloEnvelope): string | null {
  if (e.event_name.startsWith("oa_send_")) return e.recipient?.id ?? null;
  return e.sender?.id ?? e.follower?.id ?? null;
}

/**
 * One webhook endpoint for every salon OA (X24): verify signature and freshness, route by OA id,
 * store the event once (idempotent on msg_id / content hash), enqueue, return fast (Zalo expects a
 * 200 within 5 s). Events of OAs no salon has connected are dropped and only counted in logs.
 */
@Injectable()
export class WebhookIngestService {
  private readonly logger = new Logger(WebhookIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly config: AppConfig,
    private readonly clock: ZaloClock,
  ) {}

  private appId(): string {
    return this.config.env.ZALO_CLIENT === "emulated"
      ? EMULATOR_APP_ID
      : this.config.env.ZALO_APP_ID;
  }

  async ingest(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ accepted: boolean }> {
    if (this.config.env.ZALO_CLIENT === "disabled") {
      throw new AppError(503, ZALO_ERRORS.disabled, "Zalo integration is not enabled");
    }
    if (!rawBody) throw new Error("raw body missing: create the app with { rawBody: true }");
    const raw = rawBody.toString("utf8");
    let parsed: ZaloEnvelope;
    try {
      parsed = envelopeSchema.parse(JSON.parse(raw));
    } catch {
      throw new AppError(400, ZALO_ERRORS.invalidSignature, "Malformed Zalo event");
    }
    const valid =
      verifyZaloSignature(signature, {
        appId: parsed.app_id ?? this.appId(),
        rawBody: raw,
        timestamp: parsed.timestamp,
        secret: this.config.env.ZALO_OA_SECRET_KEY,
      }) &&
      (parsed.app_id === undefined || parsed.app_id === this.appId());
    if (!valid) throw new AppError(401, ZALO_ERRORS.invalidSignature, "Invalid Zalo signature");
    if (!isFreshTimestamp(parsed.timestamp, this.clock.now())) {
      throw new AppError(401, ZALO_ERRORS.invalidSignature, "Stale Zalo event");
    }

    const oaId = oaIdOf(parsed);
    const conn = oaId
      ? await this.prisma.zaloOaConnection.findFirst({
          where: { oaId, status: { not: "disconnected" } },
          select: { salonId: true },
        })
      : null;
    if (!oaId || !conn) {
      this.logger.log({ event: parsed.event_name }, "zalo event for an unknown OA dropped");
      return { accepted: false };
    }
    const eventKey =
      parsed.message?.msg_id ??
      createHash("sha256")
        .update(
          [oaId, userIdOf(parsed) ?? "", parsed.event_name, parsed.timestamp, raw].join("\u0000"),
        )
        .digest("base64url");
    try {
      const row = await this.prisma.zaloWebhookEvent.create({
        data: {
          eventKey,
          oaId,
          salonId: conn.salonId,
          eventName: parsed.event_name,
          payload: JSON.parse(raw) as Prisma.InputJsonObject,
          occurredAt: new Date(Number(parsed.timestamp)),
        },
        select: { id: true },
      });
      await this.queues.add(
        QUEUES.zalo,
        ZALO_JOBS.inbound,
        { eventId: row.id },
        { jobId: `in-${row.id}` },
      );
      return { accepted: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { accepted: true }; // duplicate delivery: already stored and queued
      }
      throw error;
    }
  }
}
