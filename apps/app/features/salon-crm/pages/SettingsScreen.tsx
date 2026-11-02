import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmCard, Icon, Text, useCalm, type IconName } from "@gugu/design-system";
import { LOCALE_LABELS, LOCALES } from "@gugu/localization";

import { useLocale, useSwitchLocale } from "@/services/i18n/useLocale";

import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { useThemePreference, type ThemePreference } from "../theme/CrmThemeProvider";

const THEMES: { id: ThemePreference; icon: IconName }[] = [
  { id: "system", icon: "settings" },
  { id: "light", icon: "sun" },
  { id: "dark", icon: "moon" },
];

/** Settings available today: workspace appearance (X18) and language. */
export function SettingsScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const ws = useWorkspace();
  const bp = useBreakpoint();
  const { preference, setPreference } = useThemePreference();
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  return (
    <ScrollView contentContainerStyle={{ padding: bp === "mobile" ? 16 : 28, gap: 20 }}>
      <PageHeader title={t("pages.settings.title")} workspace={ws} />
      <CalmCard style={{ gap: 12, maxWidth: 640 }}>
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("pages.settings.appearance")}
        </Text>
        <Text size={13} color={c.body}>
          {t("pages.settings.appearanceBody")}
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
        >
          {THEMES.map((th) => (
            <Choice
              key={th.id}
              testID={`crm-theme-${th.id}`}
              icon={th.icon}
              label={t(`pages.settings.${th.id}`)}
              selected={preference === th.id}
              onPress={() => {
                setPreference(th.id);
              }}
            />
          ))}
        </View>
      </CalmCard>
      <CalmCard style={{ gap: 12, maxWidth: 640 }}>
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("pages.settings.language")}
        </Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 10 }}>
          {LOCALES.map((l) => (
            <Choice
              key={l}
              label={LOCALE_LABELS[l]}
              selected={locale === l}
              onPress={() => {
                if (locale !== l) switchLocale();
              }}
            />
          ))}
        </View>
      </CalmCard>
    </ScrollView>
  );
}

function Choice({
  label,
  icon,
  selected,
  onPress,
  testID,
}: {
  label: string;
  icon?: IconName | undefined;
  selected: boolean;
  onPress: () => void;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        height: 42,
        paddingHorizontal: 14,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: selected ? c.accentBg : c.line,
        backgroundColor: selected ? c.accentSoft : c.surface,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? c.accent : c.body} /> : null}
      <Text role={selected ? "uiSemiBold" : "ui"} size={14} color={selected ? c.accent : c.ink}>
        {label}
      </Text>
    </Pressable>
  );
}
