import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AdminAssignPlanInput,
  AdminCreateOverrideInput,
  AdminExtendTrialInput,
  AdminMfaEnrolment,
  AdminMfaRecoveryCodes,
  AdminMfaResetInput,
  AdminMfaStatus,
  AdminMutationResult,
  AdminReasonInput,
  AdminSalonDetail,
  AdminSalonList,
  AdminSetPaidUntilInput,
  AdminStepUpInput,
  AdminStepUpResult,
  AdminTeamList,
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

// ─── Second factor (topic 05 step 9, ADR-0011) ───────────────────────────────────────────────

const mfaKey = ["admin", "mfa"] as const;

/** My TOTP status and this session's step-up end. */
export function useAdminMfa() {
  return useQuery({
    queryKey: mfaKey,
    queryFn: () => apiFetch<AdminMfaStatus>("/admin/mfa"),
  });
}

function useMfaMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: mfaKey }),
  });
}

export const useStartEnrolment = () =>
  useMfaMutation(() => apiFetch<AdminMfaEnrolment>("/admin/mfa/totp/enrol", { method: "POST" }));

export const useConfirmEnrolment = () =>
  useMfaMutation((code: string) =>
    apiFetch<AdminMfaRecoveryCodes>("/admin/mfa/totp/confirm", {
      method: "POST",
      body: { code },
    }),
  );

export const useStepUp = () =>
  useMfaMutation((body: AdminStepUpInput) =>
    apiFetch<AdminStepUpResult>("/admin/mfa/step-up", { method: "POST", body }),
  );

export const useRegenerateRecoveryCodes = () =>
  useMfaMutation((code: string) =>
    apiFetch<AdminMfaRecoveryCodes>("/admin/mfa/recovery-codes", {
      method: "POST",
      body: { code },
    }),
  );

// ─── Admin team: reset another admin's 2FA (super_admin, owner answer q93) ───────────────────

const teamKey = ["admin", "team"] as const;

/** GuGu admins and their 2FA state. Only fetched for super admins (`platform.mfa.reset`). */
export function useAdminTeam(enabled: boolean) {
  return useQuery({
    queryKey: teamKey,
    queryFn: () => apiFetch<AdminTeamList>("/admin/team"),
    enabled,
  });
}

/** Needs this session's step-up and a reason; the API refuses one's own account. */
export function useResetAdminMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; body: AdminMfaResetInput }) =>
      apiFetch<AdminMutationResult>(`/admin/team/${v.userId}/mfa/reset`, {
        method: "POST",
        body: v.body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKey }),
  });
}
