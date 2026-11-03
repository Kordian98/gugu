import type { Job } from "bullmq";
import type { QueueName } from "../infrastructure/queue/queues";

/**
 * A BullMQ processor. Keep processors thin: parse the payload, call a module facade, return.
 * Register new processors in `jobs/jobs.module.ts`.
 */
export interface JobProcessor {
  readonly queue: QueueName;
  /** `token` is the worker's lock token (needed to move a job back to delayed). */
  process(job: Job, token?: string): Promise<unknown>;
}

export const JOB_PROCESSORS = Symbol("JOB_PROCESSORS");
