/**
 * BullMQ queue registry (docs/tasks/04-backend-database.md §4.6). Every queue is declared here so
 * producers, the worker and dashboards agree on names. Jobs must be idempotent (deterministic job id).
 */
export const QUEUES = {
  /** Housekeeping: heartbeats, sweepers, partition maintenance. */
  maintenance: "maintenance",
  /** Zalo OA (topic 09): inbound webhook events, ordered send batches, reminders, token refresh. */
  zalo: "zalo",
  /** Transactional outbox relay and domain-event delivery (04-S5; infrastructure/outbox). */
  outbox: "outbox",
  /** Notifications (topic 11): email sends, staff emails, delayed reminders, reconciliation. */
  notify: "notify",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;
