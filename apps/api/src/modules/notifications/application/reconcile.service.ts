import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { DeliveryQueue } from "./delivery-queue";
import { NotifyClock } from "./notify-clock";

const DAY = 86_400_000;

/**
 * Reconciliation (platform-level, every 10 min, all salons): re-enqueues team emails still
 * pending in the last 7 days, in case Redis lost their jobs. Adding a job whose id (the
 * idempotency key) exists is a no-op, and the worker's lease makes a double run harmless.
 */
@Injectable()
export class ReconcileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: DeliveryQueue,
    private readonly clock: NotifyClock,
  ) {}

  async reconcile(): Promise<{ requeued: number }> {
    const now = this.clock.now();
    const pending = await this.prisma.notificationDelivery.findMany({
      where: {
        channel: "email",
        status: { in: ["scheduled", "queued"] },
        createdAt: { gt: new Date(now.getTime() - 7 * DAY) },
      },
      select: { id: true, idempotencyKey: true, scheduledFor: true },
      take: 1_000,
    });
    await this.queue.enqueue(pending);
    return { requeued: pending.length };
  }
}
