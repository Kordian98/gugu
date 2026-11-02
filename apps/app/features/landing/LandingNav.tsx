import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, IconButton, Text, color } from "@gugu/design-system";

import { useSwitchLocale } from "@/services/i18n/useLocale";

import { StudioLogo } from "./StudioLogo";
import type { LandingNavActions } from "./useLandingNav";

/** Landing navbar: white pill (logo + anchor links) and actions; compact on phones. */
export function LandingNav({ nav, desktop }: { nav: LandingNavActions; desktop: boolean }) {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("a11y");
  const switchLocale = useSwitchLocale();
  const links = [
    {
      key: "features",
      label: t("nav.features"),
      onPress: () => {
        nav.scrollTo("features");
      },
    },
    {
      key: "pricing",
      label: t("nav.pricing"),
      onPress: () => {
        nav.scrollTo("pricing");
      },
    },
    {
      key: "marketplace",
      label: t("nav.marketplace"),
      onPress: () => {
        nav.scrollTo("marketplace");
      },
    },
  ];
  return (
    <View
      className="z-10 mx-4 mt-3 h-16 flex-row items-center rounded-full bg-white pl-5 pr-2 min-[900px]:mx-auto min-[900px]:mt-4 min-[900px]:h-[72px] min-[900px]:w-full min-[900px]:max-w-[1240px] min-[900px]:pl-7 min-[900px]:pr-3"
      style={{
        shadowColor: color.ink,
        shadowOpacity: 0.05,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={ta("home")}
        onPress={nav.top}
        className="flex-1 min-[900px]:flex-none"
      >
        <StudioLogo height={desktop ? 36 : 30} />
      </Pressable>
      {desktop ? (
        <View className="flex-1 flex-row justify-center gap-9">
          {links.map((l) => (
            <Pressable key={l.key} accessibilityRole="link" onPress={l.onPress}>
              {(s) => (
                <Text
                  role="uiMedium"
                  size={16}
                  color={(s as { hovered?: boolean }).hovered === true ? color.lilac700 : color.ink}
                >
                  {l.label}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center gap-2 min-[900px]:gap-3">
        <IconButton
          size={desktop ? 48 : 44}
          onPress={switchLocale}
          accessibilityLabel={ta("switchLanguage")}
        >
          <Text role="uiSemiBold" size={13}>
            {tc("language.switchTo")}
          </Text>
        </IconButton>
        {desktop ? (
          <Button
            variant="outline"
            label={t("nav.signIn")}
            onPress={nav.signIn}
            height={48}
            fontSize={16}
            paddingX={20}
          />
        ) : null}
        <Button
          label={desktop ? t("nav.trial") : t("nav.trialShort")}
          onPress={nav.trial}
          height={desktop ? 48 : 44}
          fontSize={desktop ? 16 : 15}
          paddingX={desktop ? 22 : 16}
        />
      </View>
    </View>
  );
}
