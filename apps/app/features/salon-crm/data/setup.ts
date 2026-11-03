import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  MyInvitationList,
  SalonQuickStartResult,
  SetupBusinessInput,
  SetupProgressInput,
  SetupState,
  StarterServicesInput,
  StarterServicesResult,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useSalon } from "./SalonContext";

/**
 * Email-only signup: the signed-in user's first salon (idempotent on the server). Refused with 409
 * `salon.invitation_pending` while the email has team invitations, unless the user explicitly
 * chose "I own a salon" (`ignoreInvitations`, q102).
 */
export const quickStartSalon = (locale: "vi" | "en", ignoreInvitations = false) =>
  apiFetch<SalonQuickStartResult>("/salons/quick-start", {
    method: "POST",
    body: { locale, ignoreInvitations },
  });

/** Team invitations bound to the signed-in email (q102). */
export const myInvitations = () => apiFetch<MyInvitationList>("/me/invitations");
export const acceptMyInvitation = (id: string) =>
  apiFetch<{ salonId: string }>(`/me/invitations/${id}/accept`, { method: "POST" });

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
