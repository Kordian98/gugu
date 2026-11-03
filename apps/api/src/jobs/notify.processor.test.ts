import { DelayedError, type Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { QueueService } from "../infrastructure/queue/queue.service";
import type { NotifyJobs } from "../modules/notifications/notifications.facade";
import { NotifyProcessor } from "./notify.processor";

const id = "0190a1b2-0000-7000-8000-000000000001";

function setup(result: unknown) {
  const jobs = {
    send: vi.fn().mockResolvedValue(result),
    reconcile: vi.fn().mockResolvedValue({}),
  };
  const p = new NotifyProcessor(jobs as unknown as NotifyJobs, {} as QueueService);
  const job = (over: Partial<Job> = {}) =>
    ({
      name: "notify.send",
      data: { deliveryId: id },
      attemptsMade: 0,
      opts: { attempts: 6 },
      moveToDelayed: vi.fn().mockResolvedValue(undefined),
      ...over,
    }) as unknown as Job;
  return { jobs, p, job };
}

describe("NotifyProcessor", () => {
  it("passes finalAttempt only on the last attempt", async () => {
    const { jobs, p, job } = setup({ kind: "sent" });
    await p.process(job({ attemptsMade: 4 }), "t");
    expect(jobs.send).toHaveBeenLastCalledWith(id, false);
    await p.process(job({ attemptsMade: 5 }), "t");
    expect(jobs.send).toHaveBeenLastCalledWith(id, true);
  });

  it("moves a deferred send back to delayed instead of failing", async () => {
    const until = new Date("2026-12-01T01:01:00Z");
    const { p, job } = setup({ kind: "deferred", until });
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);
    await expect(p.process(job({ moveToDelayed }), "tok")).rejects.toBeInstanceOf(DelayedError);
    expect(moveToDelayed).toHaveBeenCalledWith(until.getTime(), "tok");
  });

  it("rejects bad payloads and unknown jobs", async () => {
    const { p, job } = setup({ kind: "sent" });
    await expect(p.process(job({ data: { deliveryId: "nope" } }), "t")).rejects.toThrow();
    await expect(p.process(job({ name: "notify.what" }), "t")).rejects.toThrow(/unknown job/);
  });
});
