import { Slot } from "expo-router";

import { BusinessGuard } from "@/features/salon-crm/shell/BusinessGuard";
import { WorkspaceShell } from "@/features/salon-crm/shell/WorkspaceShell";
import { CrmThemeProvider } from "@/features/salon-crm/theme/CrmThemeProvider";

// Salon workspace (topic 07). Light + dark only here (X18). The guard needs a session and an active
// membership (UX only; the API enforces access and permissions on every call).
export default function WorkspaceLayout() {
  return (
    <CrmThemeProvider>
      <BusinessGuard>
        <WorkspaceShell>
          <Slot />
        </WorkspaceShell>
      </BusinessGuard>
    </CrmThemeProvider>
  );
}
