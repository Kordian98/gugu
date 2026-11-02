import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, GradientText, Text, color, font, gradient } from "@gugu/design-system";

import { Diorama } from "@/features/hero/Diorama";
import { SelfLoveAccent } from "@/features/hero/SelfLoveAccent";

import type { LandingNavActions } from "./useLandingNav";

/**
 * SaaS hero for salon owners: headline + CTAs left, the living diorama right (desktop).
 * Phones: headline and CTAs first so the trial CTA is above the fold, then the diorama.
 */
export function LandingHero({
  nav,
  desktop,
  width,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
}) {
  const { t } = useTranslation("landing");
  const { t: tm } = useTranslation("marketing");
  const size = desktop ? Math.min(84, Math.max(56, width * 0.05)) : Math.min(46, width * 0.115);
  const dioramaW = desktop ? Math.min(width * 0.68, 1400) : width * 1.12;
  const title = (
    <View accessibilityRole="header">
      <Text role="display" size={size} lineHeight={size * 1.04}>
        {t("hero.titleStart")}
        {"\n"}
        <GradientText
          colors={gradient.glowHere}
          style={{ fontFamily: font.display, fontSize: size, letterSpacing: -size * 0.035 }}
        >
          {t("hero.titleAccent")}
        </GradientText>
      </Text>
    </View>
  );
  const ctas = (
    <View className="gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-4">
      <Button
        label={t("hero.trialCta")}
        onPress={nav.trial}
        height={desktop ? 64 : 54}
        fontSize={desktop ? 18 : 16}
        paddingX={desktop ? 34 : 24}
        trailingArrow
      />
      <Button
        variant="outline"
        label={t("hero.howCta")}
        onPress={() => {
          nav.scrollTo("features");
        }}
        height={desktop ? 64 : 54}
        fontSize={desktop ? 17 : 16}
        paddingX={desktop ? 30 : 24}
      />
    </View>
  );
  if (!desktop) {
    return (
      <View>
        <View className="gap-4 px-4 pt-6">
          <Text role="eyebrow" size={11.5}>
            {t("hero.eyebrow")}
          </Text>
          {title}
          {ctas}
        </View>
        <View
          className="mt-2 items-center overflow-hidden"
          style={{ height: dioramaW * (980 / 1388) }}
        >
          <Diorama width={dioramaW} fadeEdges={false} small />
        </View>
        <View className="gap-3 px-4">
          <Text size={16.5} lineHeight={25} color={color.ink2}>
            {t("hero.subtitle")}
          </Text>
          <Text size={13} color={color.muted}>
            {t("hero.trialNote")}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ minHeight: dioramaW * (980 / 1388) * 0.86 }}>
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", right: -width * 0.015, top: -88 }}
      >
        <Diorama width={dioramaW} />
      </View>
      <View className="mx-auto w-full max-w-[1240px] px-10 pt-16" pointerEvents="box-none">
        <View className="max-w-[560px] gap-6" style={{ zIndex: 2 }}>
          <Text role="eyebrow" size={14}>
            {t("hero.eyebrow")}
          </Text>
          {title}
          <Text size={20} lineHeight={30} color={color.ink2}>
            {t("hero.subtitle")}
          </Text>
          {ctas}
          <Text size={14} color={color.muted}>
            {t("hero.trialNote")}
          </Text>
          <View style={{ marginTop: 8, marginLeft: -8 }} pointerEvents="none">
            <SelfLoveAccent text={tm("home.accent.selfLove")} size={30} />
          </View>
        </View>
      </View>
    </View>
  );
}
