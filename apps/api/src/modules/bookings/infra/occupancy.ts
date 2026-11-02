import type { Interval } from "@gugu/domain";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";

/**
 * Raw SQL for booking_occupancy (tstzrange — Prisma can't model it, ADR-0008). Every write path:
 * lock the staff members it may claim → drop their expired holds → revalidate → insert. The
 * EXCLUDE constraints `booking_occupancy_no_{staff,unit}_overlap` are the guarantee; the per-target
 * advisory lock only makes contention serialize instead of deadlocking (ADR-0008 decision 4).
 */

type Tx = Prisma.TransactionClient;

/**
 * Transaction locks on every claim target (staff and resource unit ids — all UUIDs, one key space)
 * a write may take, in one globally sorted order so concurrent writers can't deadlock (ADR-0008).
 */
export async function lockClaims(tx: Tx, targetIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(targetIds)].sort()) {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))) AS l`;
  }
}

/** Serializes the per-phone active-booking limit check (spec 06 §3.11). */
export async function lockPhone(tx: Tx, salonId: string, phoneHash: string): Promise<void> {
  const key = `${salonId}:${phoneHash}`;
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 1))) AS l`;
}

/**
 * Deletes expired holds that claim any of these staff members or units (their occupancy rows
 * cascade), so an unswept expired hold never blocks a write. Call under `lockClaims`.
 */
export async function releaseExpiredHolds(
  tx: Tx,
  salonId: string,
  staffIds: readonly string[],
  now: Date,
  unitIds: readonly string[] = [],
): Promise<void> {
  if (staffIds.length > 0) {
    await tx.bookingHold.deleteMany({
      where: { salonId, staffId: { in: [...staffIds] }, expiresAt: { lte: now } },
    });
  }
  if (unitIds.length > 0) {
    await tx.bookingHold.deleteMany({
      where: {
        salonId,
        expiresAt: { lte: now },
        occupancy: { some: { resourceUnitId: { in: [...unitIds] } } },
      },
    });
  }
}

export interface BusyRow {
  staffId: string;
  start: number;
  end: number;
}

export interface UnitBusyRow {
  unitId: string;
  start: number;
  end: number;
}

/** Active claims of these resource units overlapping `window` (same rules as `loadBusy`). */
export async function loadUnitBusy(
  db: Tx,
  salonId: string,
  unitIds: readonly string[],
  window: Interval,
  now: Date,
  exclude: { holdId?: string | null; bookingId?: string | null } = {},
): Promise<UnitBusyRow[]> {
  if (unitIds.length === 0) return [];
  const rows = await db.$queryRaw<{ unit_id: string; s: Date; e: Date }[]>`
    SELECT resource_unit_id AS unit_id, lower(period) AS s, upper(period) AS e
    FROM booking_occupancy
    WHERE salon_id = ${salonId}::uuid
      AND resource_unit_id = ANY(${[...unitIds]}::uuid[])
      AND active
      AND (expires_at IS NULL OR expires_at > ${now})
      AND period && tstzrange(${new Date(window.start)}, ${new Date(window.end)}, '[)')
      AND (${exclude.holdId ?? null}::uuid IS NULL OR hold_id IS DISTINCT FROM ${exclude.holdId ?? null}::uuid)
      AND (${exclude.bookingId ?? null}::uuid IS NULL OR booking_id IS DISTINCT FROM ${exclude.bookingId ?? null}::uuid)`;
  return rows.map((r) => ({ unitId: r.unit_id, start: r.s.getTime(), end: r.e.getTime() }));
}

/**
 * Active claims of these staff members overlapping `window` (unexpired holds included).
 * `exclude` drops the caller's own hold or booking (converting a hold, rescheduling).
 */
