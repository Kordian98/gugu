import { useMemo } from "react";

import { useAuth } from "@/services/auth/AuthProvider";

import { useOnboarding } from "./catalog";
import { demoWorkspace } from "./demo";
import { useOptionalSalon } from "./SalonContext";
import type { Workspace } from "./types";
import { useDemoMode } from "./useDemoMode";

/**
 * Workspace read model for the shell and Today. Identity, salon and setup progress are real; the
 * calendar/insights numbers stay empty states until the booking engine (06) and insights (07-M7.8)
 * serve them. The dev-only demo seed replaces everything when `?demo=1`.
 */
export function useWorkspace(): Workspace {
  const demo = useDemoMode();
  const { user } = useAuth();
  const salon = useOptionalSalon();
  const onboarding = useOnboarding();
  const name = user?.displayName ?? user?.email?.split("@")[0] ?? null;
  return useMemo(() => {
    if (demo) return demoWorkspace();
    return {
      demo: false,
      user: name ? { name, firstName: name.split(/\s+/).slice(-1)[0] ?? name } : null,
      salon: salon?.summary ? { name: salon.summary.name } : null,
      role: salon?.summary?.myRole ?? null,
      plan: null,
      today: {
        revenueEstimated: null,
        appointments: null,
        newCustomers: null,
        occupancy: null,
        staff: [],
        items: [],
        upcoming: [],
        activity: [],
      },
      setupDone: onboarding.data?.done ?? [],
      canGoLive: onboarding.data?.canGoLive ?? false,
      setupLoaded: onboarding.isSuccess,
    };
  }, [demo, name, salon?.summary, onboarding.data, onboarding.isSuccess]);
}
