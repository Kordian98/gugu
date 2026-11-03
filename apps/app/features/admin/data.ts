import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AdminAssignPlanInput,
  AdminCreateOverrideInput,
  AdminExtendTrialInput,
  AdminMutationResult,
  AdminReasonInput,
  AdminSalonDetail,
  AdminSalonList,
  AdminSetPaidUntilInput,
  AdminUsageOverview,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

/** Admin query keys live under ["admin"]: never shared with salon-scoped caches. */
const keys = {
  all: ["admin"] as const,
  salons: (qs: string) => ["admin", "salons", qs] as const,
  salon: (id: string) => ["admin", "salon", id] as const,
  usage: (month: string) => ["admin", "usage", month] as const,
};

export type SalonFilters = Record<string, string | undefined>;

export function toQueryString(filters: SalonFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== "") params.set(k, v);
  return params.toString();
}

export function useAdminSalons(filters: SalonFilters) {
  const qs = toQueryString(filters);
  return useInfiniteQuery({
    queryKey: keys.salons(qs),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<AdminSalonList>(
        `/admin/salons?${qs}${qs ? "&" : ""}limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useAdminSalon(salonId: string) {
  return useQuery({
    queryKey: keys.salon(salonId),
    queryFn: () => apiFetch<AdminSalonDetail>(`/admin/salons/${salonId}`),
    enabled: salonId !== "",
  });
}

export function useAdminUsage(month: string | null) {
  return useInfiniteQuery({
    queryKey: keys.usage(month ?? "current"),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiFetch<AdminUsageOverview>(
        `/admin/usage?limit=50${month ? `&month=${month}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export type AdminAction =
  | { kind: "assignPlan"; body: AdminAssignPlanInput }
  | { kind: "extendTrial"; body: AdminExtendTrialInput }
  | { kind: "setPaidUntil"; body: AdminSetPaidUntilInput }
  | { kind: "suspend"; body: AdminReasonInput }
  | { kind: "unsuspend"; body: AdminReasonInput }
  | { kind: "createOverride"; body: AdminCreateOverrideInput }
  | { kind: "revokeOverride"; overrideId: string; body: AdminReasonInput }
  | { kind: "grantFounding"; body: AdminReasonInput }
  | { kind: "revokeFounding"; body: AdminReasonInput };

function actionPath(salonId: string, a: AdminAction): string {
  const base = `/admin/salons/${salonId}`;
  switch (a.kind) {
    case "assignPlan":
      return `${base}/subscription/plan`;
    case "extendTrial":
      return `${base}/subscription/trial`;
    case "setPaidUntil":
      return `${base}/subscription/paid-until`;
    case "suspend":
      return `${base}/suspend`;
    case "unsuspend":
      return `${base}/unsuspend`;
    case "createOverride":
      return `${base}/overrides`;
    case "revokeOverride":
      return `${base}/overrides/${a.overrideId}/revoke`;
    case "grantFounding":
      return `${base}/founding-partner`;
    case "revokeFounding":
      return `${base}/founding-partner/revoke`;
  }
}

/** Every admin write: reason in the body, audited by the API; refreshes all admin views. */
export function useAdminAction(salonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: AdminAction) =>
      apiFetch<AdminMutationResult>(actionPath(salonId, a), { method: "POST", body: a.body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
