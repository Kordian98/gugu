import { Injectable } from "@nestjs/common";
import { QueueService } from "../../../infrastructure/queue/queue.service";
import { QUEUES } from "../../../infrastructure/queue/queues";
import { NotifyClock } from "./notify-clock";

/** Job names on the `notify` queue (processor: jobs/notify.processor.ts). */
export const NOTIFY_JOBS = {
  /** Send one delivery; `jobId` = the delivery's idempotency key. */
  send: "notify.send",
  /** Every 10 minutes: re-enqueue lost team email jobs (guards against Redis loss). */
  reconcile: "notify.reconcile",
} as const;

/** 6 attempts, 5 s → 160 s exponential backoff; the final attempt marks the delivery failed. */
export const SEND_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  removeOnFail: { age: 14 * 24 * 3600 },
} as const;

export interface EnqueueRow {
  id: string;
  idempotencyKey: string;
  scheduledFor: Date | null;
}

/**
 * Producer side of the `notify` queue. Adding a job whose id already exists is a no-op, so
 * enqueueing after a retried outbox event or a reconciliation pass never duplicates a send.
 */
@Injectable()
export class DeliveryQueue {
  constructor(
    private readonly queues: QueueService,
    private readonly clock: NotifyClock,
  ) {}

  async enqueue(rows: readonly EnqueueRow[]): Promise<void> {
    if (rows.length === 0) return;
    const now = this.clock.now().getTime();
    await this.queues.queue(QUEUES.notify).addBulk(
      rows.map((r) => ({
        name: NOTIFY_JOBS.send,
        data: { deliveryId: r.id },
        opts: {
          ...SEND_JOB_OPTIONS,
          jobId: r.idempotencyKey,
          delay: Math.max(0, (r.scheduledFor?.getTime() ?? now) - now),
        },
      })),
    );
  }
}
