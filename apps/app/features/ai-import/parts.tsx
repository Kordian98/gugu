import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon, Text, useCalm } from "@gugu/design-system";

export function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <Icon name="sparkles" size={20} color={c.accent} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {title}
        </Text>
        <Text size={13} color={c.body}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/** What happens to the images before AI sees them (shown before every upload). */
export function PrivacyNote() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 12,
        backgroundColor: c.accentSoft,
        borderWidth: 1,
        borderColor: c.line,
        gap: 2,
      }}
    >
      <Text role="uiSemiBold" size={13} color={c.ink}>
        {t("aiImport.privacyTitle")}
      </Text>
      <Text size={12} color={c.body}>
        {t("aiImport.privacyBody")}
      </Text>
    </View>
  );
}
