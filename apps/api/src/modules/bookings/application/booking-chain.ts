import { Injectable } from "@nestjs/common";
import { BOOKING_ERRORS, type NextService } from "@gugu/contracts";
import type { SlotOption } from "@gugu/domain";
import { AppError } from "../../../common/problem/app-error";
import { AppConfig } from "../../../infrastructure/config/app-config";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import {
  type ChainLineInput,
  type ResolvedSelection,
  resolveSelection,
  type ServiceSelection,
} from "../infra/booking-inputs";

/**
 * Multi-service appointments (M6.8, spec 06 G12): helpers shared by the read and write paths to
 * turn "first service + nextServices" into engine lines. A single service is a chain of one, so
 * every path goes through here.
 */

type Db = Prisma.TransactionClient;

/** One requested line: the service and who should do it (null = any staff). */
export interface LineRequest extends ServiceSelection {
  staffId: string | null;
}

/** First service (legacy top-level fields) + further services → ordered line requests. */
export function lineRequests(
  first: {
    serviceId: string;
    variantId?: string | null | undefined;
    addOnIds: readonly string[];
    staffId?: string | null | undefined;
  },
  next: readonly NextService[] | undefined,
): LineRequest[] {
  return [first, ...(next ?? [])].map((l) => ({
    serviceId: l.serviceId,
    variantId: l.variantId ?? null,
    addOnIds: l.addOnIds,
    staffId: l.staffId ?? null,
  }));
}

/** Validates and resolves every line (one catalog lookup per line, ≤ 4). */
export async function resolveChain(
  db: Db,
  salonId: string,
  lines: readonly LineRequest[],
): Promise<ResolvedSelection[]> {
  const out: ResolvedSelection[] = [];
  for (const line of lines) out.push(await resolveSelection(db, salonId, line));
  return out;
}

/** Read paths: the requested staff member if assigned to the line, else everyone assigned. */
export function readCandidates(selection: ResolvedSelection, requested: string | null): string[] {
  if (requested === null) return [...selection.staffTerms.keys()];
  return selection.staffTerms.has(requested) ? [requested] : [];
}

export function chainInput(
  selections: readonly ResolvedSelection[],
  candidates: readonly (readonly string[])[],
): ChainLineInput[] {
  return selections.map((selection, i) => ({ selection, staffIds: candidates[i] ?? [] }));
}

/** Reads: bookings where `staffId` does any service of the chain (M6.8). Never for writes. */
export const staffOnBooking = (staffId: string): Prisma.BookingWhereInput => ({
  OR: [{ staffId }, { services: { some: { staffId } } }],
});

/**
 * Own-calendar writes: `staffId` does every line (first-line staff and all booking_services).
 * Reads use the wider `staffOnBooking`.
 */
export const ownsEveryLine = (staffId: string): Prisma.BookingWhereInput => ({
  staffId,
  services: { every: { staffId } },
});

/** API view of the engine's plan for a slot (one entry per line). */
export function slotLines(
  option: SlotOption,
  selections: readonly ResolvedSelection[],
  hideStaff: boolean,
): { serviceId: string; startsAt: string; endsAt: string; staffId: string | null }[] {
  return option.lines.map((l, i) => ({
    serviceId: selections[i]?.serviceId ?? "",
    startsAt: new Date(l.start).toISOString(),
    endsAt: new Date(l.end).toISOString(),
    staffId: hideStaff ? null : l.staffId,
  }));
}

/** Σ service lengths (add-ons included), without gaps between lines. */
export const chainDuration = (selections: readonly ResolvedSelection[]): number =>
  selections.reduce((sum, s) => sum + s.terms.durationMinutes, 0);

/**
 * Feature flag `booking.multiService` (spec 06 G12). On for every salon (q91, supersedes q17);
 * `BOOKING_MULTI_SERVICE=false` switches it off. Topic 12's flag service replaces this when it
 * exists.
 */
@Injectable()
export class BookingFeatures {
  constructor(private readonly config: AppConfig) {}

  get multiService(): boolean {
    return this.config.env.BOOKING_MULTI_SERVICE;
  }

  /** 422 `booking.multi_service_disabled` for chains while the flag is off. */
  assertChainAllowed(lines: readonly unknown[]): void {
    if (lines.length > 1 && !this.multiService) {
      throw new AppError(422, BOOKING_ERRORS.multiServiceDisabled, "One service per appointment", {
        errors: [{ path: "nextServices", code: BOOKING_ERRORS.multiServiceDisabled }],
      });
    }
  }
}
