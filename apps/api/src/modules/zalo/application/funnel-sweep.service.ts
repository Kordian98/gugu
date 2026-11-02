import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { expireSession } from "../domain/bot/engine";
import { type BotState, FLOW_TIMEOUT_MS } from "../domain/bot/types";
import type { FunnelEventInput } from "../domain/funnel";
import { recordFunnel } from "./funnel.recorder";
import { ZaloClock } from "./zalo-clock";

/**
 * Closes booking attempts whose customer went quiet (> FLOW_TIMEOUT_MS) and never came back, so
 * the funnel counts them as abandoned at their last step instead of "in progress" forever.
 */
@Injectable()
export class FunnelSweepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ZaloClock,
  ) {}

  async sweep(): Promise<{ closed: number }> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - FLOW_TIMEOUT_MS);
    const stale = await this.prisma.$queryRaw<{ id: string; salon_id: string }[]>`
      SELECT id, salon_id FROM zalo_conversations
      WHERE jsonb_typeof(bot_state->'session') = 'object'
        AND (bot_state->>'at')::timestamptz < ${cutoff}
      LIMIT 500`;
    let closed = 0;
    for (const row of stale) {
      const done = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM zalo_conversations WHERE id = ${row.id}::uuid FOR NO KEY UPDATE`;
        const conv = await tx.zaloConversation.findUniqueOrThrow({ where: { id: row.id } });
        const result = expireSession(conv.botState as unknown as BotState, now);
        if (!result) return false;
        await tx.zaloConversation.update({
          where: { id: row.id },
          data: { botState: result.state as unknown as Prisma.InputJsonObject },
        });
        const events = result.effects.flatMap((e): FunnelEventInput[] =>
          e.type === "funnel" ? [e.event] : [],
        );
        await recordFunnel(tx, row.salon_id, row.id, events, now);
        return true;
      });
      if (done) closed += 1;
    }
    return { closed };
  }
}
