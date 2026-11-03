import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  SalonQuickStartResult,
  SetupBusinessInput,
  SetupProgressInput,
  SetupState,
  StarterServicesInput,
  StarterServicesResult,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useSalon } from "./SalonContext";

/** Email-only signup: the signed-in user's first salon (idempotent on the server). */
export const quickStartSalon = (locale: "vi" | "en") =>
  apiFetch<SalonQuickStartResult>("/salons/quick-start", { method: "POST", body: { locale } });

export const setupApi = {
  business: (s: string, body: SetupBusinessInput) =>
    apiFetch(`/salons/${s}/onboarding/business`, { method: "PATCH", body }),
  progress: (s: string, body: SetupProgressInput) =>
    apiFetch<SetupState>(`/salons/${s}/onboarding/progress`, { method: "POST", body }),
  dismissCard: (s: string, _v: undefined) =>
    apiFetch(`/salons/${s}/onboarding/dismiss-card`, { method: "POST" }),
  starterServices: (s: string, body: StarterServicesInput) =>
    apiFetch<StarterServicesResult>(`/salons/${s}/onboarding/starter-services`, {
      method: "POST",
      body,
    }),
};

/** Setup writes; refresh the checklist (and whatever else the step touched). */
export function useSetupMutation<TVars, TResult = void>(
  request: (salonId: string, vars: TVars) => Promise<TResult>,
  also: ("services" | "settings" | "team" | "summary")[] = [],
) {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => request(salonId, vars),
    onSuccess: async () => {
      await Promise.all(
        ["onboarding", ...also].map((k) =>
          qc.invalidateQueries({ queryKey: ["salon", salonId, k] }),
        ),
      );
    },
  });
}
