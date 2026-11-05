import {
  type AvailabilityInput,
  addDays,
  dayBounds,
  type LocalDate,
  resolveServiceTerms,
  type RuleOverride,
  type ServiceTerms,
  type StaffAvailability,
} from "@gugu/domain";
import { BOOKING_ERRORS } from "@gugu/contracts";
import { AppError } from "../../../common/problem/app-error";
import type { Prisma } from "../../../infrastructure/prisma/generated/client";
import { loadBusy, loadUnitBusy } from "./occupancy";

/**
 * Loads what the pure engine needs (packages/domain/src/booking) in a handful of batched queries
 * (no N+1): salon + settings, hours, holidays, eligible staff with schedules/breaks/time off, and
 * occupancy. Catalog and team tables are owned by topic 07; the engine only reads them.
 */

type Db = Prisma.TransactionClient;

/** salon_settings defaults (row is created lazily by topic 07; missing row = defaults). */
export interface BookingSettings {
  bookingWindowDays: number;
  minLeadTimeMinutes: number;
  cancellationCutoffMinutes: number;
  rescheduleCutoffMinutes: number;
  confirmationMode: "auto" | "manual";
  manualConfirmWindowHours: number;
  confirmNewClients: boolean;
  hideStaffChoice: boolean;
  maxActiveBookingsPerPhone: number;
  slotGranularityMinutes: number;
  holdTtlMinutes: number;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  bookingWindowDays: 60,
  minLeadTimeMinutes: 60,
  cancellationCutoffMinutes: 120,
  rescheduleCutoffMinutes: 120,
  confirmationMode: "auto",
  manualConfirmWindowHours: 12,
  confirmNewClients: false,
  hideStaffChoice: false,
  maxActiveBookingsPerPhone: 3,
  slotGranularityMinutes: 15,
  holdTtlMinutes: 7,
};

export interface SalonBookingContext {
  salonId: string;
  name: string;
  slug: string;
  timeZone: string;
  currency: string;
  /** Public booking pages only serve `active` salons. */
  isLive: boolean;
  /** `salon_settings.availability_version` (cache key part, M6.7). */
  availabilityVersion: number;
  settings: BookingSettings;
}

export interface LocalizedName {
  vi: string;
  en: string;
}

export interface ServiceSelection {
  serviceId?: string | null | undefined;
  variantId: string | null;
  addOnIds: readonly string[];
  /** CRM effective full duration, including selected add-ons. */
  durationMinutes?: number | undefined;
  customService?: { name: string; priceMinor: number } | undefined;
}

export interface ResolvedSelection extends ServiceSelection {
  serviceId: string | null;
  name: LocalizedName;
  variantName: LocalizedName | null;
  currency: string;
  /** Terms without staff overrides (display). */
  terms: ServiceTerms;
  addOns: {
    id: string;
    name: LocalizedName;
    extraDurationMinutes: number;
    extraPriceMinor: number;
    extraPriceMaxMinor: number | null;
  }[];
  /** Per eligible staff member: terms with that member's override applied. */
  staffTerms: Map<string, ServiceTerms>;
  staffSortOrder: Map<string, number>;
  /** Resource types the service needs (M6.6). */
  requirements: { resourceTypeId: string; quantity: number }[];
  /** Active units of those types (lock targets and availability input). */
  units: { unitId: string; resourceTypeId: string; sortOrder: number }[];
}

const num = (v: bigint | null): number | null => (v === null ? null : Number(v));

const asName = (v: Prisma.JsonValue | null): LocalizedName => {
  const o = (v ?? {}) as Partial<LocalizedName>;
  return { vi: o.vi ?? o.en ?? "", en: o.en ?? o.vi ?? "" };
};

/** `time(0)` columns arrive as 1970-01-01 UTC dates. End boundaries map 00:00 to 1440. */
const minuteOf = (d: Date, edge: "start" | "end"): number => {
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return edge === "end" && m === 0 ? 1440 : m;
};
const dateOf = (d: Date): LocalDate => d.toISOString().slice(0, 10);

