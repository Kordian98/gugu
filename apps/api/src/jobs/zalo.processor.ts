import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { Job } from "bullmq";
import { z } from "zod";
import { QueueService } from "../infrastructure/queue/queue.service";
import { QUEUES } from "../infrastructure/queue/queues";
import { ZaloJobs } from "../modules/zalo/zalo.facade";
import type { JobProcessor } from "./processor";

export const ZALO_JOB_NAMES = {
  inbound: "zalo.inbound",
  send: "zalo.send",
  minute: "zalo.minute",
  refreshTokens: "zalo.refresh_tokens",
  purgeEvents: "zalo.purge_events",
} as const;

const inboundPayload = z.object({ eventId: z.uuid() });
const sendPayload = z.object({ salonId: z.uuid(), logIds: z.array(z.uuid()).min(1).max(20) });

/**
 * `zalo` queue (topic 09): webhook events → bot, ordered send batches (5 attempts, exponential
 * backoff), and schedules — reminders + booking updates every minute, token refresh every 10 min,
 * raw event purge daily.
 */
@Injectable()
export class ZaloProcessor implements JobProcessor, OnApplicationBootstrap {
  readonly queue = QUEUES.zalo;

  constructor(
    private readonly zalo: ZaloJobs,
    private readonly queues: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const q = this.queues.queue(QUEUES.zalo);
    await q.upsertJobScheduler(
      ZALO_JOB_NAMES.minute,
      { every: 60_000 },
      { name: ZALO_JOB_NAMES.minute, data: {} },
    );
    await q.upsertJobScheduler(
      ZALO_JOB_NAMES.refreshTokens,
      { every: 600_000 },
      { name: ZALO_JOB_NAMES.refreshTokens, data: {} },
    );
    await q.upsertJobScheduler(
      ZALO_JOB_NAMES.purgeEvents,
      { every: 86_400_000 },
      { name: ZALO_JOB_NAMES.purgeEvents, data: {} },
    );
  }

  async process(job: Job): Promise<unknown> {
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    switch (job.name) {
      case ZALO_JOB_NAMES.inbound: {
        const { eventId } = inboundPayload.parse(job.data);
        try {
          return await this.zalo.inboundEvent(eventId, finalAttempt);
        } catch (error) {
          await this.zalo.inboundEvent(eventId, finalAttempt, error);
          throw error;
        }
      }
      case ZALO_JOB_NAMES.send: {
        const { salonId, logIds } = sendPayload.parse(job.data);
        return this.zalo.send(salonId, logIds, finalAttempt);
      }
      case ZALO_JOB_NAMES.minute:
        return this.zalo.minute();
      case ZALO_JOB_NAMES.refreshTokens:
        return this.zalo.refreshTokens();
      case ZALO_JOB_NAMES.purgeEvents:
        return this.zalo.purgeEvents();
      default:
        throw new Error(`zalo: unknown job "${job.name}"`);
    }
  }
}
