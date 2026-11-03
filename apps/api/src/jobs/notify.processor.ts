import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DelayedError, type Job } from "bullmq";
import { z } from "zod";
import { QueueService } from "../infrastructure/queue/queue.service";
import { QUEUES } from "../infrastructure/queue/queues";
import { NOTIFY_JOBS, NotifyJobs } from "../modules/notifications/notifications.facade";
import type { JobProcessor } from "./processor";

const sendPayload = z.object({ deliveryId: z.uuid() });

/** Reconciliation interval (lost team email jobs). */
export const NOTIFY_RECONCILE_EVERY_MS = 600_000;

/**
 * `notify` queue (topic 11): one `notify.send` job per delivery (job id = idempotency key; 6
 * attempts, exponential backoff) and the `notify.reconcile` schedule. A send that must wait (job
 * ran early) is moved back to delayed instead of failing. Team emails only (X26).
 */
@Injectable()
export class NotifyProcessor implements JobProcessor, OnApplicationBootstrap {
  readonly queue = QUEUES.notify;

  constructor(
    private readonly notify: NotifyJobs,
    private readonly queues: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queues.queue(QUEUES.notify).upsertJobScheduler(
      NOTIFY_JOBS.reconcile,
      { every: NOTIFY_RECONCILE_EVERY_MS },
      {
        name: NOTIFY_JOBS.reconcile,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 50 },
      },
    );
  }

  async process(job: Job, token?: string): Promise<unknown> {
    switch (job.name) {
      case NOTIFY_JOBS.send: {
        const { deliveryId } = sendPayload.parse(job.data);
        const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        const result = await this.notify.send(deliveryId, finalAttempt);
        if (result.kind === "deferred" && token) {
          await job.moveToDelayed(result.until.getTime(), token);
          throw new DelayedError();
        }
        return result;
      }
      case NOTIFY_JOBS.reconcile:
        return this.notify.reconcile();
      default:
        throw new Error(`notify: unknown job "${job.name}"`);
    }
  }
}
