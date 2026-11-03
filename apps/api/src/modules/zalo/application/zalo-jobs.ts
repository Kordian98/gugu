import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { ConnectionService } from "./connection.service";
import { InboundService } from "./inbound.service";
import { OutboundService } from "./outbound.service";
import { FunnelSweepService } from "./funnel-sweep.service";
import { RemindersService } from "./reminders.service";
import { StaffReleaseService } from "./staff-release.service";
import { ZaloClock } from "./zalo-clock";

/** Raw webhook payloads contain customer text: kept this long for debugging, then deleted. */
const EVENT_RETENTION_MS = 30 * 86_400_000;

/** Entry points for the `zalo` BullMQ queue (jobs/zalo.processor.ts). */
@Injectable()
export class ZaloJobs {
  constructor(
    private readonly inbound: InboundService,
    private readonly outbound: OutboundService,
    private readonly reminders: RemindersService,
    private readonly staffRelease: StaffReleaseService,
    private readonly funnelSweep: FunnelSweepService,
    private readonly connections: ConnectionService,
    private readonly prisma: PrismaService,
    private readonly clock: ZaloClock,
  ) {}

  async inboundEvent(eventId: string, finalAttempt: boolean, error?: unknown) {
    if (error) {
      if (finalAttempt) await this.inbound.markFailed(eventId, (error as Error).message);
      return;
    }
    return this.inbound.process(eventId);
  }

  send(salonId: string, logIds: string[], finalAttempt: boolean) {
    return this.outbound.processBatch(salonId, logIds, finalAttempt);
  }

  async minute() {
    const reminders = await this.reminders.scan();
    const released = await this.staffRelease.sweep();
    await this.funnelSweep.sweep();
    return { reminders: reminders.queued, released: released.released };
  }

  refreshTokens() {
    return this.connections.refreshDue();
  }

  async purgeEvents() {
    const before = new Date(this.clock.now().getTime() - EVENT_RETENTION_MS);
    const { count } = await this.prisma.zaloWebhookEvent.deleteMany({
      where: { receivedAt: { lt: before } },
    });
    return { deleted: count };
  }
}
