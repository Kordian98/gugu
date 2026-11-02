import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Availability,
  BookingStatusValue,
  ClientSuggestion,
  CreateSalonBookingInput,
  OfflineSale,
  OfflineSaleInput,
  RescheduleInput,
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
};

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
      }).toString()
    : "";
  return useQuery({
    queryKey: [...key(salonId), "availability", q],
    queryFn: () => apiFetch<Availability>(`/salons/${salonId}/availability?${q}`),
    enabled: salonId !== "" && req !== null,
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

/** Localized booking service name ("Sơn gel · Tay"). */
export function serviceLabel(b: SalonBooking, locale: "vi" | "en"): string {
  const name = (locale === "en" && b.service.name.en) || b.service.name.vi;
  const variant = b.service.variantName
    ? (locale === "en" && b.service.variantName.en) || b.service.variantName.vi
    : null;
  return variant ? `${name} · ${variant}` : name;
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
  labels: { walkIn: string; timeOff: string },
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const b of bookings) {
    const status = bookingStatusUi(b.status);
    if (!status) continue;
    items.push({
      kind: "booking",
      id: b.id,
      staffId: b.staffId,
      start: new Date(b.startsAt),
      end: new Date(b.endsAt),
      status,
      service: serviceLabel(b, locale),
      customer: b.customer?.name ?? labels.walkIn,
    });
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