export async function loadBusy(
  db: Tx,
  salonId: string,
  staffIds: readonly string[],
  window: Interval,
  now: Date,
  exclude: { holdId?: string | null; bookingId?: string | null } = {},
): Promise<BusyRow[]> {
  if (staffIds.length === 0) return [];
  const rows = await db.$queryRaw<{ staff_id: string; s: Date; e: Date }[]>`
    SELECT staff_id, lower(period) AS s, upper(period) AS e
    FROM booking_occupancy
    WHERE salon_id = ${salonId}::uuid
      AND staff_id = ANY(${[...staffIds]}::uuid[])
      AND active
      AND (expires_at IS NULL OR expires_at > ${now})
      AND period && tstzrange(${new Date(window.start)}, ${new Date(window.end)}, '[)')
      AND (${exclude.holdId ?? null}::uuid IS NULL OR hold_id IS DISTINCT FROM ${exclude.holdId ?? null}::uuid)
      AND (${exclude.bookingId ?? null}::uuid IS NULL OR booking_id IS DISTINCT FROM ${exclude.bookingId ?? null}::uuid)`;
  return rows.map((r) => ({ staffId: r.staff_id, start: r.s.getTime(), end: r.e.getTime() }));
}

/**
 * Claims the staff member and every resource unit for one interval: one occupancy row each, all
 * owned by the same booking or hold.
 */
export async function insertOccupancy(
  tx: Tx,
  row: {
    salonId: string;
    staffId: string;
    unitIds?: readonly string[];
    period: Interval;
    booking?: string;
    hold?: { id: string; expiresAt: Date };
  },
): Promise<void> {
  const kind = row.hold ? "hold" : "booking";
  const targets: { staffId: string | null; unitId: string | null }[] = [
    { staffId: row.staffId, unitId: null },
    ...(row.unitIds ?? []).map((unitId) => ({ staffId: null, unitId })),
  ];
  for (const t of targets) {
    await tx.$executeRaw`
      INSERT INTO booking_occupancy
        (id, salon_id, kind, booking_id, hold_id, staff_id, resource_unit_id, period, active, expires_at)
      VALUES (uuidv7(), ${row.salonId}::uuid, ${kind}::occupancy_kind, ${row.booking ?? null}::uuid,
        ${row.hold?.id ?? null}::uuid, ${t.staffId}::uuid, ${t.unitId}::uuid,
        tstzrange(${new Date(row.period.start)}, ${new Date(row.period.end)}, '[)'), true,
        ${row.hold?.expiresAt ?? null})`;
  }
}

/** Turns a hold's claim into the booking's claim in place (same range, no gap for others). */
export async function convertHold(tx: Tx, holdId: string, bookingId: string): Promise<number> {
  const updated = await tx.$executeRaw`
    UPDATE booking_occupancy
    SET kind = 'booking', booking_id = ${bookingId}::uuid, hold_id = NULL, expires_at = NULL
    WHERE hold_id = ${holdId}::uuid`;
  await tx.bookingHold.delete({ where: { id: holdId } });
  return updated;
}

/** Releases a booking's time (cancelled, no-show). */
export async function deactivateBookingOccupancy(tx: Tx, bookingId: string): Promise<void> {
  await tx.$executeRaw`UPDATE booking_occupancy SET active = false WHERE booking_id = ${bookingId}::uuid`;
}

/** Drops a booking's claims before re-inserting them at the new time (reschedule). */
export async function deleteBookingOccupancy(tx: Tx, bookingId: string): Promise<void> {
  await tx.$executeRaw`DELETE FROM booking_occupancy WHERE booking_id = ${bookingId}::uuid`;
}

/**
 * True when a write lost the race for a slot: exclusion violation (23P01) or, if a lock was ever
 * skipped, a deadlock (40P01). Searches the driver-adapter error chain for the SQLSTATE.
 */
export function isSlotConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (e: unknown, depth: number): boolean => {
    if (!e || typeof e !== "object" || seen.has(e) || depth > 6) return false;
    seen.add(e);
    const rec = e as Record<string, unknown>;
    for (const key of ["code", "originalCode", "sqlState"]) {
      const v = rec[key];
      if (v === "23P01" || v === "40P01") return true;
    }
    if (
      typeof rec["message"] === "string" &&
      /\b(23P01|40P01)\b|booking_occupancy_no_(staff|unit)_overlap/.test(rec["message"])
    ) {
      return true;
    }
    return ["cause", "meta", "error"].some((k) => visit(rec[k], depth + 1));
  };
  return visit(error, 0);
}
