import { useMemo } from "react";

import { demoWorkspace } from "./demo";
import type { Workspace } from "./types";
import { useDemoMode } from "./useDemoMode";

/** Nothing is served yet: the salon/calendar/insights API arrives with topics 05, 06 and 07-M7.8. */
const EMPTY: Workspace = {
  demo: false,
  user: null,
  salon: null,
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
  setupDone: [],
};

/**
 * Workspace read model for the shell and Today. Real data comes from the API (TanStack Query) once the
 * endpoints exist; until then screens render their designed empty states, or the dev-only demo seed.
 */
export function useWorkspace(): Workspace {
  const demo = useDemoMode();
  return useMemo(() => (demo ? demoWorkspace() : EMPTY), [demo]);
}
