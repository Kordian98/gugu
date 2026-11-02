/**
 * Domain events delivered from the transactional outbox (spec 04 G8, 04-S5). Delivery is
 * at-least-once and a failed job re-runs every handler for that event, so handlers MUST be
 * idempotent (dedupe by `event.id`).
 */
export interface DomainEvent {
  id: string;
  salonId: string | null;
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface DomainEventHandler {
  /** Stable name for logs. */
  readonly name: string;
  /** Event types this handler wants, e.g. `booking.created`. */
  readonly types: readonly string[];
  handle(event: DomainEvent): Promise<void>;
}

/** Multi-provider token: worker modules contribute handlers (see jobs/jobs.module.ts). */
export const DOMAIN_EVENT_HANDLERS = Symbol("DOMAIN_EVENT_HANDLERS");

export const OUTBOX_JOBS = {
  /** Publish unpublished outbox rows (kicked after commits + every few seconds as a fallback). */
  relay: "outbox.relay",
  /** Deliver one event to its handlers. */
  event: "outbox.event",
} as const;
