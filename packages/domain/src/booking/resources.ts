import { type Interval, overlaps } from "./intervals";

/**
 * Resources (rooms, chairs, beds, equipment) for the slot engine (spec 06 §3.4, X4, M6.6).
 * A resource of capacity N is N units; a booking claims `quantity` free units of each type its
 * service requires for the same occupancy interval as the staff member (buffers included), so
 * cleaning time blocks the bed too. The DB EXCLUDE constraint guards units like staff.
 */

export interface ResourceRequirement {
  resourceTypeId: string;
  /** Units needed at the same time (usually 1). */
  quantity: number;
}

export interface ResourceUnitAvailability {
  unitId: string;
  resourceTypeId: string;
  /** Lower first: units are filled in a stable order (resource sort order, then unit label). */
  sortOrder: number;
  /** Active occupancy of the unit (bookings and unexpired holds). */
  busy: readonly Interval[];
}

export interface ResourceInput {
  requirements: readonly ResourceRequirement[];
  units: readonly ResourceUnitAvailability[];
}

/** Stable unit fill order: resource sort order, then unit id. */
export const unitOrder = (a: ResourceUnitAvailability, b: ResourceUnitAvailability) =>
  a.sortOrder - b.sortOrder || (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);

/**
 * Units to claim for `occupancy`, or null when some required type has fewer free units than
 * needed. No requirements → `[]` (the service needs only a staff member).
 */
export function pickUnits(
  resources: ResourceInput | undefined,
  occupancy: Interval,
): string[] | null {
  if (!resources || resources.requirements.length === 0) return [];
  const chosen: string[] = [];
  for (const req of resources.requirements) {
    const free = resources.units
      .filter(
        (u) =>
          u.resourceTypeId === req.resourceTypeId && !u.busy.some((b) => overlaps(b, occupancy)),
      )
      .sort(unitOrder)
      .slice(0, req.quantity);
    if (free.length < req.quantity) return null;
    chosen.push(...free.map((u) => u.unitId));
  }
  return chosen;
}
