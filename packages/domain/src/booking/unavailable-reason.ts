import type { AvailabilityInput } from "./availability";
import { addDays, toLocal } from "./tz";

/** Why a date range has no bookable time — shown instead of an empty slot list (CRM, Zalo bot). */
export const UNAVAILABLE_REASONS = [
  "no_staff_assigned",
  "no_working_hours",
  "no_resource",
  "outside_booking_window",
  "fully_booked",
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

/**
 * Explains an empty availability result, most actionable cause first:
 * nobody performs the service (or one service of a chain) → nobody (eligible) has working hours in the range or the salon has
 * no opening hours → a required resource type has no active units (M6.6) → the range starts after
 * the booking window → otherwise taken/past/closed days.
 * Call only when the engine returned no slots for `input`.
 */
export function unavailableReason(input: AvailabilityInput): UnavailableReason {
  const staffIds = new Set(input.staff.map((s) => s.staffId));
  // Chains (M6.8): every line needs at least one eligible staff member.
  const lines = input.lines ?? [
    {
      staffTerms: new Map(input.staff.map((s) => [s.staffId, s.terms] as const)),
      requirements: input.resources?.requirements ?? [],
    },
  ];
  if (
    input.staff.length === 0 ||
    lines.some((l) => ![...l.staffTerms.keys()].some((id) => staffIds.has(id)))
  )
    return "no_staff_assigned";
  const hasHours = input.staff.some((s) =>
    s.schedules.some(
      (w) => w.effectiveFrom <= input.to && (w.effectiveTo === null || input.from <= w.effectiveTo),
    ),
  );
  if (!hasHours || (input.openingHours.length === 0 && !input.overrides?.has("hours")))
    return "no_working_hours";
  const units = input.resources?.units ?? [];
  if (
    lines.some((l) =>
      (l.requirements ?? []).some(
        (r) => units.filter((u) => u.resourceTypeId === r.resourceTypeId).length < r.quantity,
      ),
    )
  )
    return "no_resource";
  const today = toLocal(input.now, input.timeZone).date;
  if (
    !input.overrides?.has("horizon") &&
    input.from > addDays(today, input.rules.bookingWindowDays)
  )
    return "outside_booking_window";
  return "fully_booked";
}
