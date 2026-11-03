import { useQuery } from "@tanstack/react-query";

import type { SalonEntitlements } from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useOptionalSalon } from "./SalonContext";

/**
 * The salon's plan, trial end and free Basic year (X25) from `/salons/:id/entitlements`. Display
 * only: the API enforces every entitlement. Members without `subscription.read` get nothing.
 */
export function useSalonPlan(enabled = true) {
  const salon = useOptionalSalon();
  const salonId = salon?.salonId ?? "";
  const allowed = salon?.can("subscription.read") ?? false;
  return useQuery({
    queryKey: ["salon", salonId, "entitlements"],
    queryFn: () => apiFetch<SalonEntitlements>(`/salons/${salonId}/entitlements`),
    enabled: enabled && allowed && salonId !== "",
    staleTime: 60_000,
  });
}
