import { Injectable } from "@nestjs/common";
import type { Job } from "bullmq";
import { z } from "zod";
import { QUEUES } from "../infrastructure/queue/queues";
import type { JobProcessor } from "./processor";

export const MAINTENANCE_JOBS = { heartbeat: "heartbeat" } as const;

const heartbeatPayload = z.object({ requestedAt: z.iso.datetime() });

/** `maintenance` queue. `heartbeat` proves the producer → Valkey → worker path end to end. */
@Injectable()
export class MaintenanceProcessor implements JobProcessor {
  readonly queue = QUEUES.maintenance;

  // eslint-disable-next-line @typescript-eslint/require-await -- async so parse errors reject, not throw
  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case MAINTENANCE_JOBS.heartbeat: {
        const { requestedAt } = heartbeatPayload.parse(job.data);
        return { requestedAt, processedAt: new Date().toISOString() };
      }
      default:
        throw new Error(`maintenance: unknown job "${job.name}"`);
    }
  }
}
