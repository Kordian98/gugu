import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmCard, Icon, Text, useCalm, type IconName } from "@gugu/design-system";
import { LOCALE_LABELS, LOCALES } from "@gugu/localization";

import { useLocale, useSwitchLocale } from "@/services/i18n/useLocale";

import { useSettings } from "../data/catalog";
import { useSalon } from "../data/SalonContext";
import { useWorkspace } from "../data/useWorkspace";
import { BookingSection, PoliciesSection } from "./settings/BookingSection";
import { HolidaysSection, HoursSection } from "./settings/HoursSection";
import { ProfileSection } from "./settings/ProfileSection";
import { ZaloSection } from "./settings/ZaloSection";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { useThemePreference, type ThemePreference } from "../theme/CrmThemeProvider";

const THEMES: { id: ThemePreference; icon: IconName }[] = [
  { id: "system", icon: "settings" },
  { id: "light", icon: "sun" },
  { id: "dark", icon: "moon" },
];

/** Salon settings (07 M7.5): profile, hours, booking/confirmation, holidays, policies; plus
 * workspace appearance (X18) and language. */
export function SettingsScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const ws = useWorkspace();
  const bp = useBreakpoint();
  const settings = useSettings();
  const { can, salonId } = useSalon();
  const { preference, setPreference } = useThemePreference();
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  // `?zalo=<result>` when Zalo's OAuth flow returns here (topic 09).
  const { zalo } = useLocalSearchParams<{ zalo?: string }>();
  return (
    <ScrollView contentContainerStyle={{ padding: bp === "mobile" ? 16 : 28, gap: 20 }}>
      <PageHeader title={t("pages.settings.title")} workspace={ws} />
      {settings.data ? (
        <View key={settings.dataUpdatedAt} style={{ gap: 20, maxWidth: 860 }}>
          <ProfileSection settings={settings.data} canEdit={can("salon.profile.write")} />
          <HoursSection settings={settings.data} canEdit={can("salon.settings.write")} />
          <BookingSection settings={settings.data} canEdit={can("salon.settings.write")} />
          <HolidaysSection settings={settings.data} canEdit={can("salon.settings.write")} />
          <PoliciesSection settings={settings.data} canEdit={can("salon.settings.write")} />
          {can("zalo.inbox.use") ? (
            <ZaloSection canManage={can("integrations.zalo.manage")} result={zalo} />
          ) : null}
        </View>
      ) : settings.isPending && salonId ? (
        <ActivityIndicator color={c.accent} />
      ) : null}
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
