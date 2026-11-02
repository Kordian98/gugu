import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import type { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { FunnelEventInput } from "../domain/funnel";

type Db = PrismaService | Prisma.TransactionClient;

/** Appends funnel/activity events (counts and steps only — never text or personal data). */
export async function recordFunnel(
  db: Db,
  salonId: string,
  conversationId: string,
  events: readonly FunnelEventInput[],
  at: Date,
): Promise<void> {
  if (events.length === 0) return;
  await db.zaloFunnelEvent.createMany({
    data: events.map((e) => ({
      salonId,
      conversationId,
      sessionId: e.sessionId ?? null,
      event: e.event,
      step: e.step ?? null,
      reason: e.reason ?? null,
      bookingId: e.bookingId ?? null,
      occurredAt: at,
    })),
  });
}
