import { Slot } from "expo-router";

import { WorkspaceShell } from "@/features/salon-crm/shell/WorkspaceShell";
import { CrmThemeProvider } from "@/features/salon-crm/theme/CrmThemeProvider";

// Salon workspace (topic 07). Light + dark only here (X18); guards are UX only, the API enforces access.
export default function WorkspaceLayout() {
  return (
    <CrmThemeProvider>
      <WorkspaceShell>
        <Slot />
      </WorkspaceShell>
    </CrmThemeProvider>
  );
}
