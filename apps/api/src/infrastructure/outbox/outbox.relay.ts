import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { QUEUES } from "../queue/queues";
import { type DomainEvent, OUTBOX_JOBS } from "./domain-events";

const BATCH = 500;

/**
 * Outbox relay (04-S5): moves committed `outbox_events` rows to the `outbox` BullMQ queue, one job
 * per event with `jobId = event id` (so a crash between enqueue and marking published can't
 * duplicate a job that still exists). Rows are claimed with `FOR UPDATE SKIP LOCKED`, so several
 * relays can run at once. Producers call `kick()` right after their transaction commits; a
 * scheduler runs `publishPending()` every few seconds as the safety net.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  /** Ask the worker to relay now (fire-and-forget; never fails the caller). */
  async kick(): Promise<void> {
    try {
      await this.queues
        .queue(QUEUES.outbox)
        .add(OUTBOX_JOBS.relay, {}, { removeOnComplete: true, removeOnFail: true, attempts: 1 });
    } catch (error) {
      this.logger.warn(
        { err: (error as Error).message },
        "outbox kick failed (scheduler will relay)",
      );
    }
  }

  async publishPending(): Promise<{ published: number }> {
    let published = 0;
    for (;;) {
      const n = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            salon_id: string | null;
            aggregate_type: string;
            aggregate_id: string;
            type: string;
            payload: Record<string, unknown>;
            occurred_at: Date;
          }[]
        >`
          SELECT id, salon_id, aggregate_type, aggregate_id, type, payload, occurred_at
          FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY occurred_at
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return 0;
        const queue = this.queues.queue(QUEUES.outbox);
        await queue.addBulk(
          rows.map((r) => {
            const event: DomainEvent = {
              id: r.id,
              salonId: r.salon_id,
              aggregateType: r.aggregate_type,
              aggregateId: r.aggregate_id,
              type: r.type,
              payload: r.payload,
              occurredAt: r.occurred_at.toISOString(),
            };
            return { name: OUTBOX_JOBS.event, data: event, opts: { jobId: r.id } };
          }),
        );
        await tx.outboxEvent.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { publishedAt: new Date(), attempts: { increment: 1 } },
        });
        return rows.length;
      });
      published += n;
      if (n < BATCH) return { published };
    }
  }
}
