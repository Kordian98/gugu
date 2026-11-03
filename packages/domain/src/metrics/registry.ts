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
  /**
   * "now": a snapshot from now on (no previous period), e.g. upcoming appointments.
   * "month": the owner's "This month" profit view (one calendar month in the salon timezone,
   * actual so far + projected); served by `GET insights/profit`, not by the period endpoint.
   */
  window?: "now" | "month";
  /** Only computed for readers with this permission (otherwise omitted from the response). */
  requiresPermission?: "services.cost.read" | "payroll.read";
  /** "assumption": built on an estimate the UI must label as such (e.g. the no-show allowance). */
  basis?: "actual" | "projected" | "mixed" | "assumption";
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
  // ─── "This month" profit view (owner request 2026-11-04, ADR-0016) ─────────────────────────
  // All salon-level aggregates; per-person pay is never a metric (X10). Owner by default
  // (payroll.read). agentExposed: the assistant gets these totals, never anyone's salary.
  "profit.revenue_earned": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["booking_services", "offline_sales"],
    definition:
      "Completed appointments this month so far: the amount recorded at the salon where one was " +
      "entered, otherwise the booked price. An estimate, not a payment.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "actual",
  },
  "profit.revenue_earned_recorded": {
    unit: "vnd",
    revenueKind: "recorded_offline_sale",
    readModels: ["offline_sales"],
    definition: "The part of revenue earned so far that comes from amounts recorded at the salon.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "actual",
  },
  "profit.revenue_upcoming": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["booking_services"],
    definition:
      "Pending, confirmed and checked-in appointments still to come this month, at their booked " +
      "line prices.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "projected",
  },
  "profit.no_show_allowance": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["bookings"],
    definition:
      "Assumption: upcoming revenue × the salon's own no-show rate over the last 90 days (only " +
      "with at least 20 finished appointments). Subtracted from the projection.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "assumption",
  },
  "profit.revenue_total": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["booking_services", "offline_sales"],
    definition: "Revenue earned so far + still to come − the no-show allowance.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "mixed",
  },
  "profit.service_costs": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["booking_services", "services"],
    definition:
      "Execution cost (materials etc.) entered per service, variant and add-on, for completed and " +
      "upcoming appointments this month. Uses today's costs; services without a cost count as 0.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "mixed",
  },
  "profit.payroll": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["staff_pay_settings", "booking_services", "payroll_adjustments"],
    definition:
      "Whole team, one total: base pay for the full month + commission earned + commission " +
      "expected on upcoming appointments + bonuses − deductions. Before tax and insurance.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "mixed",
  },
  "profit.other_costs": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["salon_costs"],
    definition: "Monthly costs the owner entered: rent, utilities, products, marketing and others.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "actual",
  },
  "profit.net": {
    unit: "vnd",
    revenueKind: "estimated_from_bookings",
    readModels: ["booking_services", "offline_sales", "staff_pay_settings", "salon_costs"],
    definition:
      "Estimated net profit at month end: revenue total − service costs − payroll − other costs. " +
      "Before tax; an estimate, not accounting.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "mixed",
  },
  "profit.gross_margin": {
    unit: "ratio",
    readModels: ["booking_services", "services"],
    definition: "(Revenue total − service costs) ÷ revenue total.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "mixed",
  },
  "profit.net_margin": {
    unit: "ratio",
    readModels: ["booking_services", "staff_pay_settings", "salon_costs"],
    definition: "Estimated net profit ÷ revenue total.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "mixed",
  },
  "profit.month_progress": {
    unit: "ratio",
    readModels: [],
    definition: "Days of the month elapsed (including today) ÷ days in the month.",
    agentExposed: true,
    window: "month",
    requiresPermission: "payroll.read",
    basis: "actual",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

const windowOf = (k: MetricKey): MetricDefinition["window"] =>
  (METRICS[k] as MetricDefinition).window;

/** Metrics of the period Insights endpoint (everything except the monthly profit view). */
export type PeriodMetricKey = Exclude<MetricKey, `profit.${string}`>;
export const PERIOD_METRIC_KEYS = METRIC_KEYS.filter(
  (k): k is PeriodMetricKey => windowOf(k) !== "month",
);

/** Metrics of the "This month" profit view (`GET insights/profit`). */
export type ProfitMetricKey = Extract<MetricKey, `profit.${string}`>;
export const PROFIT_METRIC_KEYS = METRIC_KEYS.filter(
  (k): k is ProfitMetricKey => windowOf(k) === "month",
);

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
