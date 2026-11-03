import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Logo, Text } from "@gugu/design-system";

import type { LandingAnchor, LandingNavActions } from "./useLandingNav";

const PRODUCT: LandingAnchor[] = ["story", "features", "pricing"];

/** Footer on plum: product anchors, account links, legal placeholders. */
export function Footer({ nav }: { nav: LandingNavActions }) {
  const { t } = useTranslation("landing");
  const link = (label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="link" onPress={onPress}>
      <Text size={15} color="#E2D2DC">
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View
      className="mt-6 px-4 pb-10 pt-14 min-[900px]:px-10"
      style={{ backgroundColor: "#1A0E18" }}
    >
      <View className="mx-auto w-full max-w-[1240px] gap-10">
        <View className="gap-10 min-[900px]:flex-row min-[900px]:justify-between">
          <View className="max-w-[380px] gap-4">
            <Logo height={32} variant="onDark" />
            <Text size={14.5} lineHeight={22} color="#BBA6B6">
              {t("footer.tagline")}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-12">
            <View className="gap-3">
              <Text role="eyebrow" size={12} color="#BBA6B6">
                {t("footer.product")}
              </Text>
              {PRODUCT.map((a) =>
                link(t(`nav.${a}`), () => {
                  nav.scrollTo(a);
                }),
              )}
            </View>
            <View className="gap-3">
              <Text role="eyebrow" size={12} color="#BBA6B6">
                {t("footer.account")}
              </Text>
              {link(t("nav.trial"), nav.trial)}
              {link(t("nav.signIn"), nav.signIn)}
            </View>
            <View className="gap-3">
              <Text role="eyebrow" size={12} color="#BBA6B6">
                {t("footer.legal")}
              </Text>
              <Text size={15} color="#8E7A8B">
                {t("footer.terms")}
              </Text>
              <Text size={15} color="#8E7A8B">
                {t("footer.privacy")}
              </Text>
            </View>
          </View>
        </View>
        <View
          className="pt-6"
          style={{ borderTopWidth: 1, borderTopColor: "rgba(255,230,245,0.12)" }}
        >
          <Text size={13} color="#8E7A8B">
            {t("footer.rights")}
          </Text>
        </View>
      </View>
    </View>
  );
}
