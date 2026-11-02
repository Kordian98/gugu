import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { IconButton, Logo, Text, color } from "@gugu/design-system";

import { useLocale, useSwitchLocale } from "@/services/i18n/useLocale";

/** Shared frame for sign-in, verification and salon join: logo, language switch, one card. */
export function AuthCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("a11y");
  const locale = useLocale();
  const router = useRouter();
  const switchLocale = useSwitchLocale();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="flex-grow items-center justify-center px-4 py-10"
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="w-full gap-5 rounded-[32px] bg-white px-6 py-10"
          style={{ maxWidth: wide ? 640 : 460, borderWidth: 1, borderColor: color.lineSoft }}
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={ta("home")}
              onPress={() => {
                router.replace(`/${locale}`);
              }}
            >
              <Logo height={40} />
            </Pressable>
            <IconButton size={44} onPress={switchLocale} accessibilityLabel={ta("switchLanguage")}>
              <Text role="uiSemiBold" size={13}>
                {t("language.switchTo")}
              </Text>
            </IconButton>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
