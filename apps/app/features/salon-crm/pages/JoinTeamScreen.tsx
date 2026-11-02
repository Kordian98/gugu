import { ActivityIndicator, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Logo, Text, useCalm } from "@gugu/design-system";
import type { InvitationPreview } from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { CrmThemeProvider } from "../theme/CrmThemeProvider";
import { EmptyState } from "../ui/EmptyState";
import { useErrorText } from "../ui/errors";
import { ErrorBanner } from "../ui/form";

/** Accept a team invitation (07 M7.4): preview → sign in if needed → join → workspace. */
export function JoinTeamScreen() {
  return (
    <CrmThemeProvider>
      <JoinTeam />
    </CrmThemeProvider>
  );
}

function JoinTeam() {
  const { c, scheme } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const router = useRouter();
  const auth = useAuth();
  const errorText = useErrorText();
  const { token = "" } = useLocalSearchParams<{ token?: string }>();
  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () =>
      apiFetch<InvitationPreview>("/invitations/preview", { method: "POST", body: { token } }),
    enabled: token.length >= 32,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      apiFetch<{ salonId: string }>("/invitations/accept", { method: "POST", body: { token } }),
    onSuccess: async () => {
      await auth.reload();
      router.replace(`/${locale}/business` as never);
    },
  });
  const p = preview.data;
  const here = `/${locale}/join-team?token=${encodeURIComponent(token)}`;

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
      <CalmCard
        style={{ width: "100%", maxWidth: 480, gap: 16, alignItems: "center", padding: 28 }}
      >
        <Logo height={36} variant={scheme === "dark" ? "onDark" : "color"} />
        {preview.isPending && token ? (
          <ActivityIndicator color={c.accent} />
        ) : !p || p.status !== "valid" ? (
          <EmptyState
            testID="crm-invite-invalid"
            icon="link"
            title={t(p?.status === "used" ? "join.usedTitle" : "join.invalidTitle")}
            body={t("join.invalidBody")}
          />
        ) : (
          <>
            <Text
              role="uiSemiBold"
              size={22}
              lineHeight={28}
              color={c.ink}
              style={{ textAlign: "center" }}
            >
              {t("join.title", { salon: p.salonName })}
            </Text>
            <Text size={14} color={c.body} style={{ textAlign: "center" }}>
              {t("join.body", { role: t(`shell.roles.${p.role}`) })}
            </Text>
            {p.emailBound ? (
              <Text size={12} color={c.muted} style={{ textAlign: "center" }}>
                {t("join.emailBound")}
              </Text>
            ) : null}
            <ErrorBanner text={errorText(accept.error)} />
            {auth.status === "signedIn" ? (
              <CalmButton
                testID="crm-join-accept"
                label={accept.isPending ? t("common.saving") : t("join.accept")}
                onPress={() => {
                  accept.mutate();
                }}
              />
            ) : auth.status === "signedOut" ? (
              <CalmButton
                label={t("join.signIn")}
                onPress={() => {
                  router.push(`/${locale}/sign-in?next=${encodeURIComponent(here)}` as never);
                }}
              />
            ) : (
              <ActivityIndicator color={c.accent} />
            )}
          </>
        )}
      </CalmCard>
    </View>
  );
}
