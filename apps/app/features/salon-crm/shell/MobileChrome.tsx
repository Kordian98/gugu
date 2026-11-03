import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Icon, Logo, Pill, Text, alpha, color, useCalm } from "@gugu/design-system";

import { useThemePreference } from "../theme/CrmThemeProvider";
import { ALL_ITEMS, TABS } from "./nav";
import { useCrmNav, useVisibleNav } from "./useCrmNav";

/** Mobile header (ref crm-02 phone): menu, wordmark + STUDIO pill, theme toggle. */
export function MobileHeader({ onMenu }: { onMenu: () => void }) {
  const { c, scheme } = useCalm();
  const { t } = useTranslation("crm");
  const { setPreference } = useThemePreference();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 16,
        backgroundColor: c.sidebar,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("shell.openMenu")}
        onPress={onMenu}
        style={{ width: 44, height: 44, justifyContent: "center" }}
      >
        <Icon name="menu" size={22} color={c.sidebarText} />
      </Pressable>
      <View style={{ alignItems: "center", gap: 3 }}>
        <Logo height={24} variant="onDark" />
        <Pill align="center" label={t("brandPill")} tone="brand" size={9} />
      </View>
      <Pressable
        testID="crm-theme-toggle-mobile"
        accessibilityRole="button"
        accessibilityLabel={scheme === "dark" ? t("shell.toLight") : t("shell.toDark")}
        onPress={() => {
          setPreference(scheme === "dark" ? "light" : "dark");
        }}
        style={{ width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" }}
      >
        <Icon name={scheme === "dark" ? "sun" : "moon"} size={20} color={c.sidebarText} />
      </Pressable>
    </View>
  );
}

/** Bottom tab bar: Today, Calendar, Customers, More + the lilac "New" pill (ref crm-02 phone). */
export function BottomTabs({ onMore }: { onMore: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { active, go, newAppointment } = useCrmNav();
  const insets = useSafeAreaInsets();
  const tabActive = active !== null && TABS.includes(active);
  const tab = (id: (typeof TABS)[number]) => {
    const item = ALL_ITEMS.find((i) => i.id === id);
    if (!item) return null;
    const label = id === "overview" ? t("nav.today") : t(`nav.items.${id}`);
    return (
      <Tab
        key={id}
        label={label}
        icon={item.icon}
        active={active === id}
        onPress={() => {
          go(item.path);
        }}
      />
    );
  };
  return (
    <View
      testID="crm-bottom-tabs"
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingBottom: insets.bottom + 6,
        paddingTop: 6,
        paddingHorizontal: 8,
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      {TABS.slice(0, 2).map((id) => tab(id))}
      {/* Centre "+" (the bottom-right corner is reserved for the AI assistant bubble). */}
      <View style={{ flex: 1, alignItems: "center" }}>
        <Pressable
          testID="crm-new-appointment-mobile"
          accessibilityRole="button"
          accessibilityLabel={t("shell.newAppointment")}
          onPress={() => {
            newAppointment();
          }}
          style={{
            width: 52,
            height: 52,
            marginTop: -22,
            borderRadius: 26,
            backgroundColor: c.accentBg,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 4,
            borderColor: c.surface,
          }}
        >
          <Icon name="plus" size={24} color={c.onAccent} strokeWidth={2.4} />
        </Pressable>
        <Text role="uiMedium" size={11} color={c.muted}>
          {t("shell.newShort")}
        </Text>
      </View>
      {TABS.slice(2).map((id) => tab(id))}
      <Tab
        label={t("nav.more")}
        icon="more"
        active={!tabActive && active !== null}
        onPress={onMore}
      />
    </View>
  );
}

function Tab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: (typeof ALL_ITEMS)[number]["icon"];
  active: boolean;
  onPress: () => void;
}) {
  const { c } = useCalm();
  const fg = active ? c.accent : c.muted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 4, minHeight: 44 }}
    >
      <Icon name={icon} size={22} color={fg} strokeWidth={active ? 2.2 : 1.8} />
      <Text role={active ? "uiSemiBold" : "ui"} size={11} color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Full navigation sheet for mobile (all sections). */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { active, go } = useCrmNav();
  const { items } = useVisibleNav();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("nav.close")}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: alpha(color.plum950, 0.5) }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: insets.bottom + 12,
          paddingTop: 12,
          paddingHorizontal: 12,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: c.sidebar,
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 40,
            height: 4,
            borderRadius: 2,
            backgroundColor: c.sidebarLine,
            marginBottom: 8,
          }}
        />
        {items.map((item) => {
          const on = active === item.id;
          const fg = on ? c.navActiveText : c.sidebarText;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              onPress={() => {
                onClose();
                go(item.path);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                height: 46,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: on ? c.navActiveBg : "transparent",
              }}
            >
              <Icon name={item.icon} size={20} color={fg} strokeWidth={1.8} />
              <Text role={on ? "uiSemiBold" : "ui"} size={15} color={fg}>
                {t(`nav.items.${item.id}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

export function useMoreSheet() {
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => {
      setOpen(true);
    },
    hide: () => {
      setOpen(false);
    },
  };
}
