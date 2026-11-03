/**
 * Metric catalogue (topic 07 §4.6, roadmap X5/X7): the single definition of every number shown in
 * Insights and offered to the AI assistant. Each metric names the read model it is computed from;
 * the API computes it in the salon timezone over bookings that START in the period. Money is VND
 * and always carries a RevenueKind — never presented as a processed payment (master §2).
 */

export const REVENUE_KINDS = [
  "estimated_from_bookings",
  "recorded_offline_sale",
  "reported_by_salon",
] as const;
export type RevenueKind = (typeof REVENUE_KINDS)[number];

export type MetricUnit = "count" | "ratio" | "vnd";

export interface MetricDefinition {
  unit: MetricUnit;
  /** Set for money metrics; UIs must show the matching badge. */
  revenueKind?: RevenueKind;
  /** Read model(s) behind the metric (04 read-model registry ids). */
  readModels: readonly string[];
  /** Plain-language definition (en); localized copies live in the `crm` namespace. */
  definition: string;
  /** Safe for the AI assistant: aggregate only, no personal data (X10). */
  agentExposed: boolean;
  /** "now": a snapshot from now on (no previous period), e.g. upcoming appointments. */
  window?: "now";
  /** Only computed for readers with this permission (otherwise omitted from the response). */
  requiresPermission?: "services.cost.read";
}

export const METRICS = {
  "appointments.count": {
    unit: "count",
    readModels: ["bookings"],
    definition: "Appointments starting in the period, excluding cancelled ones.",
    agentExposed: true,
  },
  "appointments.upcoming": {
    unit: "count",
    readModels: ["bookings"],
    definition:
      "Active appointments (pending, confirmed) starting from now on, within the booking window. " +
      "A snapshot: independent of the selected period, no previous value.",
    agentExposed: true,
    window: "now",
  },
  "appointments.completed": {
    unit: "count",
    readModels: ["bookings"],
    definition: "Appointments starting in the period that were completed.",
    agentExposed: true,
  },
  "customers.new": {
    unit: "count",
    readModels: ["bookings"],
    definition:
      "Clients (by phone) whose first completed appointment at this salon is in the period.",
    agentExposed: true,
  },
  "customers.returning": {
    unit: "count",
    readModels: ["bookings"],
    definition: "Clients with a completed appointment in the period and an earlier completed one.",
    agentExposed: true,
  },
  "no_show.rate": {
    unit: "ratio",
    readModels: ["bookings"],
    definition: "No-shows ÷ (completed + checked in + no-shows) in the period.",
    agentExposed: true,
  },
  "cancellation.rate": {
    unit: "ratio",
    readModels: ["bookings"],
    definition: "Cancelled ÷ all appointments starting in the period.",
    agentExposed: true,
  },
  "revenue.estimated": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["booking_services"],
    definition: "Sum of booked prices (snapshot) of completed appointments. Not a payment.",
    agentExposed: true,
  },
  "revenue.offline_recorded": {
    unit: "vnd",
    revenueKind: "recorded_offline_sale",
    readModels: ["offline_sales"],
    definition: "Amounts the salon recorded as received at the salon for those appointments.",
    agentExposed: true,
  },
  "margin.estimated": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["bookings", "services"],
    definition:
      "Completed appointments' service price (incl. add-ons) minus the internal cost entered for " +
      "the service/variant/add-on, over services that have a cost set. Uses today's costs.",
    agentExposed: false,
    requiresPermission: "services.cost.read",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** Previous period of equal length directly before `from`..`to` (inclusive local dates). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  const len = Math.round((b - a) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(a - len * day), to: iso(a - day) };
}

/** Safe ratio: null when the denominator is 0 (renders as "—", never as 0 %). */
export const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);
