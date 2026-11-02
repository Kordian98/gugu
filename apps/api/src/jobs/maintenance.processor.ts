import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import type { Job } from "bullmq";
import { z } from "zod";
import { QueueService } from "../infrastructure/queue/queue.service";
import { QUEUES } from "../infrastructure/queue/queues";
import { BookingMaintenance } from "../modules/bookings/bookings.facade";
import type { JobProcessor } from "./processor";

export const MAINTENANCE_JOBS = { heartbeat: "heartbeat", bookingSweep: "booking.sweep" } as const;

/** Expired holds and overdue pending bookings are swept this often (spec 06 §3.5, q13). */
export const BOOKING_SWEEP_EVERY_MS = 60_000;

const heartbeatPayload = z.object({ requestedAt: z.iso.datetime() });

/**
 * `maintenance` queue. `heartbeat` proves the producer → Valkey → worker path end to end;
 * `booking.sweep` runs the booking housekeeping on a repeatable schedule.
 */
@Injectable()
export class MaintenanceProcessor implements JobProcessor, OnApplicationBootstrap {
  readonly queue = QUEUES.maintenance;

  constructor(
    private readonly bookings: BookingMaintenance,
    private readonly queues: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queues
      .queue(QUEUES.maintenance)
      .upsertJobScheduler(
        MAINTENANCE_JOBS.bookingSweep,
        { every: BOOKING_SWEEP_EVERY_MS },
        { name: MAINTENANCE_JOBS.bookingSweep, data: {} },
      );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case MAINTENANCE_JOBS.heartbeat: {
        const { requestedAt } = heartbeatPayload.parse(job.data);
        return { requestedAt, processedAt: new Date().toISOString() };
      }
      case MAINTENANCE_JOBS.bookingSweep:
        return this.bookings.sweep();
      default:
        throw new Error(`maintenance: unknown job "${job.name}"`);
    }
  }
}
