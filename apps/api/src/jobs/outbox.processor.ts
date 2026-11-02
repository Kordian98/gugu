import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import type { Job } from "bullmq";
import { z } from "zod";
import {
  DOMAIN_EVENT_HANDLERS,
  type DomainEvent,
  type DomainEventHandler,
  OUTBOX_JOBS,
} from "../infrastructure/outbox/domain-events";
import { OutboxRelay } from "../infrastructure/outbox/outbox.relay";
import { QueueService } from "../infrastructure/queue/queue.service";
import { QUEUES } from "../infrastructure/queue/queues";
import type { JobProcessor } from "./processor";

/** Fallback relay interval; normally a commit kicks the relay within milliseconds. */
export const OUTBOX_RELAY_EVERY_MS = 5_000;

const eventPayload = z.object({
  id: z.uuid(),
  salonId: z.uuid().nullable(),
  aggregateType: z.string(),
  aggregateId: z.uuid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string(),
});

/**
 * `outbox` queue (04-S5): `outbox.relay` publishes committed outbox rows as `outbox.event` jobs;
 * `outbox.event` runs every registered handler for the event type. A failing handler fails the job,
 * so BullMQ retries it (handlers are idempotent by contract).
 */
@Injectable()
export class OutboxProcessor implements JobProcessor, OnApplicationBootstrap {
  readonly queue = QUEUES.outbox;
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly relay: OutboxRelay,
    private readonly queues: QueueService,
    @Inject(DOMAIN_EVENT_HANDLERS) private readonly handlers: DomainEventHandler[],
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queues
      .queue(QUEUES.outbox)
      .upsertJobScheduler(
        OUTBOX_JOBS.relay,
        { every: OUTBOX_RELAY_EVERY_MS },
        { name: OUTBOX_JOBS.relay, data: {}, opts: { removeOnComplete: true, removeOnFail: true } },
      );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case OUTBOX_JOBS.relay:
        return this.relay.publishPending();
      case OUTBOX_JOBS.event: {
        const event: DomainEvent = eventPayload.parse(job.data);
        const matching = this.handlers.filter((h) => h.types.includes(event.type));
        for (const handler of matching) {
          try {
            await handler.handle(event);
          } catch (error) {
            this.logger.warn(
              { handler: handler.name, eventId: event.id, err: (error as Error).message },
              "domain event handler failed",
            );
            throw error;
          }
        }
        return { handled: matching.map((h) => h.name) };
      }
      default:
        throw new Error(`outbox: unknown job "${job.name}"`);
    }
  }
}
