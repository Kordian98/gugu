import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Availability,
  BookingFeatureSet,
  BookingStatusValue,
  ClientSuggestion,
  CreateSalonBookingInput,
  EarliestSlots,
  NextService,
  OfflineSale,
  OfflineSaleInput,
  RescheduleInput,
  RuleOverride,
  SalonBooking,
  StaffMember,
  TransitionInput,
} from "@gugu/contracts";

import { ApiError, apiFetch } from "@/services/auth/api";

import { addDays, clockMinutes, instantAt, isoWeekday } from "./dates";
import { useOptionalSalon, useSalon } from "./SalonContext";
import type { BookingStatus, TimelineItem } from "./types";

const key = (salonId: string) => ["salon", salonId, "bookings"] as const;

/** One key per user attempt; retries of the same request replay (topic 06 idempotency). */
const idempotencyKey = () => `crm-${String(Date.now())}-${Math.random().toString(36).slice(2, 12)}`;

/** Engine status → timeline colour group; cancelled bookings leave the grid. */
export function bookingStatusUi(s: BookingStatusValue): BookingStatus | null {
  switch (s) {
    case "pending":
      return "pending";
    case "confirmed":
      return "confirmed";
    case "checked_in":
      return "inProgress";
    case "completed":
      return "completed";
    case "no_show":
      return "noShow";
    default:
      return null;
  }
}

export const isActive = (s: BookingStatusValue) =>
  s === "pending" || s === "confirmed" || s === "checked_in";

export function useBookings(from: string, to: string = from) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: [...key(salonId), from, to],
    queryFn: () =>
      apiFetch<{ items: SalonBooking[] }>(`/salons/${salonId}/bookings?from=${from}&to=${to}`),
    enabled: salonId !== "",
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export type AvailabilityRequest = {
  serviceId: string;
  variantId: string | null;
  addOnIds: string[];
  staffId: string | null;
  date: string;
  /** Inclusive end date (≤ 31 days); defaults to `date`. */
  to?: string | undefined;
  /** Further services in sequence (06 M6.8); empty = single service. */
  nextServices?: NextService[] | undefined;
};

/** `nextServices` query param (JSON array), omitted for a single service. */
const chainParam = (next: NextService[] | undefined): Record<string, string> =>
  next?.length ? { nextServices: JSON.stringify(next) } : {};

/** Booking engine switches for this salon (e.g. several services per appointment). */
export function useBookingFeatures() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: ["salon", salonId, "booking-features"],
    queryFn: () => apiFetch<BookingFeatureSet>(`/salons/${salonId}/booking-features`),
    enabled: salonId !== "",
    staleTime: 5 * 60_000,
  });
}

export function useAvailability(req: AvailabilityRequest | null) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  const q = req
    ? new URLSearchParams({
        serviceId: req.serviceId,
        from: req.date,
        to: req.to ?? req.date,
        ...(req.variantId ? { variantId: req.variantId } : {}),
        ...(req.staffId ? { staffId: req.staffId } : {}),
        ...(req.addOnIds.length ? { addOnIds: req.addOnIds.join(",") } : {}),
        ...chainParam(req.nextServices),
      }).toString()
    : "";
  return useQuery({
    queryKey: [...key(salonId), "availability", q],
    queryFn: () => apiFetch<Availability>(`/salons/${salonId}/availability?${q}`),
    enabled: salonId !== "" && req !== null,
  });
}

/** "Find the earliest slot": first free options across the booking window (server-side search). */
export function useEarliestSlots(
  req: Omit<AvailabilityRequest, "date" | "to"> | null,
  enabled: boolean,
) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  const q = req
    ? new URLSearchParams({
        serviceId: req.serviceId,
        limit: "6",
        perDay: "3",
        ...(req.variantId ? { variantId: req.variantId } : {}),
        ...(req.staffId ? { staffId: req.staffId } : {}),
        ...(req.addOnIds.length ? { addOnIds: req.addOnIds.join(",") } : {}),
        ...chainParam(req.nextServices),
      }).toString()
    : "";
  return useQuery({
    queryKey: [...key(salonId), "availability", "earliest", q],
    queryFn: () => apiFetch<EarliestSlots>(`/salons/${salonId}/availability/earliest?${q}`),
    enabled: enabled && salonId !== "" && req !== null,
  });
}

