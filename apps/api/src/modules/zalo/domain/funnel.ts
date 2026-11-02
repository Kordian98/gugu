/**
 * Zalo bot funnel (owner request 2026-11-03): event vocabulary and the pure aggregation behind the
 * statistics read model. Events carry counts and steps only — never message text or personal data.
 */

/** Ordered bot steps of one booking attempt ("session"). Skipped steps count as passed. */
export const FUNNEL_STEPS = ["service", "staff", "slot", "phone", "confirm"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export const stepRank = (step: string | null): number =>
  FUNNEL_STEPS.indexOf(step as FunnelStep) + 1;

/** Why a session ended without a booking. */
export const SESSION_END_REASONS = [
  /** Silent for 30 min, or left for the menu, at `step`. */
  "abandoned",
  "no_slots",
  "no_services",
  /** Asked for staff (or the bot handed off). */
  "handoff",
  /** Left after the bot didn't understand typed text. */
  "not_understood",
  /** Left after the chosen time was taken at confirmation. */
  "slot_taken",
  /** Tapped "Hủy" at confirmation. */
  "cancelled",
  "failed",
  "limit_reached",
  /** The salon's setup blocks booking (no staff assigned / no working hours). */
  "not_bookable",
] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export const FUNNEL_EVENTS = [
  "inbound",
  "followed",
  "unfollowed",
  "conversation_started",
  "session_started",
  "step_reached",
  "booked",
  "session_ended",
  "not_understood",
  "slot_taken",
  "handoff",
  "staff_takeover",
  "bot_unavailable",
  "reply_blocked",
  "booking_cancelled",
  "booking_rescheduled",
  "attendance_confirmed",
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export interface FunnelEventInput {
  event: FunnelEventName;
  sessionId?: string | null;
  step?: FunnelStep | null;
  reason?: string | null;
  bookingId?: string | null;
}

/** One group of sessions started in the period, as returned by the SQL rollup. */
export interface SessionGroup {
  /** Highest step rank reached (0 = none, 1 = service … 5 = confirm). */
  maxRank: number;
  booked: boolean;
  endReason: string | null;
  endStep: string | null;
  count: number;
}

export interface FunnelSummary {
  sessions: number;
  booked: number;
  inProgress: number;
  /** booked / sessions, 0..1 (0 when no sessions). */
  conversionRate: number;
  steps: { step: FunnelStep; reached: number; dropOff: number; dropOffRate: number }[];
  /** Lost-session reasons; "abandoned" is split per step: `abandoned:<step>`. */
  lost: Record<string, number>;
}

const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 1000);

/**
 * Funnel from per-session groups. A session reached a step when its highest step is at least that
 * step or it booked; drop-off at a step = reached it but not the next one (confirm → booked).
 */
export function summarizeFunnel(groups: readonly SessionGroup[]): FunnelSummary {
  const sessions = groups.reduce((n, g) => n + g.count, 0);
  const booked = groups.filter((g) => g.booked).reduce((n, g) => n + g.count, 0);
  const reachedAt = (rank: number) =>
    groups.filter((g) => g.booked || g.maxRank >= rank).reduce((n, g) => n + g.count, 0);
  const steps = FUNNEL_STEPS.map((step, i) => {
    const reached = reachedAt(i + 1);
    const next = i + 1 < FUNNEL_STEPS.length ? reachedAt(i + 2) : booked;
    const dropOff = Math.max(0, reached - next);
    return { step, reached, dropOff, dropOffRate: ratio(dropOff, reached) };
  });
  const lost: Record<string, number> = {};
  let inProgress = 0;
  for (const g of groups) {
    if (g.booked) continue;
    if (!g.endReason) {
      inProgress += g.count;
      continue;
    }
    const key = g.endReason === "abandoned" ? `abandoned:${g.endStep ?? "service"}` : g.endReason;
    lost[key] = (lost[key] ?? 0) + g.count;
  }
  return { sessions, booked, inProgress, conversionRate: ratio(booked, sessions), steps, lost };
}