export async function loadSalonContext(
  db: Db,
  where: { id: string } | { slug: string },
): Promise<SalonBookingContext | null> {
  const salon = await db.salon.findFirst({
    where: { ...where, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      currency: true,
      status: true,
      settings: true,
    },
  });
  if (!salon) return null;
  const s = salon.settings;
  return {
    salonId: salon.id,
    name: salon.name,
    slug: salon.slug,
    timeZone: salon.timezone,
    currency: salon.currency,
    isLive: salon.status === "active",
    availabilityVersion: s?.availabilityVersion ?? 0,
    settings: s
      ? {
          bookingWindowDays: s.bookingWindowDays,
          minLeadTimeMinutes: s.minLeadTimeMinutes,
          cancellationCutoffMinutes: s.cancellationCutoffMinutes,
          rescheduleCutoffMinutes: s.rescheduleCutoffMinutes,
          confirmationMode: s.confirmationMode,
          manualConfirmWindowHours: s.manualConfirmWindowHours,
          confirmNewClients: s.confirmNewClients,
          hideStaffChoice: s.hideStaffChoice,
          maxActiveBookingsPerPhone: s.maxActiveBookingsPerPhone,
          slotGranularityMinutes: s.slotGranularityMinutes,
          holdTtlMinutes: s.holdTtlMinutes,
        }
      : DEFAULT_BOOKING_SETTINGS,
  };
}

const unavailable = () =>
  new AppError(422, BOOKING_ERRORS.serviceUnavailable, "Service not bookable", {
    errors: [{ path: "serviceId", code: BOOKING_ERRORS.serviceUnavailable }],
  });

/**
 * Validates the service/variant/add-ons (active, not deleted, same salon, add-ons of this service)
 * and resolves terms for every bookable staff member assigned to it.
 */
export async function resolveSelection(
  db: Db,
  salonId: string,
  selection: ServiceSelection,
): Promise<ResolvedSelection> {
  if (selection.customService) return resolveCustomSelection(db, salonId, selection);
  if (!selection.serviceId) throw unavailable();
  const addOnIds = [...new Set(selection.addOnIds)];
  const service = await db.service.findFirst({
    where: { id: selection.serviceId, salonId, isActive: true, deletedAt: null },
    include: {
      variants: { where: { isActive: true, deletedAt: null } },
      resourceRequirements: { where: { type: { deletedAt: null } } },
      addOns: { where: { id: { in: addOnIds }, isActive: true, deletedAt: null } },
      staff: {
        where: {
          OR: selection.variantId
            ? [{ variantId: null }, { variantId: selection.variantId }]
            : [{ variantId: null }],
          staff: { isBookable: true, deletedAt: null },
        },
        include: { staff: { select: { sortOrder: true } } },
      },
    },
  });
  if (!service) throw unavailable();
  const variant = selection.variantId
    ? service.variants.find((v) => v.id === selection.variantId)
    : null;
  if (selection.variantId && !variant) throw unavailable();
  if (service.addOns.length !== addOnIds.length) throw unavailable();

  const serviceSource = {
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    priceMinor: Number(service.priceAmountMinor),
    priceMaxMinor: num(service.priceMaxAmountMinor),
  };
  const variantSource = variant
    ? {
        durationMinutes: variant.durationMinutes,
        priceMinor: num(variant.priceAmountMinor),
        priceMaxMinor: num(variant.priceMaxAmountMinor),
      }
    : null;
  const addOns = service.addOns.map((a) => ({
    id: a.id,
    name: asName(a.name),
    extraDurationMinutes: a.extraDurationMinutes,
    extraPriceMinor: Number(a.extraPriceAmountMinor),
    extraPriceMaxMinor: num(a.extraPriceMaxAmountMinor),
  }));

  // A variant-specific assignment wins over the service-wide one for the same staff member.
  const assignment = new Map<string, (typeof service.staff)[number]>();
  for (const row of service.staff) {
    const prev = assignment.get(row.staffId);
    if (!prev || (prev.variantId === null && row.variantId !== null))
      assignment.set(row.staffId, row);
  }
  const staffTerms = new Map<string, ServiceTerms>();
  const staffSortOrder = new Map<string, number>();
  for (const [staffId, row] of assignment) {
    staffTerms.set(
      staffId,
      appointmentTerms(
        resolveServiceTerms({
          service: serviceSource,
          variant: variantSource,
          staffOverride: {
            durationMinutes: row.durationOverrideMinutes,
            priceMinor: num(row.priceOverrideMinor),
          },
          addOns,
        }),
        selection.durationMinutes,
      ),
    );
    staffSortOrder.set(staffId, row.staff.sortOrder);
  }

  return {
    serviceId: service.id,
    variantId: variant?.id ?? null,
    addOnIds: addOns.map((a) => a.id),
    name: asName(service.name),
    variantName: variant ? asName(variant.name) : null,
    currency: service.currency,
    terms: appointmentTerms(
      resolveServiceTerms({ service: serviceSource, variant: variantSource, addOns }),
      selection.durationMinutes,
    ),
    addOns,
    staffTerms,
    staffSortOrder,
    requirements: service.resourceRequirements.map((r) => ({
      resourceTypeId: r.resourceTypeId,
      quantity: r.quantity,
    })),
    units: await loadUnits(
      db,
      salonId,
      service.resourceRequirements.map((r) => r.resourceTypeId),
    ),
  };
}

