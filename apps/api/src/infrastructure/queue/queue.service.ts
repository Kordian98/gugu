import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";
import { RedisService } from "../redis/redis.service";
import { DEFAULT_JOB_OPTIONS, type QueueName } from "./queues";

/**
 * Producer side of BullMQ. Domain code does not call this directly for cross-module side effects —
 * it writes outbox events (04-S5) and the relay enqueues. Direct use is for infrastructure jobs.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {}

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.redis.client,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  /** Enqueue with a deterministic `jobId` so retries of the same request don't duplicate work. */
  async add(
    name: QueueName,
    jobName: string,
    data: unknown,
    opts: JobsOptions & { jobId: string },
  ) {
    return this.queue(name).add(jobName, data, opts);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
