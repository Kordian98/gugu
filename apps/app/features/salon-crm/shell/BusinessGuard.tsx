import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, useCalm } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { SalonProvider } from "../data/SalonContext";
import { useDemoMode } from "../data/useDemoMode";
import { EmptyState } from "../ui/EmptyState";

/**
 * Session + membership guard for the whole business area (07 M7.6). UX only: every API call is
 * checked again by the server (05). Signed-out users go to sign-in and come back here afterwards.
 */
export function BusinessGuard({ children }: { children: ReactNode }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const auth = useAuth();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const demo = useDemoMode();

  if (demo) return <SalonProvider>{children}</SalonProvider>;
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
  const memberships = auth.user?.memberships ?? [];
  if (!memberships.some((m) => m.status === "active")) {
    const pending = memberships.some((m) => m.status === "pending_verification");
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
        <CalmCard style={{ maxWidth: 520, width: "100%" }}>
          <EmptyState
            testID="crm-no-salon"
            icon="store"
            title={t(pending ? "guard.pendingTitle" : "guard.noSalonTitle")}
            body={t(pending ? "guard.pendingBody" : "guard.noSalonBody")}
            action={
              pending ? undefined : (
                <CalmButton
                  label={t("guard.register")}
                  icon="plus"
                  onPress={() => {
                    router.push(`/${locale}/business/join` as never);
                  }}
                />
              )
            }
          />
        </CalmCard>
      </View>
    );
  }
  return <SalonProvider>{children}</SalonProvider>;
}
