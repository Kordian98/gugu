import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, useCalm } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { EmptyState } from "../salon-crm/ui/EmptyState";

/**
 * Platform admin gate (topic 12 M12.6). UX only: the API answers 401/403 on every /admin call for
 * anyone without a platform role. Salon members see a "no access" card; nothing is fetched.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const auth = useAuth();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  if (auth.status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.canvas,
        }}
      >
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  if (auth.status === "signedOut") {
    return <Redirect href={`/${locale}/sign-in?next=${encodeURIComponent(pathname)}` as never} />;
  }
  if (!auth.user?.platformRole) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: c.canvas,
        }}
      >
        <CalmCard testID="admin-denied" style={{ maxWidth: 520, width: "100%" }}>
          <EmptyState
            icon="alert"
            title={t("guard.deniedTitle")}
            body={t("guard.deniedBody")}
            action={
              <CalmButton
                variant="secondary"
                label={t("guard.toWorkspace")}
                onPress={() => {
                  router.replace(`/${locale}/business` as never);
                }}
              />
            }
          />
        </CalmCard>
      </View>
    );
  }
  return <>{children}</>;
}
