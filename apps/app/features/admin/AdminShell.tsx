import type { ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Icon, Logo, Pill, Text, useCalm, type IconName } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale, useSwitchLocale } from "@/services/i18n/useLocale";
import { useViewport } from "@/services/viewport/useViewport";

import { useBreakpoint } from "../salon-crm/shell/useBreakpoint";
import { type ThemePreference, useThemePreference } from "../salon-crm/theme/CrmThemeProvider";
import { Segmented } from "../salon-crm/ui/form";

type NavId = "overview" | "salons";
const NAV: { id: NavId; icon: IconName; path: string }[] = [
  { id: "overview", icon: "chart", path: "/admin" },
  { id: "salons", icon: "store", path: "/admin/salons" },
];

function useActive(): NavId {
  const pathname = usePathname();
  return /\/admin\/salons/.test(pathname) ? "salons" : "overview";
}

/** Platform admin frame: plum sidebar on tablet+, a compact top bar on phones (desktop-first). */
export function AdminShell({ children }: { children: ReactNode }) {
  const { c } = useCalm();
  const { mounted } = useViewport();
  const bp = useBreakpoint();
  if (Platform.OS === "web" && !mounted)
    return <View style={{ flex: 1, backgroundColor: c.canvas }} />;
  if (bp === "mobile") {
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <MobileBar />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.canvas }}>
      <Sidebar collapsed={bp === "tablet"} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function useNavigate() {
  const router = useRouter();
  const locale = useLocale();
  return (path: string) => {
    router.push(`/${locale}${path}` as never);
  };
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const active = useActive();
  const go = useNavigate();
  return (
    <View
      testID="admin-sidebar"
      style={{
        width: collapsed ? 76 : 232,
        backgroundColor: c.sidebar,
        borderRightWidth: 1,
        borderRightColor: c.sidebarLine,
      }}
    >
      <View style={{ alignItems: "center", gap: 6, paddingTop: 26, paddingBottom: 18 }}>
        <Logo height={collapsed ? 18 : 30} variant="onDark" />
        {collapsed ? null : (
          <Pill align="center" label={t("shell.staffOnly")} tone="brand" size={10} />
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: collapsed ? 12 : 14, gap: 4 }}>
        {NAV.map((item) => {
          const on = item.id === active;
          const label = t(`shell.nav.${item.id}`);
          return (
            <Pressable
              key={item.id}
              testID={`admin-nav-${item.id}`}
              accessibilityRole="link"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              onPress={() => {
                go(item.path);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: 12,
                height: 42,
                paddingHorizontal: collapsed ? 0 : 12,
                borderRadius: 12,
                backgroundColor: on ? c.navActiveBg : "transparent",
              }}
            >
              <Icon name={item.icon} size={18} color={on ? c.navActiveText : c.sidebarText} />
              {collapsed ? null : (
                <Text
                  role={on ? "uiSemiBold" : "uiMedium"}
                  size={14}
                  color={on ? c.navActiveText : c.sidebarText}
                >
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {collapsed ? null : <SidebarFooter />}
    </View>
  );
}

function SidebarFooter() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const auth = useAuth();
  const role = auth.user?.platformRole;
  const switchLocale = useSwitchLocale();
  const locale = useLocale();
  const { preference, setPreference } = useThemePreference();
  return (
    <View style={{ padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: c.sidebarLine }}>
      {role ? <Pill label={t(`shell.role.${role}`)} tone="accent" /> : null}
      <Text size={12} color={c.sidebarMuted} numberOfLines={1}>
        {auth.user?.email ?? ""}
      </Text>
      <View style={{ gap: 6 }}>
        <Text size={12} color={c.sidebarMuted}>
          {t("shell.themeLabel")}
        </Text>
        <ThemeSwitch value={preference} onChange={setPreference} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <FooterButton label={locale === "vi" ? "EN" : "VI"} onPress={switchLocale} />
        <FooterButton
          testID="admin-sign-out"
          label={t("shell.signOut")}
          onPress={() => {
            void auth.signOut();
          }}
        />
      </View>
    </View>
  );
}

function ThemeSwitch({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={(["light", "dark", "system"] as const).map((id) => ({
        id,
        label: t(`shell.theme.${id}`),
      }))}
    />
  );
}

function FooterButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 10,
        justifyContent: "center",
        backgroundColor: c.sidebarHover,
      }}
    >
      <Text role="uiMedium" size={13} color={c.sidebarText}>
        {label}
      </Text>
    </Pressable>
  );
}

function MobileBar() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const active = useActive();
  const go = useNavigate();
  const auth = useAuth();
  const switchLocale = useSwitchLocale();
  const locale = useLocale();
  return (
    <View
      style={{
        backgroundColor: c.sidebar,
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 10,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Logo height={20} variant="onDark" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <FooterButton label={locale === "vi" ? "EN" : "VI"} onPress={switchLocale} />
          <FooterButton
            label={t("shell.signOut")}
            onPress={() => {
              void auth.signOut();
            }}
          />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {NAV.map((item) => {
          const on = item.id === active;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              onPress={() => {
                go(item.path);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                height: 36,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: on ? c.navActiveBg : c.sidebarHover,
              }}
            >
              <Icon name={item.icon} size={16} color={on ? c.navActiveText : c.sidebarText} />
              <Text role="uiMedium" size={13} color={on ? c.navActiveText : c.sidebarText}>
                {t(`shell.nav.${item.id}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
