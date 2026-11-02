import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Button, HandDrawnHeart, IconButton, Logo, Text, color } from "@gugu/design-system";

import { useLocale, useSwitchLocale } from "@/services/i18n/useLocale";

/** Designed placeholder for routes linked from the homepage that are not built yet. */
export function ComingSoonScreen({ title }: { title: string }) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("a11y");
  const locale = useLocale();
  const router = useRouter();
  const switchLocale = useSwitchLocale();
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="flex-grow items-center justify-center p-6"
    >
      <View
        className="w-full max-w-[520px] items-center gap-5 rounded-[32px] bg-white px-8 py-12"
        style={{ borderWidth: 1, borderColor: color.lineSoft }}
      >
        <View style={{ position: "absolute", right: 16, top: 16 }}>
          <IconButton size={44} onPress={switchLocale} accessibilityLabel={ta("switchLanguage")}>
            <Text role="uiSemiBold" size={13}>
              {t("language.switchTo")}
            </Text>
          </IconButton>
        </View>
        <View accessible accessibilityLabel={ta("home")}>
          <Logo height={54} />
        </View>
        <Text role="eyebrow" size={13}>
          {t("comingSoon.eyebrow")}
        </Text>
        <Text role="display" size={44} lineHeight={48} style={{ textAlign: "center" }}>
          {title}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text size={16} color={color.body} style={{ textAlign: "center", maxWidth: 360 }}>
            {t("comingSoon.body")}
          </Text>
          <HandDrawnHeart size={20} color={color.script} />
        </View>
        <Button
          label={t("comingSoon.back")}
          onPress={() => {
            router.replace(`/${locale}`);
          }}
          height={52}
          fontSize={16}
          trailingArrow
        />
      </View>
    </ScrollView>
  );
}
