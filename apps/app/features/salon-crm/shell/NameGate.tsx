import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, usePathname } from "expo-router";

import { useCalm } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { useOnboarding } from "../data/catalog";

/**
 * q103 (owner 2026-11-04): a salon from the email-only signup has no name until the first setup
 * step, and nothing else in the workspace opens before that — every route goes to the setup's name
 * step. Older salons (no setup state) and named salons pass straight through. UX only: the API
 * refuses name-dependent writes with 409 `salon.name_required`.
 */
export function NameGate({ children }: { children: ReactNode }) {
  const { c } = useCalm();
  const locale = useLocale();
  const pathname = usePathname();
  const onboarding = useOnboarding();
  const onSetup = /\/business\/setup$/.test(pathname);
  if (onboarding.isPending && !onSetup) {
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
  const unnamed = onboarding.data?.setup ? !onboarding.data.setup.nameConfirmed : false;
  if (unnamed && !onSetup) return <Redirect href={`/${locale}/business/setup` as never} />;
  return <>{children}</>;
}
