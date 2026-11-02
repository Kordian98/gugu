import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type { PendingSalonList } from "@gugu/contracts";
import { Button, Text, color } from "@gugu/design-system";

import { apiFetch } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { toHref } from "./afterSignIn";
import { AuthCard } from "./AuthCard";
import { authErrorMessage } from "./errors";

type Decision = "confirmed" | "declined";

/**
 * Explicit confirm step for salons registered with this email (security review: signing in must
 * not silently make the user owner of salons someone else may have registered with their email).
 */
export function PendingSalonsScreen() {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const next =
    typeof params.next === "string" && /^\/(?!\/)/.test(params.next)
      ? params.next
      : `/${locale}/me`;
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = useQuery({
    queryKey: ["me", "pending-salons"],
    queryFn: () => apiFetch<PendingSalonList>("/me/pending-salons"),
  });

  const decide = async (salonId: string, decision: Decision) => {
    setError(null);
    try {
      await apiFetch(
        `/me/pending-salons/${salonId}/${decision === "confirmed" ? "confirm" : "decline"}`,
        {
          method: "POST",
        },
      );
      setDecisions((d) => ({ ...d, [salonId]: decision }));
    } catch (e) {
      setError(authErrorMessage(t, e));
    }
  };

  return (
    <AuthCard>
      <Text role="display" size={40} lineHeight={44}>
        {t("pendingSalons.title")}
      </Text>
      <Text size={16} color={color.body}>
        {t("pendingSalons.body")}
      </Text>
      {(pending.data?.items ?? []).map((salon) => {
        const decision = decisions[salon.salonId];
        return (
          <View
            key={salon.salonId}
            className="gap-3 rounded-[20px] p-4"
            style={{ borderWidth: 1, borderColor: color.line }}
          >
            <Text role="uiSemiBold" size={17} color={color.ink}>
              {salon.salonName}
            </Text>
            {decision ? (
              <Text size={14} color={color.muted}>
                {t(decision === "confirmed" ? "pendingSalons.confirmed" : "pendingSalons.declined")}
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                <Button
                  label={t("pendingSalons.confirm")}
                  onPress={() => void decide(salon.salonId, "confirmed")}
                  height={44}
                  fontSize={15}
                />
                <Button
                  label={t("pendingSalons.decline")}
                  variant="outline"
                  onPress={() => void decide(salon.salonId, "declined")}
                  height={44}
                  fontSize={15}
                />
              </View>
            )}
          </View>
        );
      })}
      {error ? (
        <Text size={14} color={color.rose500}>
          {error}
        </Text>
      ) : null}
      <Button
        label={t("pendingSalons.continue")}
        onPress={() => {
          void auth.reload().then(() => {
            router.replace(toHref(next));
          });
        }}
        height={52}
        fontSize={16}
        trailingArrow
      />
    </AuthCard>
  );
}
