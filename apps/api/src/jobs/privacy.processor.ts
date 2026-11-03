import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { Job } from "bullmq";
import { z } from "zod";
import { QueueService } from "../infrastructure/queue/queue.service";
import { QUEUES } from "../infrastructure/queue/queues";
import {
  PRIVACY_JOBS,
  RetentionService,
  SalonExportService,
} from "../modules/privacy/privacy.facade";
import type { JobProcessor } from "./processor";

const exportPayload = z.object({ exportId: z.uuid() });

/** Retention runs once a day (topic 05 step 8). */
export const RETENTION_EVERY_MS = 86_400_000;

/**
 * `privacy` queue: salon-wide exports (payload = export id only; the salon comes from the row the
 * owner created through the guarded API) and the daily retention purge (system job).
 */
@Injectable()
export class PrivacyProcessor implements JobProcessor, OnApplicationBootstrap {
  readonly queue = QUEUES.privacy;

  constructor(
    private readonly exports: SalonExportService,
    private readonly retention: RetentionService,
    private readonly queues: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queues
      .queue(QUEUES.privacy)
      .upsertJobScheduler(
        PRIVACY_JOBS.retention,
        { every: RETENTION_EVERY_MS },
        { name: PRIVACY_JOBS.retention, data: {} },
      );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case PRIVACY_JOBS.salonExport:
        return this.exports.run(exportPayload.parse(job.data).exportId);
      case PRIVACY_JOBS.retention:
        return this.retention.purge();
      default:
        throw new Error(`privacy: unknown job "${job.name}"`);
    }
  }
}
