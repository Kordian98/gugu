import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CategoryItem,
  CreateInvitationInput,
  HolidayInput,
  InvitationCreated,
  Onboarding,
  OpeningHoursInput,
  PoliciesInput,
  BookingSettings,
  SalonProfileInput,
  SalonSettings,
  Service,
  ServiceInput,
  ServiceList,
  StaffInput,
  Team,
  TimeOffInput,
  WeeklyScheduleInput,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useOptionalSalon, useSalon } from "./SalonContext";

/** Query keys include the salon id so switching salons never shows another tenant's cache. */
const keys = {
  services: (s: string) => ["salon", s, "services"] as const,
  team: (s: string) => ["salon", s, "team"] as const,
  settings: (s: string) => ["salon", s, "settings"] as const,
  onboarding: (s: string) => ["salon", s, "onboarding"] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: ["public", "categories"],
    queryFn: () => apiFetch<{ items: CategoryItem[] }>("/public/categories"),
    staleTime: 3_600_000,
  });
}

export function useServices() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.services(salonId),
    queryFn: () => apiFetch<ServiceList>(`/salons/${salonId}/services`),
    enabled: salonId !== "",
  });
}

export function useTeam(enabled = true) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.team(salonId),
    queryFn: () => apiFetch<Team>(`/salons/${salonId}/team`),
    enabled: enabled && salonId !== "",
  });
}

export function useSettings() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.settings(salonId),
    queryFn: () => apiFetch<SalonSettings>(`/salons/${salonId}/settings`),
    enabled: salonId !== "",
  });
}

export function useOnboarding() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.onboarding(salonId),
    queryFn: () => apiFetch<Onboarding>(`/salons/${salonId}/onboarding`),
    enabled: salonId !== "",
  });
}

/** One mutation hook for every workspace write; refreshes the affected lists and the checklist. */
export function useCrmMutation<TVars, TResult = void>(
  request: (salonId: string, vars: TVars) => Promise<TResult>,
  invalidate: ("services" | "team" | "settings")[],
) {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => request(salonId, vars),
    onSuccess: async () => {
      await Promise.all([
        ...invalidate.map((k) => qc.invalidateQueries({ queryKey: keys[k](salonId) })),
        qc.invalidateQueries({ queryKey: keys.onboarding(salonId) }),
        qc.invalidateQueries({ queryKey: ["salon", salonId, "summary"] }),
      ]);
    },
  });
}

export const crmApi = {
  createService: (s: string, body: ServiceInput) =>
    apiFetch<Service>(`/salons/${s}/services`, { method: "POST", body }),
  updateService: (s: string, v: { id: string; body: ServiceInput }) =>
    apiFetch<Service>(`/salons/${s}/services/${v.id}`, { method: "PATCH", body: v.body }),
  setServiceActive: (s: string, v: { id: string; isActive: boolean }) =>
    apiFetch(`/salons/${s}/services/${v.id}/active`, {
      method: "PATCH",
      body: { isActive: v.isActive },
    }),
  removeService: (s: string, id: string) =>
    apiFetch(`/salons/${s}/services/${id}`, { method: "DELETE" }),
  reorderServices: (s: string, ids: string[]) =>
    apiFetch(`/salons/${s}/services/order`, { method: "PATCH", body: { ids } }),
  createStaff: (s: string, body: StaffInput) =>
    apiFetch<{ id: string }>(`/salons/${s}/team`, { method: "POST", body }),
  updateStaff: (s: string, v: { id: string; body: StaffInput }) =>
    apiFetch(`/salons/${s}/team/${v.id}`, { method: "PATCH", body: v.body }),
  removeStaff: (s: string, id: string) => apiFetch(`/salons/${s}/team/${id}`, { method: "DELETE" }),
  replaceSchedule: (s: string, v: { id: string; body: WeeklyScheduleInput }) =>
    apiFetch(`/salons/${s}/team/${v.id}/schedule`, { method: "PATCH", body: v.body }),
  addTimeOff: (s: string, v: { id: string; body: TimeOffInput }) =>
    apiFetch(`/salons/${s}/team/${v.id}/time-off`, { method: "POST", body: v.body }),
  removeTimeOff: (s: string, v: { staffId: string; id: string }) =>
    apiFetch(`/salons/${s}/team/${v.staffId}/time-off/${v.id}`, { method: "DELETE" }),
  invite: (s: string, body: CreateInvitationInput) =>
    apiFetch<InvitationCreated>(`/salons/${s}/invitations`, { method: "POST", body }),
  revokeInvitation: (s: string, id: string) =>
    apiFetch(`/salons/${s}/invitations/${id}`, { method: "DELETE" }),
  updateProfile: (s: string, body: SalonProfileInput) =>
    apiFetch(`/salons/${s}/settings/profile`, { method: "PATCH", body }),
  updateBooking: (s: string, body: BookingSettings) =>
    apiFetch(`/salons/${s}/settings/booking`, { method: "PATCH", body }),
  updatePolicies: (s: string, body: PoliciesInput) =>
    apiFetch(`/salons/${s}/settings/policies`, { method: "PATCH", body }),
  replaceOpeningHours: (s: string, body: OpeningHoursInput) =>
    apiFetch(`/salons/${s}/settings/opening-hours`, { method: "PATCH", body }),
  addHoliday: (s: string, body: HolidayInput) =>
    apiFetch(`/salons/${s}/settings/holidays`, { method: "POST", body }),
  removeHoliday: (s: string, id: string) =>
    apiFetch(`/salons/${s}/settings/holidays/${id}`, { method: "DELETE" }),
  goLive: (s: string, _v: undefined) => apiFetch(`/salons/${s}/go-live`, { method: "POST" }),
};