export function useClientLookup(q: string, enabled = true) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: ["salon", salonId, "clients", q],
    queryFn: () =>
      apiFetch<{ items: ClientSuggestion[] }>(
        `/salons/${salonId}/clients/lookup?q=${encodeURIComponent(q)}`,
      ),
    enabled: enabled && salonId !== "",
    placeholderData: keepPreviousData,
  });
}

export function useOfflineSale(bookingId: string | null) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: [...key(salonId), "sale", bookingId],
    queryFn: async () => {
      try {
        return await apiFetch<OfflineSale>(
          `/salons/${salonId}/bookings/${bookingId ?? ""}/offline-sale`,
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: salonId !== "" && bookingId !== null,
  });
}

function useBookingMutation<TVars, TResult>(
  request: (salonId: string, vars: TVars, idem: string) => Promise<TResult>,
) {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => request(salonId, vars, idempotencyKey()),
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: key(salonId) }),
        qc.invalidateQueries({ queryKey: ["salon", salonId, "clients"] }),
      ]);
    },
  });
}

/**
 * 409 booking.override_required (06): the rules this time breaks (after hours, short notice, beyond
 * the window). Retry with these `overrides` + a reason; the API audits it. Null for other errors.
 */
export function requiredOverrides(e: unknown): RuleOverride[] | null {
  if (!(e instanceof ApiError) || e.code !== "booking.override_required") return null;
  const codes = (e.problem?.errors ?? []).filter((x) => x.path === "overrides").map((x) => x.code);
  return codes.filter(
    (c): c is RuleOverride => c === "hours" || c === "lead_time" || c === "horizon",
  );
}

export const useCreateBooking = () =>
  useBookingMutation((s, body: CreateSalonBookingInput, idem) =>
    apiFetch<SalonBooking>(`/salons/${s}/bookings`, {
      method: "POST",
      body,
      headers: { "idempotency-key": idem },
    }),
  );

export const useTransition = () =>
  useBookingMutation((s, v: { id: string; body: TransitionInput }, idem) =>
    apiFetch<SalonBooking>(`/salons/${s}/bookings/${v.id}/transitions`, {
      method: "POST",
      body: v.body,
      headers: { "idempotency-key": idem },
    }),
  );

export const useReschedule = () =>
  useBookingMutation(
    (s, v: { id: string; body: Partial<RescheduleInput> & { startsAt: string } }, idem) =>
      apiFetch<SalonBooking>(`/salons/${s}/bookings/${v.id}/reschedule`, {
        method: "POST",
        body: v.body,
        headers: { "idempotency-key": idem },
      }),
  );

export const useRecordSale = () =>
  useBookingMutation((s, v: { id: string; body: OfflineSaleInput }) =>
    apiFetch<OfflineSale>(`/salons/${s}/bookings/${v.id}/offline-sale`, {
      method: "PUT",
      body: v.body,
    }),
  );

/** Client label: the name, "Walk-in", or "Deleted customer" after an account deletion (q71). */
export function customerLabel(
  b: Pick<SalonBooking, "customer" | "customerAnonymised">,
  labels: { walkIn: string; deleted: string },
): string {
  if (b.customerAnonymised) return labels.deleted;
  return b.customer?.name ?? labels.walkIn;
}

type BookedService = Pick<SalonBooking["service"], "name" | "variantName">;

/** Localized name of one booked service ("Sơn gel · Tay"). */
export function lineLabel(l: BookedService, locale: "vi" | "en"): string {
  const name = (locale === "en" && l.name.en) || l.name.vi;
  const variant = l.variantName ? (locale === "en" && l.variantName.en) || l.variantName.vi : null;
  return variant ? `${name} · ${variant}` : name;
}

/** Every service of the booking ("Sơn gel · Tay + Pedicure", 06 M6.8). */
export function serviceLabel(b: SalonBooking, locale: "vi" | "en"): string {
  const lines = b.services.length > 0 ? b.services : [b.service];
  return lines.map((l) => lineLabel(l, locale)).join(" + ");
}

/**
 * Timeline items for one salon-local day: active and finished bookings, weekly breaks and time
 * off of each staff member. Cancelled bookings are not drawn.
 */
