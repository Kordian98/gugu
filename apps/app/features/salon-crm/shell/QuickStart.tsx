import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { quickStartSalon } from "../data/setup";
import { EmptyState } from "../ui/EmptyState";

/**
 * First visit of a signed-in user without any salon (email-only signup, owner 2026-11-04): create
 * the salon with smart defaults, refresh the session's memberships, then open the guided setup.
 * The server call is idempotent, so a reload or a double mount never creates a second salon.
 */
export function QuickStart() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const auth = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const run = () => {
    setFailed(false);
    quickStartSalon(locale)
      .then(async () => {
        await auth.reload();
        router.replace(`/${locale}/business/setup` as never);
      })
      .catch(() => {
        setFailed(true);
      });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <View
      testID="crm-quick-start"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 14,
        backgroundColor: c.canvas,
      }}
    >
      {failed ? (
        <CalmCard style={{ maxWidth: 480, width: "100%" }}>
          <EmptyState
            testID="crm-quick-start-failed"
            icon="store"
            title={t("quickStart.failedTitle")}
            body={t("quickStart.failedBody")}
            action={<CalmButton label={t("quickStart.retry")} onPress={run} />}
          />
        </CalmCard>
      ) : (
        <>
          <ActivityIndicator color={c.accent} />
          <Text size={16} color={c.body} style={{ textAlign: "center" }}>
            {t("quickStart.preparing")}
          </Text>
        </>
      )}
    </View>
  );
}
