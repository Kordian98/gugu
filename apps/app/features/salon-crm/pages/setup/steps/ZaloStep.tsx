import { ActivityIndicator, Linking, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { SetupMethod } from "@gugu/contracts";
import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { useZaloConnection, useZaloMutation, zaloApi } from "../../../data/zalo";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner } from "../../../ui/form";
import { StepFooter, StepFrame } from "../parts/StepFrame";

const RESULTS = ["connected", "denied", "failed", "oa_in_use", "expired", "plan"] as const;
type Result = (typeof RESULTS)[number];

const openUrl = (url: string) => {
  if (Platform.OS === "web") window.location.assign(url);
  else void Linking.openURL(url);
};

/**
 * Step (e): connect the salon's own Zalo OA (topic 09, X24), optional. One line of benefit, one
 * button; Zalo brings the browser back to this step. Hidden behind a calm note when the integration
 * is disabled on this server (never broken UI, skill rule 14).
 */
export function ZaloStep({
  result,
  eta,
  onDone,
  onSkip,
  onBack,
}: {
  result: string | undefined;
  eta: string;
  onDone: (method: SetupMethod | undefined) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const connection = useZaloConnection();
  const start = useZaloMutation(zaloApi.startFromSetup);
  const data = connection.data;
  const connected = data?.status === "connected" || data?.status === "needs_reauth";
  const disabled = data?.mode === "disabled" || connection.isError;
  const shown: Result | undefined = RESULTS.find((r) => r === result);
  return (
    <StepFrame
      title={t("setupWizard.zalo.title")}
      body={t("setupWizard.zalo.body")}
      eta={eta}
      footer={
        <StepFooter
          label={t("setupWizard.next")}
          onPress={() => {
            if (connected) onDone("zalo_connect");
            else onSkip();
          }}
          onSkip={connected ? undefined : onSkip}
          onBack={onBack}
        />
      }
    >
      <ErrorBanner text={errorText(start.error)} />
      {shown && !connected ? (
        <Text size={14} color={shown === "connected" ? c.up.text : c.down.text}>
          {t(`setupWizard.zalo.result.${shown}`)}
        </Text>
      ) : null}
      <View
        testID="crm-setup-zalo"
        style={{
          gap: 12,
          padding: 18,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: connected ? c.accentBg : c.line,
          backgroundColor: connected ? c.accentSoft : c.surface,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name={connected ? "check" : "chat"} size={22} color={c.accent} />
          <Text role="uiSemiBold" size={16} color={c.ink} style={{ flex: 1 }}>
            {connected ? t("setupWizard.zalo.connected") : t("setupWizard.zalo.title")}
          </Text>
        </View>
        {connection.isPending ? (
          <ActivityIndicator color={c.accent} style={{ alignSelf: "flex-start" }} />
        ) : connected ? (
          data.oaName ? (
            <Text size={14} color={c.body}>
              {data.oaName}
            </Text>
          ) : null
        ) : disabled ? (
          <Text testID="crm-setup-zalo-disabled" size={14} color={c.body}>
            {t("setupWizard.zalo.disabled")}
          </Text>
        ) : (
          <>
            <CalmButton
              testID="crm-setup-zalo-connect"
              icon="link"
              label={start.isPending ? t("setupWizard.saving") : t("setupWizard.zalo.cta")}
              onPress={() => {
                if (start.isPending) return;
                start.mutate(locale, {
                  onSuccess: (r) => {
                    openUrl(r.authorizeUrl);
                  },
                });
              }}
            />
            <Text size={13} color={c.muted}>
              {t("setupWizard.zalo.noOa")}
            </Text>
          </>
        )}
      </View>
    </StepFrame>
  );
}