/** The calendar selection overrides the full effective service duration, never its buffers. */
function appointmentTerms(terms: ServiceTerms, durationMinutes?: number): ServiceTerms {
  return durationMinutes === undefined ? terms : { ...terms, durationMinutes };
}

/** Ad hoc services have no catalog FK and use the salon's active bookable team. */
async function resolveCustomSelection(
  db: Db,
  salonId: string,
  selection: ServiceSelection,
): Promise<ResolvedSelection> {
  const custom = selection.customService;
  if (
    !custom ||
    !selection.durationMinutes ||
    selection.serviceId ||
    selection.variantId ||
    selection.addOnIds.length
  )
    throw unavailable();
  const [salon, staff] = await Promise.all([
    db.salon.findFirst({ where: { id: salonId, deletedAt: null }, select: { currency: true } }),
    db.staffProfile.findMany({
      where: { salonId, isBookable: true, deletedAt: null },
      select: { id: true, sortOrder: true },
    }),
  ]);
  if (!salon) throw unavailable();
  const terms: ServiceTerms = {
    baseDurationMinutes: selection.durationMinutes,
    basePriceMinor: custom.priceMinor,
    basePriceMaxMinor: null,
    durationMinutes: selection.durationMinutes,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    priceMinor: custom.priceMinor,
    priceMaxMinor: null,
  };
  return {
    serviceId: null,
    variantId: null,
    addOnIds: [],
    name: { vi: custom.name, en: custom.name },
    variantName: null,
    currency: salon.currency,
    terms,
    addOns: [],
    staffTerms: new Map(staff.map((s) => [s.id, terms])),
    staffSortOrder: new Map(staff.map((s) => [s.id, s.sortOrder])),
    requirements: [],
    units: [],
  };
}

/** Active units of active, non-deleted resources of these types, in fill order. */
async function loadUnits(
  db: Db,
  salonId: string,
  resourceTypeIds: readonly string[],
): Promise<ResolvedSelection["units"]> {
  if (resourceTypeIds.length === 0) return [];
  const units = await db.resourceUnit.findMany({
    where: {
      salonId,
      isActive: true,
      resource: {
        isActive: true,
        deletedAt: null,
        resourceTypeId: { in: [...resourceTypeIds] },
        type: { deletedAt: null },
      },
    },
    select: {
      id: true,
      position: true,
      resource: { select: { resourceTypeId: true, sortOrder: true } },
    },
  });
  return units.map((u) => ({
    unitId: u.id,
    resourceTypeId: u.resource.resourceTypeId,
    // Resource order first, then unit number (units of one resource stay together).
    sortOrder: u.resource.sortOrder * 1_000 + u.position,
  }));
}

/** One line of a chain as the loader sees it: the resolved service and who may do it. */
export interface ChainLineInput {
  selection: ResolvedSelection;
  /** Candidate staff for this line (already filtered by request, scope and assignment). */
  staffIds: readonly string[];
}

export interface AvailabilityArgs {
  from: LocalDate;
  to: LocalDate;
  now: Date;
  overrides?: ReadonlySet<RuleOverride>;
  exclude?: { holdId?: string | null; bookingId?: string | null };
}

/** Builds the engine input for dates `[from, to]` and the given staff members (one service). */
export async function loadAvailabilityInput(
  db: Db,
  ctx: SalonBookingContext,
  selection: ResolvedSelection,
  args: AvailabilityArgs & { staffIds: readonly string[] },
): Promise<AvailabilityInput> {
  return loadChainInput(db, ctx, [{ selection, staffIds: args.staffIds }], args);
}

/**
 * Engine input for a chain of services (M6.8; a single service is a chain of one): the union of
 * every line's staff and resource units is loaded once, in the same batched queries.
 */
