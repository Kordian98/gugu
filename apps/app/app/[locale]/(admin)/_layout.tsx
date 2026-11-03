import { Slot } from "expo-router";

import { AdminGuard } from "@/features/admin/AdminGuard";
import { AdminShell } from "@/features/admin/AdminShell";
import { CrmThemeProvider } from "@/features/salon-crm/theme/CrmThemeProvider";

// Platform admin (topic 12 M12.6): GuGu staff only. Light + dark allowed here (X18). The guard is
// UX only; every /api/v1/admin call is checked against the caller's platform role by the API.
export default function AdminLayout() {
  return (
    <CrmThemeProvider>
      <AdminGuard>
        <AdminShell>
          <Slot />
        </AdminShell>
      </AdminGuard>
    </CrmThemeProvider>
  );
}
