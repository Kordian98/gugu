import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";
import type { AssistantStatus } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { useSalon } from "../salon-crm/data/SalonContext";
import { useCrmNav } from "../salon-crm/shell/useCrmNav";
import { ChatView } from "./ChatView";

/** Panel chrome + the state that decides what it shows (chat, upgrade prompt, not configured). */
export function AssistantPanel({
  status,
  loading,
  onClose,
}: {
  status: AssistantStatus | undefined;
  loading: boolean;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { salonId } = useSalon();
  const { go } = useCrmNav();
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.accentSoft,
          }}
        >
          <Icon name="sparkles" size={18} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text role="uiSemiBold" size={16} color={c.ink}>
            {t("assistant.title")}
          </Text>
          <Text size={12} color={c.muted}>
            {t("assistant.subtitle")}
          </Text>
        </View>
        <Pressable
          testID="assistant-close"
          accessibilityRole="button"
          accessibilityLabel={t("assistant.close")}
          onPress={onClose}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="close" size={20} color={c.body} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 32 }} />
      ) : status?.entitled === false ? (
        // Plan first (X25: Basic has no assistant): the upsell is shown even where the server has
        // no model configured, so owners always learn the assistant comes with Pro.
        <Notice
          testID="assistant-upgrade"
          icon="sparkles"
          title={t("assistant.upgradeTitle")}
          body={t("assistant.upgradeBody")}
          cta={t("assistant.upgradeCta")}
          onCta={() => {
            onClose();
            go("/business/settings");
          }}
        />
      ) : status?.configured === false ? (
        <Notice
          testID="assistant-not-configured"
          icon="settings"
          title={t("assistant.notConfigured")}
        />
      ) : (
        <ChatView salonId={salonId} locale={locale} />
      )}
    </View>
  );
}

function Notice({
  icon,
  title,
  body,
  cta,
  onCta,
  testID,
}: {
  icon: "sparkles" | "settings";
  title: string;
  body?: string;
  cta?: string;
  onCta?: () => void;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <View testID={testID} style={{ padding: 24, gap: 12, alignItems: "flex-start" }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.accentSoft,
        }}
      >
        <Icon name={icon} size={22} color={c.accent} />
      </View>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {title}
      </Text>
      {body ? (
        <Text size={14} color={c.body}>
          {body}
        </Text>
      ) : null}
      {cta && onCta ? <CalmButton label={cta} icon="arrowRight" onPress={onCta} /> : null}
    </View>
  );
}
