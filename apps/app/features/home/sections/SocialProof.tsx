import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { AvatarGroup, Text, color } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { IMG } from "../assets";

/** "10K+ / Self care looks good on you." card content (avatars pill + serif quote). Sizes in px via k. */
export function SocialProofContent({ k }: { k: number }) {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const p = (v: number) => v * k;
  const fs = p(locale === "vi" ? 24 : 26);
  const lh = p(locale === "vi" ? 27 : 26);
  return (
    <View style={{ gap: p(16) }}>
      <AvatarGroup
        image={IMG.avatars}
        count={t("home.proof.count")}
        height={p(54)}
        imageWidth={p(120)}
      />
      <View style={{ paddingLeft: p(8) }}>
        <Text role="serifBold" size={fs} lineHeight={lh} style={{ letterSpacing: -fs * 0.02 }}>
          {t("home.proof.quoteBold")}
        </Text>
        <Text
          role="serif"
          size={fs}
          lineHeight={lh}
          color={color.ink}
          style={{ paddingLeft: p(17), letterSpacing: -fs * 0.02 }}
        >
          {t("home.proof.quoteMid")}
        </Text>
        <Text
          role="serifBold"
          size={fs}
          lineHeight={lh}
          style={{ paddingLeft: p(17), letterSpacing: -fs * 0.02 }}
        >
          {t("home.proof.quoteEnd")}
        </Text>
      </View>
    </View>
  );
}
