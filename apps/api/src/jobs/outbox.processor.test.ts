import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { DomainEventHandler } from "../infrastructure/outbox/domain-events";
import { OUTBOX_JOBS } from "../infrastructure/outbox/domain-events";
import type { OutboxRelay } from "../infrastructure/outbox/outbox.relay";
import type { QueueService } from "../infrastructure/queue/queue.service";
import { OUTBOX_RELAY_EVERY_MS, OutboxProcessor } from "./outbox.processor";

const job = (name: string, data: unknown) => ({ name, data }) as Job;
const event = {
  id: "0190f000-0000-7000-8000-000000000001",
  salonId: "0190f000-0000-7000-8000-000000000002",
  aggregateType: "booking",
  aggregateId: "0190f000-0000-7000-8000-000000000003",
  type: "booking.created",
  payload: { bookingId: "0190f000-0000-7000-8000-000000000003" },
  occurredAt: "2026-12-01T01:00:00.000Z",
};

function setup(handlers: DomainEventHandler[]) {
  const publishPending = vi.fn(() => Promise.resolve({ published: 3 }));
  const upsertJobScheduler = vi.fn(() => Promise.resolve());
  const processor = new OutboxProcessor(
    { publishPending } as unknown as OutboxRelay,
    { queue: () => ({ upsertJobScheduler }) } as unknown as QueueService,
    handlers,
  );
  return { processor, publishPending, upsertJobScheduler };
}

describe("OutboxProcessor", () => {
  it("relays, schedules the fallback tick and dispatches events by type", async () => {
    const handle = vi.fn(() => Promise.resolve());
    const other = vi.fn(() => Promise.resolve());
    const { processor, publishPending, upsertJobScheduler } = setup([
      { name: "a", types: ["booking.created"], handle },
      { name: "b", types: ["booking.rescheduled"], handle: other },
    ]);
    await expect(processor.process(job(OUTBOX_JOBS.relay, {}))).resolves.toEqual({ published: 3 });
    expect(publishPending).toHaveBeenCalled();
    await expect(processor.process(job(OUTBOX_JOBS.event, event))).resolves.toEqual({
      handled: ["a"],
    });
    expect(handle).toHaveBeenCalledWith(event);
    expect(other).not.toHaveBeenCalled();
    await processor.onApplicationBootstrap();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      OUTBOX_JOBS.relay,
      { every: OUTBOX_RELAY_EVERY_MS },
      expect.objectContaining({ name: OUTBOX_JOBS.relay }),
    );
  });

  it("a failing handler fails the job (BullMQ retries); bad payloads and unknown jobs reject", async () => {
    const { processor } = setup([
      { name: "x", types: ["booking.created"], handle: () => Promise.reject(new Error("boom")) },
    ]);
    await expect(processor.process(job(OUTBOX_JOBS.event, event))).rejects.toThrow("boom");
    await expect(processor.process(job(OUTBOX_JOBS.event, { id: "nope" }))).rejects.toThrow();
    await expect(processor.process(job("nope", {}))).rejects.toThrow(/unknown job/);
  });
});
