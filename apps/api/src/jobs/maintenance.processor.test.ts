import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import { MAINTENANCE_JOBS, MaintenanceProcessor } from "./maintenance.processor";

const job = (name: string, data: unknown) => ({ name, data }) as Job;

describe("MaintenanceProcessor", () => {
  const processor = new MaintenanceProcessor();

  it("processes heartbeat jobs", async () => {
    const requestedAt = new Date().toISOString();
    await expect(
      processor.process(job(MAINTENANCE_JOBS.heartbeat, { requestedAt })),
    ).resolves.toMatchObject({ requestedAt });
  });

  it("rejects invalid payloads and unknown jobs (so BullMQ retries/fails visibly)", async () => {
    await expect(processor.process(job(MAINTENANCE_JOBS.heartbeat, {}))).rejects.toThrow();
    await expect(processor.process(job("nope", {}))).rejects.toThrow(/unknown job/);
  });
});
