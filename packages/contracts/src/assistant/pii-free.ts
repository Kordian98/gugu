import { z } from "zod";
import { BOOKING_STATUS_VALUES } from "../booking/booking";
import { BOOKING_SOURCES } from "../booking/source";

/**
 * PII-free field types for everything the AI assistant's model may see (topic 08 §4.3, owner rule
 * q03: no personal data to any LLM). Tool outputs are built only from these; there is **no free
 * `string` type**. Entities travel as per-conversation tokens (`staff_3`), re-hydrated to names on
 * the server after the model call, for the authorised viewer only.
 */

export const ENTITY_TOKEN_KINDS = ["staff", "service", "booking"] as const;
export type EntityTokenKind = (typeof ENTITY_TOKEN_KINDS)[number];

export const ENTITY_TOKEN_RE = /^(staff|service|booking)_[1-9]\d{0,5}$/;
/** Same pattern without anchors, for finding tokens inside model text. */
export const ENTITY_TOKEN_SCAN_RE = /\b(staff|service|booking)_[1-9]\d{0,5}\b/g;

export const entityTokenSchema = (kind: EntityTokenKind) =>
  z.string().regex(new RegExp(`^${kind}_[1-9]\\d{0,5}$`));

/** Revenue is always labelled by kind and never summed across kinds (roadmap X5). */
export const REVENUE_KINDS = [
  "estimated_from_bookings",
  "recorded_offline_sale",
  "reported_by_salon",
] as const;
export const revenueKindSchema = z.enum(REVENUE_KINDS);
export type RevenueKind = z.infer<typeof revenueKindSchema>;

/** Relative periods the model may ask the server to resolve (it never does date math itself). */
export const PERIOD_EXPRESSIONS = [
  "today",
  "yesterday",
  "tomorrow",
  "this_week",
  "last_week",
  "next_week",
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
] as const;
export const periodExpressionSchema = z.enum(PERIOD_EXPRESSIONS);
export type PeriodExpression = z.infer<typeof periodExpressionSchema>;

export const GROUP_BY_VALUES = ["none", "status", "staff", "service", "day"] as const;

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const moneyVndSchema = z.number().int().min(0);
/** Profit and margins can be negative (a loss month). */
export const signedMoneyVndSchema = z.number().int();
export const signedPercentSchema = z.number().min(-100_000).max(1000);
export const countSchema = z.number().int().min(0);
export const percentSchema = z.number().min(0).max(1000);
export const minutesSchema = z.number().int().min(0);

/** Every enum string a tool output may contain. */
export const PII_FREE_ENUM_VALUES: ReadonlySet<string> = new Set<string>([
  ...BOOKING_STATUS_VALUES,
  ...BOOKING_SOURCES,
  ...REVENUE_KINDS,
  ...PERIOD_EXPRESSIONS,
  ...GROUP_BY_VALUES,
  "tracked",
  "not_tracked",
  "VND",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** True when a string value is allowed in model-bound data (token, ISO date/time or known enum). */
export function isPiiFreeString(value: string): boolean {
  return (
    ENTITY_TOKEN_RE.test(value) ||
    ISO_DATE.test(value) ||
    ISO_DATE_TIME.test(value) ||
    PII_FREE_ENUM_VALUES.has(value)
  );
}
