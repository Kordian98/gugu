import type { Prisma } from "../prisma/generated/client";

/**
 * Transactional outbox (spec 04 G8): domain events are written in the same transaction as the
 * change they describe, so they exist iff it commits. The relay that publishes them to BullMQ is
 * milestone 04-S5; consumers must dedupe by event id.
 */
export interface OutboxEventInput {
  salonId: string | null;
  aggregateType: string;
  aggregateId: string;
  /** `<aggregate>.<past-tense verb>`, e.g. `booking.created`. */
  type: string;
  /** Ids and codes only — never personal data (names, phones, notes). */
  payload: Prisma.InputJsonObject;
}

export async function appendOutbox(
  tx: Prisma.TransactionClient,
  event: OutboxEventInput,
): Promise<void> {
  await tx.outboxEvent.create({ data: event });
}
