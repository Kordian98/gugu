import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, IconButton, Logo, Text, color } from "@gugu/design-system";

import { useSwitchLocale } from "@/services/i18n/useLocale";

import type { LandingAnchor, LandingNavActions } from "./useLandingNav";

const LINKS: LandingAnchor[] = ["story", "features", "pricing"];

/** Floating pill navbar: official gugu logo only (owner: no "Studio" in the navbar), anchor links (desktop), language, sign in, trial. */
export function LandingNav({ nav, desktop }: { nav: LandingNavActions; desktop: boolean }) {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("a11y");
  const switchLocale = useSwitchLocale();
  return (
    <View
      className="z-10 mx-4 mt-3 h-16 flex-row items-center rounded-full bg-white pl-5 pr-2 min-[900px]:mx-auto min-[900px]:mt-5 min-[900px]:h-[68px] min-[900px]:w-full min-[900px]:max-w-[1240px] min-[900px]:pl-7 min-[900px]:pr-3"
      style={{
        shadowColor: color.ink,
        shadowOpacity: 0.06,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={ta("home")}
        onPress={nav.top}
        className="flex-1 min-[900px]:flex-none"
      >
        <Logo height={desktop ? 34 : 30} variant="color" />
      </Pressable>
      {desktop ? (
        <View className="flex-1 flex-row justify-center gap-9">
          {LINKS.map((k) => (
            <Pressable
              key={k}
              accessibilityRole="link"
              onPress={() => {
                nav.scrollTo(k);
              }}
            >
              {(s) => (
                <Text
                  role="uiMedium"
                  size={15.5}
                  color={(s as { hovered?: boolean }).hovered === true ? color.lilac700 : color.ink}
                >
                  {t(`nav.${k}`)}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center gap-2 min-[900px]:gap-3">
        <IconButton
          size={desktop ? 46 : 42}
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
            height={46}
            fontSize={15.5}
            paddingX={20}
          />
        ) : null}
        <Button
          label={desktop ? t("nav.trial") : t("nav.trialShort")}
          onPress={nav.trial}
          height={desktop ? 46 : 42}
          fontSize={desktop ? 15.5 : 14.5}
          paddingX={desktop ? 22 : 16}
        />
      </View>
    </View>
  );
}
