import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, Icon, Logo, Pill, Text, useCalm } from "@gugu/design-system";

import type { Workspace } from "../data/types";
import { useThemePreference } from "../theme/CrmThemeProvider";
import { NAV, type NavItem, type NavSectionId } from "./nav";
import { useCrmNav } from "./useCrmNav";

/** Dark plum sidebar (ref crm-01): wordmark + BUSINESS pill, grouped collapsible nav, user + salon. */
export function Sidebar({ workspace, collapsed }: { workspace: Workspace; collapsed: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { active, go } = useCrmNav();
  const [closed, setClosed] = useState<Partial<Record<NavSectionId, boolean>>>({});
  const width = collapsed ? 76 : 248;
  const badge = (item: NavItem) =>
    item.id === "appointments" && workspace.today.appointments
      ? workspace.today.appointments.total
      : null;

  return (
    <View
      testID="crm-sidebar"
      style={{
        width,
        backgroundColor: c.sidebar,
        borderRightWidth: 1,
        borderRightColor: c.sidebarLine,
      }}
    >
      <View style={{ alignItems: "center", gap: 6, paddingTop: 26, paddingBottom: 18 }}>
        <Logo height={collapsed ? 18 : 34} variant="onDark" />
        {collapsed ? null : <Pill align="center" label={t("brandPill")} tone="brand" size={10} />}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: collapsed ? 12 : 14, gap: 14 }}>
        {NAV.map((section) => {
          const isClosed = closed[section.id] === true;
          const name = t(`nav.sections.${section.id}`);
          return (
            <View key={section.id} style={{ gap: 2 }}>
              {collapsed ? (
                <View style={{ height: 1, backgroundColor: c.sidebarLine, marginVertical: 4 }} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("nav.toggleSection", { name })}
                  accessibilityState={{ expanded: !isClosed }}
                  onPress={() => {
                    setClosed((s) => ({ ...s, [section.id]: !isClosed }));
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    role="uiMedium"
                    size={11}
                    color={c.sidebarMuted}
                    style={{ letterSpacing: 0.8, textTransform: "uppercase" }}
                  >
                    {name}
                  </Text>
                  <Icon
                    name={isClosed ? "chevronDown" : "chevronUp"}
                    size={14}
                    color={c.sidebarMuted}
                  />
                </Pressable>
              )}
              {isClosed && !collapsed
                ? null
                : section.items.map((item) => (
                    <NavRow
                      key={item.id}
                      label={t(`nav.items.${item.id}`)}
                      item={item}
                      active={active === item.id}
                      collapsed={collapsed}
                      badge={badge(item)}
                      onPress={() => {
                        go(item.path);
                      }}
                    />
                  ))}
            </View>
          );
        })}
      </ScrollView>
      <SidebarFooter workspace={workspace} collapsed={collapsed} />
    </View>
  );
}

function NavRow({
  item,
  label,
  active,
  collapsed,
  badge,
  onPress,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge: number | null;
  onPress: () => void;
}) {
  const { c } = useCalm();
  const fg = active ? c.navActiveText : c.sidebarText;
  return (
    <Pressable
      testID={`crm-nav-${item.id}`}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean | undefined }).hovered === true;
        return {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 12,
          height: 38,
          paddingHorizontal: collapsed ? 0 : 10,
          borderRadius: 10,
          backgroundColor: active ? c.navActiveBg : hovered ? c.sidebarHover : "transparent",
        };
      }}
    >
      <Icon name={item.icon} size={18} color={fg} strokeWidth={1.8} />
      {collapsed ? null : (
        <>
          <Text role={active ? "uiSemiBold" : "ui"} size={14} color={fg} style={{ flex: 1 }}>
            {label}
          </Text>
          {badge !== null ? (
            <View
              style={{
                minWidth: 24,
                paddingHorizontal: 6,
                borderRadius: 7,
                backgroundColor: active ? c.sidebar : c.sidebarHover,
                alignItems: "center",
              }}
            >
              <Text role="uiMedium" size={11} color={c.sidebarText}>
                {String(badge)}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

function SidebarFooter({ workspace, collapsed }: { workspace: Workspace; collapsed: boolean }) {
  const { c, scheme } = useCalm();
  const { t } = useTranslation("crm");
  const { setPreference } = useThemePreference();
  const userName = workspace.user?.name ?? t("shell.userFallback");
  const salonName = workspace.salon?.name ?? t("shell.salonFallback");
  const toggle = (
    <Pressable
      testID="crm-theme-toggle"
      accessibilityRole="button"
      accessibilityLabel={scheme === "dark" ? t("shell.toLight") : t("shell.toDark")}
      onPress={() => {
        setPreference(scheme === "dark" ? "light" : "dark");
      }}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.sidebarHover,
      }}
    >
      <Icon name={scheme === "dark" ? "sun" : "moon"} size={16} color={c.sidebarText} />
    </Pressable>
  );
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: c.sidebarLine,
        padding: collapsed ? 12 : 16,
        gap: 14,
        alignItems: collapsed ? "center" : "stretch",
      }}
    >
      {collapsed ? (
        <>
          {toggle}
          <Avatar name={workspace.user?.name} size={36} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar name={workspace.user?.name} size={36} />
            <View style={{ flex: 1 }}>
              <Text role="uiSemiBold" size={14} color={c.sidebarText} numberOfLines={1}>
                {userName}
              </Text>
              {workspace.user ? (
                <Text size={12} color={c.sidebarMuted}>
                  {t("shell.roleOwner")}
                </Text>
              ) : null}
            </View>
            {toggle}
          </View>
          {/* Salon switcher: becomes a menu once an owner has several salons (Ultra chains, 07 G6). */}
          <View testID="crm-salon" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: c.badgeBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="store" size={18} color={c.badgeText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text size={11} color={c.sidebarMuted}>
                {t("shell.salonLabel")}
              </Text>
              <Text role="uiSemiBold" size={14} color={c.sidebarText} numberOfLines={1}>
                {salonName}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
