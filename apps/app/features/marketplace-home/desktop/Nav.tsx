import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, Icon, IconButton, Logo, Text, color } from "@gugu/design-system";

import { useSwitchLocale } from "@/services/i18n/useLocale";

import type { HomeNav } from "../useHomeNav";

/** Desktop navbar (ref-01): white pill with logo + links; actions on the right. `p` maps ref px → px. */
export function DesktopNav({ p, nav }: { p: (v: number) => number; nav: HomeNav }) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("a11y");
  const switchLocale = useSwitchLocale();
  const links = [
    { key: "discover", label: t("nav.discover"), x: 548, onPress: nav.explore },
    {
      key: "services",
      label: t("nav.services"),
      x: 683,
      onPress: () => {
        nav.category("nails");
      },
    },
    { key: "pros", label: t("nav.pros"), x: 867, onPress: nav.businessJoin },
  ];
  return (
    <>
      <View
        style={{
          position: "absolute",
          left: p(150),
          top: p(17),
          width: p(908),
          height: p(80),
          borderRadius: p(40),
          backgroundColor: "rgba(255,255,255,0.86)",
          shadowColor: color.ink,
          shadowOpacity: 0.05,
          shadowRadius: p(15),
          shadowOffset: { width: 0, height: p(4) },
        }}
      />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={ta("home")}
        onPress={nav.home}
        style={{ position: "absolute", left: p(183), top: p(32) }}
      >
        <Logo height={p(54)} />
      </Pressable>
      {links.map((l) => (
        <Pressable
          key={l.key}
          accessibilityRole="link"
          onPress={l.onPress}
          style={{ position: "absolute", left: p(l.x), top: p(43) }}
        >
          {(s) => (
            <Text
              role="uiMedium"
              size={p(18)}
              color={(s as { hovered?: boolean }).hovered === true ? color.lilac700 : color.ink}
            >
              {l.label}
            </Text>
          )}
        </Pressable>
      ))}
      <View
        style={{
          position: "absolute",
          right: p(173),
          top: p(26),
          height: p(56),
          flexDirection: "row",
          alignItems: "center",
          gap: p(16),
        }}
      >
        <IconButton size={p(56)} onPress={switchLocale} accessibilityLabel={ta("switchLanguage")}>
          <Text role="uiSemiBold" size={p(15)} style={{ letterSpacing: p(0.6) }}>
            {t("language.switchTo")}
          </Text>
        </IconButton>
        <IconButton size={p(56)} onPress={nav.explore} accessibilityLabel={ta("search")}>
          <Icon name="search" size={p(22)} />
        </IconButton>
        <Button
          variant="outline"
          label={t("nav.signIn")}
          onPress={nav.signIn}
          height={p(56)}
          fontSize={p(19)}
          paddingX={p(22)}
        />
        <Button
          label={t("nav.getStarted")}
          onPress={nav.signUp}
          height={p(56)}
          fontSize={p(20)}
          paddingX={p(30)}
        />
      </View>
    </>
  );
}
