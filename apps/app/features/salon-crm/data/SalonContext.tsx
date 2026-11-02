import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import type { Membership, SalonSummary } from "@gugu/contracts";

/** Permission strings from packages/domain/src/auth/permissions.ts (the app does not import domain). */
export type SalonPermission =
  | "salon.profile.write"
  | "salon.settings.write"
  | "members.read"
  | "members.invite"
  | "members.roles.write"
  | "services.write"
  | "services.cost.read"
  | "schedules.write"
  | "bookings.write"
  | "customers.read"
  | "zalo.inbox.use"
  | "integrations.zalo.manage";

import { apiFetch } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";

type SalonState = {
  salonId: string;
  memberships: Membership[];
  summary: SalonSummary | null;
  /** UI gating only; the API enforces every permission (05). */
  can: (permission: SalonPermission) => boolean;
  switchSalon: (salonId: string) => void;
};

const Ctx = createContext<SalonState | null>(null);

/** The salon the workspace is showing: the user's first active membership until they switch. */
export function SalonProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const memberships = (user?.memberships ?? []).filter((m) => m.status === "active");
  const [picked, setPicked] = useState<string | null>(null);
  const salonId =
    memberships.find((m) => m.salonId === picked)?.salonId ?? memberships[0]?.salonId ?? "";
  const summary = useQuery({
    queryKey: ["salon", salonId, "summary"],
    queryFn: () => apiFetch<SalonSummary>(`/salons/${salonId}`),
    enabled: salonId !== "",
  });
  const permissions = new Set(summary.data?.myPermissions ?? []);
  return (
    <Ctx.Provider
      value={{
        salonId,
        memberships,
        summary: summary.data ?? null,
        can: (p) => permissions.has(p),
        switchSalon: setPicked,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSalon(): SalonState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSalon outside SalonProvider");
  return v;
}

/** Same as useSalon, but null outside the workspace (shared components, demo screenshots). */
export function useOptionalSalon(): SalonState | null {
  return useContext(Ctx);
}
