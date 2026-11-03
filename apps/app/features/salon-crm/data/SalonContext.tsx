import { createContext, useContext, useState, type ReactNode } from "react";
import { Platform } from "react-native";
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
  | "bookings.override_rules"
  | "customers.read"
  | "customers.phone.read"
  | "customers.export"
  | "customers.erase"
  | "zalo.inbox.use"
  | "integrations.zalo.manage"
  | "analytics.read"
  | "subscription.read"
  | "payroll.read"
  | "payroll.manage"
  | "payroll.self.read";

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

const PICK_KEY = "gugu.crm.salon";
const readPick = (): string | null => {
  try {
    return Platform.OS === "web" && typeof localStorage !== "undefined"
      ? localStorage.getItem(PICK_KEY)
      : null;
  } catch {
    return null;
  }
};

/**
 * The salon the workspace is showing (ADR-0018): the one the user last switched to on this device
 * if they still belong to it, else the most recently joined active membership (`/me` lists newest
 * first — e.g. the salon whose invitation was just accepted).
 */
export function SalonProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const memberships = (user?.memberships ?? []).filter((m) => m.status === "active");
  const [picked, setPickedState] = useState<string | null>(readPick);
  const setPicked = (id: string) => {
    setPickedState(id);
    try {
      if (Platform.OS === "web" && typeof localStorage !== "undefined")
        localStorage.setItem(PICK_KEY, id);
    } catch {
      // Storage blocked: the choice lasts for this session.
    }
  };
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
