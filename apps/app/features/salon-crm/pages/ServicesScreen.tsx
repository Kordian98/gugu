import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmCard, Icon, Text, useCalm } from "@gugu/design-system";

import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";

/**
 * Services: the two setup paths from 07 §3.7. Path A (AI from price-list screenshots, every plan) is the
 * first card; the extraction itself is topic 08's (PII-free, X10) and is wired in when it ships.
 */
export function ServicesScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const ws = useWorkspace();
  const bp = useBreakpoint();
  const mobile = bp === "mobile";
  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 20 }}>
      <PageHeader title={t("pages.services.title")} workspace={ws} />
      <View style={{ flexDirection: mobile ? "column" : "row", gap: 16, alignItems: "stretch" }}>
        <CalmCard testID="crm-ai-import" style={{ flex: 1.3, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={18} color={c.accent} />
            <Text role="uiSemiBold" size={16} color={c.ink}>
              {t("setup.title")}
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: c.accentBg,
              borderRadius: 16,
              backgroundColor: c.accentSoft,
              padding: 28,
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="upload" size={28} color={c.accent} />
            <Text role="uiSemiBold" size={15} color={c.ink}>
              {t("setup.importTitle")}
            </Text>
            <Text size={13} color={c.body} style={{ textAlign: "center", maxWidth: 420 }}>
              {t("setup.importBody")}
            </Text>
          </View>
          <Text size={13} color={c.body}>
            {t("setup.importPending")}
          </Text>
          <Text size={12} color={c.muted}>
            {t("setup.privacy")}
          </Text>
        </CalmCard>
        <CalmCard style={{ flex: 1, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="tag" size={18} color={c.accent} />
            <Text role="uiSemiBold" size={16} color={c.ink}>
              {t("setup.manualTitle")}
            </Text>
          </View>
          <Text size={13} color={c.body}>
            {t("setup.manualBody")}
          </Text>
        </CalmCard>
      </View>
    </ScrollView>
  );
}