export async function loadChainInput(
  db: Db,
  ctx: SalonBookingContext,
  chain: readonly ChainLineInput[],
  args: AvailabilityArgs,
): Promise<AvailabilityInput> {
  const { salonId, timeZone } = ctx;
  const window = {
    start: dayBounds(addDays(args.from, -1), timeZone).start,
    end: dayBounds(addDays(args.to, 1), timeZone).end,
  };
  const staffIds = [...new Set(chain.flatMap((l) => l.staffIds))];
  const sortOrder = new Map<string, number>();
  for (const l of chain) {
    for (const [id, order] of l.selection.staffSortOrder) sortOrder.set(id, order);
  }
  const poolById = new Map<string, ResolvedSelection["units"][number]>();
  for (const l of chain) for (const u of l.selection.units) poolById.set(u.unitId, u);
  const pool = [...poolById.values()];
  const unitIds = pool.map((u) => u.unitId);
  const [hours, holidays, schedules, breaks, timeOff, busy, unitBusy] = await Promise.all([
    db.salonOpeningHours.findMany({ where: { salonId } }),
    db.salonHoliday.findMany({
      where: {
        salonId,
        startDate: { lte: new Date(`${args.to}T00:00:00Z`) },
        endDate: { gte: new Date(`${args.from}T00:00:00Z`) },
      },
    }),
    db.staffSchedule.findMany({ where: { salonId, staffId: { in: staffIds } } }),
    db.staffBreak.findMany({ where: { salonId, staffId: { in: staffIds } } }),
    db.staffTimeOff.findMany({
      where: {
        salonId,
        staffId: { in: staffIds },
        startsAt: { lt: new Date(window.end) },
        endsAt: { gt: new Date(window.start) },
      },
    }),
    loadBusy(db, salonId, staffIds, window, args.now, args.exclude),
    loadUnitBusy(db, salonId, unitIds, window, args.now, args.exclude),
  ]);

  const staff: StaffAvailability[] = staffIds.map((staffId) => ({
    staffId,
    sortOrder: sortOrder.get(staffId) ?? 0,
    schedules: schedules
      .filter((s) => s.staffId === staffId)
      .map((s) => ({
        weekday: s.weekday,
        startMinute: minuteOf(s.startsAt, "start"),
        endMinute: minuteOf(s.endsAt, "end"),
        effectiveFrom: dateOf(s.effectiveFrom),
        effectiveTo: s.effectiveTo ? dateOf(s.effectiveTo) : null,
      })),
    breaks: breaks
      .filter((b) => b.staffId === staffId)
      .map((b) => ({
        weekday: b.weekday,
        date: b.date ? dateOf(b.date) : null,
        startMinute: minuteOf(b.startsAt, "start"),
        endMinute: minuteOf(b.endsAt, "end"),
      })),
    timeOff: timeOff
      .filter((t) => t.staffId === staffId)
      .map((t) => ({ start: t.startsAt.getTime(), end: t.endsAt.getTime() })),
    busy: busy.filter((b) => b.staffId === staffId).map((b) => ({ start: b.start, end: b.end })),
  }));

  return {
    timeZone,
    now: args.now.getTime(),
    from: args.from,
    to: args.to,
    rules: {
      slotGranularityMinutes: ctx.settings.slotGranularityMinutes,
      minLeadMinutes: ctx.settings.minLeadTimeMinutes,
      bookingWindowDays: ctx.settings.bookingWindowDays,
    },
    openingHours: hours.map((h) => ({
      weekday: h.weekday,
      startMinute: minuteOf(h.opensAt, "start"),
      endMinute: minuteOf(h.closesAt, "end"),
    })),
    holidays: holidays.map((h) => ({
      startDate: dateOf(h.startDate),
      endDate: dateOf(h.endDate),
      closed: h.closed,
      hours:
        h.opensAt && h.closesAt
          ? { startMinute: minuteOf(h.opensAt, "start"), endMinute: minuteOf(h.closesAt, "end") }
          : null,
    })),
    staff,
    lines: chain.map((l) => ({
      staffTerms: new Map(
        l.staffIds.flatMap((id) => {
          const terms = l.selection.staffTerms.get(id);
          return terms ? [[id, terms] as const] : [];
        }),
      ),
      requirements: l.selection.requirements,
    })),
    resources: {
      requirements: chain[0]?.selection.requirements ?? [],
      units: pool.map((u) => ({
        ...u,
        busy: unitBusy
          .filter((b) => b.unitId === u.unitId)
          .map((b) => ({ start: b.start, end: b.end })),
      })),
    },
    ...(args.overrides ? { overrides: args.overrides } : {}),
  };
}
