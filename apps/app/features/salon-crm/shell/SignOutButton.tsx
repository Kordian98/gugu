import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Icon, Text, useCalm } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

/** The same account action stays reachable in the sidebar rail and mobile menu. */
export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const auth = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (auth.status !== "signedIn") return null;

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await auth.signOut();
      router.replace(`/${locale}/sign-in`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Pressable
        testID="crm-sign-out"
        accessibilityRole="button"
        accessibilityLabel={t("shell.signOut")}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={() => void signOut()}
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: collapsed ? 0 : 12,
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 12,
          backgroundColor: pressed ? c.sidebarHover : "transparent",
        })}
      >
        {busy ? (
          <ActivityIndicator size="small" color={c.sidebarText} />
        ) : (
          <Icon name="arrowRight" size={20} color={c.sidebarText} />
        )}
        {collapsed ? null : (
          <Text size={14} role="uiMedium" color={c.sidebarText}>
            {t("shell.signOut")}
          </Text>
        )}
      </Pressable>
      {failed ? (
        <View accessibilityRole="alert">
          <Text size={12} color={c.sidebarText}>
            {t("shell.signOutFailed")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
