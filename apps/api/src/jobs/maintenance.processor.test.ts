import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { QueueService } from "../infrastructure/queue/queue.service";
import type { BookingMaintenance } from "../modules/bookings/bookings.facade";
import {
  BOOKING_SWEEP_EVERY_MS,
  MAINTENANCE_JOBS,
  MaintenanceProcessor,
} from "./maintenance.processor";

const job = (name: string, data: unknown) => ({ name, data }) as Job;

describe("MaintenanceProcessor", () => {
  const sweep = vi.fn(() => Promise.resolve({ holdsDeleted: 2, pendingExpired: 1 }));
  const upsertJobScheduler = vi.fn(() => Promise.resolve());
  const processor = new MaintenanceProcessor(
    { sweep } as unknown as BookingMaintenance,
    { queue: () => ({ upsertJobScheduler }) } as unknown as QueueService,
  );

  it("processes heartbeat jobs", async () => {
    const requestedAt = new Date().toISOString();
    await expect(
      processor.process(job(MAINTENANCE_JOBS.heartbeat, { requestedAt })),
    ).resolves.toMatchObject({ requestedAt });
  });

  it("runs the booking sweep and schedules it every minute", async () => {
    await expect(processor.process(job(MAINTENANCE_JOBS.bookingSweep, {}))).resolves.toEqual({
      holdsDeleted: 2,
      pendingExpired: 1,
    });
    await processor.onApplicationBootstrap();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      MAINTENANCE_JOBS.bookingSweep,
      { every: BOOKING_SWEEP_EVERY_MS },
      { name: MAINTENANCE_JOBS.bookingSweep, data: {} },
    );
  });

  it("rejects invalid payloads and unknown jobs (so BullMQ retries/fails visibly)", async () => {
    await expect(processor.process(job(MAINTENANCE_JOBS.heartbeat, {}))).rejects.toThrow();
    await expect(processor.process(job("nope", {}))).rejects.toThrow(/unknown job/);
  });
});
