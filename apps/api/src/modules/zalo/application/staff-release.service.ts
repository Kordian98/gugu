import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { dueForAutoRelease } from "../domain/bot/routing";
import { INITIAL_BOT_STATE } from "../domain/bot/types";
import { ZaloClock } from "./zalo-clock";

/**
 * Hands staff-mode chats back to the bot after the salon's quiet time (default 30 min without a
 * hand-off, take-over or staff reply), so a customer is never stuck waiting. Leaves a note in the
 * conversation for staff (owner finding 2026-11-03).
 */
@Injectable()
export class StaffReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ZaloClock,
  ) {}

  async sweep(): Promise<{ released: number }> {
    const now = this.clock.now();
    const candidates = await this.prisma.zaloConversation.findMany({
      where: {
        mode: "staff",
        salon: { zaloConnection: { status: "connected", staffReleaseMinutes: { gt: 0 } } },
      },
      select: {
        id: true,
        salonId: true,
        mode: true,
        lastStaffActivityAt: true,
        salon: { select: { zaloConnection: { select: { staffReleaseMinutes: true } } } },
      },
      take: 500,
    });
    let released = 0;
    for (const c of candidates) {
      const minutes = c.salon.zaloConnection?.staffReleaseMinutes ?? 0;
      if (!dueForAutoRelease(c, minutes, now)) continue;
      const done = await this.prisma.$transaction(async (tx) => {
        // Only if nobody touched it meanwhile (a staff reply moves lastStaffActivityAt).
        const updated = await tx.zaloConversation.updateMany({
          where: { id: c.id, mode: "staff", lastStaffActivityAt: c.lastStaffActivityAt },
          data: {
            mode: "bot",
            assignedUserId: null,
            handoffRequestedAt: null,
            staffNoticeAt: null,
            botState: { ...INITIAL_BOT_STATE } as unknown as Prisma.InputJsonObject,
          },
        });
        if (updated.count !== 1) return false;
        await tx.zaloMessage.create({
          data: {
            salonId: c.salonId,
            conversationId: c.id,
            direction: "outbound",
            sender: "system",
            kind: "auto_released",
            payload: { minutes },
          },
        });
        return true;
      });
      if (done) released += 1;
    }
    return { released };
  }
}