export function dayTimeline(
  bookings: SalonBooking[],
  team: StaffMember[],
  date: string,
  tz: string,
  locale: "vi" | "en",
  labels: { walkIn: string; timeOff: string; deleted: string },
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const b of bookings) {
    const status = bookingStatusUi(b.status);
    if (!status) continue;
    const customer = customerLabel(b, labels);
    if (b.services.length <= 1) {
      items.push({
        kind: "booking",
        id: b.id,
        staffId: b.staffId,
        start: new Date(b.startsAt),
        end: new Date(b.endsAt),
        status,
        service: serviceLabel(b, locale),
        customer,
      });
      continue;
    }
    // Multi-service (06 M6.8): one block per service in that staff member's column; consecutive
    // services of the same person merge into one block. All open the same booking.
    const blocks: { staffId: string; start: string; end: string; names: string[] }[] = [];
    for (const l of b.services) {
      const prev = blocks.at(-1);
      if (prev && prev.staffId === l.staffId) {
        prev.end = l.endsAt;
        prev.names.push(lineLabel(l, locale));
      } else {
        blocks.push({
          staffId: l.staffId,
          start: l.startsAt,
          end: l.endsAt,
          names: [lineLabel(l, locale)],
        });
      }
    }
    for (const [i, blk] of blocks.entries()) {
      items.push({
        kind: "booking",
        id: i === 0 ? b.id : `${b.id}#${String(i)}`,
        bookingId: b.id,
        staffId: blk.staffId,
        start: new Date(blk.start),
        end: new Date(blk.end),
        status,
        service: blk.names.join(" + "),
        customer,
        chain: { index: i + 1, count: blocks.length },
      });
    }
  }
  const weekday = isoWeekday(date);
  const dayStart = Date.parse(instantAt(date, 0, tz));
  const dayEnd = Date.parse(instantAt(addDays(date, 1), 0, tz));
  for (const s of team) {
    const day = s.schedule.days.find((d) => d.weekday === weekday);
    for (const [i, br] of (day?.breaks ?? []).entries()) {
      items.push({
        kind: "break",
        id: `${s.id}-break-${String(i)}`,
        staffId: s.id,
        start: new Date(instantAt(date, clockMinutes(br.start), tz)),
        end: new Date(instantAt(date, clockMinutes(br.end), tz)),
      });
    }
    for (const off of s.timeOff) {
      const a = Math.max(Date.parse(off.startsAt), dayStart);
      const z = Math.min(Date.parse(off.endsAt), dayEnd);
      if (a < z)
        items.push({
          kind: "break",
          id: `${off.id}-${date}`,
          staffId: s.id,
          start: new Date(a),
          end: new Date(z),
          label: labels.timeOff,
        });
    }
  }
  return items;
}

/** Visible hour range for a day: opening hours ∪ staff hours ∪ bookings, padded to whole hours. */
export function hourRange(
  openingIntervals: { start: string; end: string }[],
  team: StaffMember[],
  bookings: SalonBooking[],
  date: string,
  _tz: string,
  minutesOf: (iso: string) => number,
): { startHour: number; endHour: number } {
  const weekday = isoWeekday(date);
  const mins: number[] = [];
  for (const i of openingIntervals) mins.push(clockMinutes(i.start), clockMinutes(i.end));
  for (const s of team)
    for (const i of s.schedule.days.find((d) => d.weekday === weekday)?.intervals ?? [])
      mins.push(clockMinutes(i.start), clockMinutes(i.end));
  for (const b of bookings)
    if (bookingStatusUi(b.status)) mins.push(minutesOf(b.startsAt), minutesOf(b.endsAt));
  if (!mins.length) return { startHour: 9, endHour: 18 };
  return {
    startHour: Math.max(0, Math.floor(Math.min(...mins) / 60)),
    endHour: Math.min(24, Math.ceil(Math.max(...mins) / 60)),
  };
}

/**
 * Columns for a member who may not read the team (`members.read`, staff role): the API returns
 * only bookings they work on (own scope, 05), so their own staff profile is the one present in
 * every booking. One column labelled with their own name; other people's lines of a shared
 * multi-service booking stay hidden (not theirs). With no bookings there is no column (empty state).
 */
export function ownScopeColumns(bookings: SalonBooking[], label: string): StaffMember[] {
  const sets = bookings
    .filter((b) => !b.status.startsWith("cancelled"))
    .map((b) => new Set([b.staffId, ...b.services.map((l) => l.staffId)]));
  const [first, ...rest] = sets;
  if (!first) return [];
  const common = [...first].filter((id) => rest.every((s) => s.has(id))).sort();
  const ids = common.length ? [common[0] as string] : [...new Set(sets.flatMap((s) => [...s]))];
  return ids.map((id, i) => ({
    id,
    displayName: label,
    color: "lilac",
    isBookable: true,
    sortOrder: i,
    serviceIds: [],
    member: null,
    pendingInvitation: null,
    schedule: { days: [] },
    timeOff: [],
  }));
}
