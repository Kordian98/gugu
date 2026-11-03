import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  BookingMessages,
  Inbox,
  MemberNotificationPrefs,
  NotificationSettings,
  NotificationSettingsInput,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";
import { useOptionalSalon } from "@/features/salon-crm/data/SalonContext";

/** Notification data for the salon panel (topic 11). Keys include the salon id (no cross-tenant cache). */
const keys = {
  all: (s: string) => ["salon", s, "notifications"] as const,
  settings: (s: string) => ["salon", s, "notifications", "settings"] as const,
  inbox: (s: string) => ["salon", s, "notifications", "inbox"] as const,
  prefs: (s: string) => ["salon", s, "notifications", "prefs"] as const,
  messages: (s: string, b: string) => ["salon", s, "notifications", "messages", b] as const,
};

/** Bell refresh; staff should notice a cancellation within a minute without a reload. */
const INBOX_POLL_MS = 30_000;

/** Notification events use dots (`booking.confirmed`); translation keys use `_`. */
export const eventKey = (event: string) => event.replace(/\./g, "_");

const useSalonId = () => useOptionalSalon()?.salonId ?? "";

export function useNotificationSettings() {
  const salonId = useSalonId();
  return useQuery({
    queryKey: keys.settings(salonId),
    queryFn: () => apiFetch<NotificationSettings>(`/salons/${salonId}/notifications/settings`),
    enabled: salonId !== "",
  });
}

export function useSaveNotificationSettings() {
  const salonId = useSalonId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationSettingsInput) =>
      apiFetch<NotificationSettings>(`/salons/${salonId}/notifications/settings`, {
        method: "PUT",
        body,
      }),
    onSuccess: (data) => {
      qc.setQueryData(keys.settings(salonId), data);
    },
  });
}

export function useBookingMessages(bookingId: string) {
  const salonId = useSalonId();
  return useQuery({
    queryKey: keys.messages(salonId, bookingId),
    queryFn: () => apiFetch<BookingMessages>(`/salons/${salonId}/bookings/${bookingId}/messages`),
    enabled: salonId !== "",
    // Sends happen in the worker right after a change: refresh while the drawer is open.
    refetchInterval: 15_000,
  });
}

export function useInbox() {
  const salonId = useSalonId();
  return useQuery({
    queryKey: keys.inbox(salonId),
    queryFn: () => apiFetch<Inbox>(`/salons/${salonId}/notifications/inbox?limit=20`),
    enabled: salonId !== "",
    refetchInterval: INBOX_POLL_MS,
  });
}

export function useMarkRead() {
  const salonId = useSalonId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      apiFetch(`/salons/${salonId}/notifications/inbox/read`, {
        method: "POST",
        body: ids ? { ids } : {},
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.inbox(salonId) });
    },
  });
}

export function useMyNotificationPrefs() {
  const salonId = useSalonId();
  return useQuery({
    queryKey: keys.prefs(salonId),
    queryFn: () => apiFetch<MemberNotificationPrefs>(`/salons/${salonId}/notifications/me`),
    enabled: salonId !== "",
  });
}

export function useSaveMyNotificationPrefs() {
  const salonId = useSalonId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MemberNotificationPrefs) =>
      apiFetch<MemberNotificationPrefs>(`/salons/${salonId}/notifications/me`, {
        method: "PUT",
        body,
      }),
    onSuccess: (data) => {
      qc.setQueryData(keys.prefs(salonId), data);
    },
  });
}

/** Invalidate a booking's timeline after an action in the drawer (sends follow shortly). */
export function useInvalidateBookingMessages() {
  const salonId = useSalonId();
  const qc = useQueryClient();
  return (bookingId: string) =>
    qc.invalidateQueries({ queryKey: keys.messages(salonId, bookingId) });
}

export const notificationKeys = keys;
