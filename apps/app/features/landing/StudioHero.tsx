import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, GradientText, Text, color, font } from "@gugu/design-system";

import { Diorama } from "@/features/hero/Diorama";
import { useLocale } from "@/services/i18n/useLocale";

import { screen, screenSize } from "./screens";
import type { LandingNavActions } from "./useLandingNav";

const G1 = ["#A68CF6", "#C99BEA", "#F08DB4"] as const;
const G2 = ["#F08DB4", "#F6A88A", "#F2C19A"] as const;

/** Apple-style hero: three-beat gradient headline, short subcopy, CTAs; living diorama with real CRM cards. */
export function StudioHero({
  nav,
  desktop,
  width,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
}) {
  const locale = useLocale();
  const dW = desktop ? Math.min(width * 0.58, 1100) : width * 1.15;
  const kpi = screenSize(locale, "kpis");
  const up = screenSize(locale, "upcoming");
  const kpiW = dW * 0.27;
  const upW = dW * 0.24;
  const copy = <HeroCopy nav={nav} desktop={desktop} width={width} />;
  const visual = (
    <View style={{ width: dW, height: (dW * 980) / 1388 }}>
      <Diorama width={dW} fadeEdges={false} small={!desktop} />
      <View
        style={{
          position: "absolute",
          left: dW * 0.02,
          top: dW * 0.02,
          width: kpiW,
          height: (kpiW * 4.1 * kpi.h) / kpi.w,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: color.white,
          shadowColor: color.ink,
          shadowOpacity: 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        <Image
          source={screen(locale, "kpis")}
          style={{ width: kpiW * 4.1, height: (kpiW * 4.1 * kpi.h) / kpi.w }}
          resizeMode="cover"
        />
      </View>
      <View
        style={{
          position: "absolute",
          right: dW * 0.03,
          bottom: dW * 0.02,
          width: upW,
          borderRadius: 14,
          overflow: "hidden",
          shadowColor: color.ink,
          shadowOpacity: 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        <Image
          source={screen(locale, "upcoming")}
          style={{ width: upW, height: (upW * up.h) / up.w }}
          resizeMode="cover"
        />
      </View>
    </View>
  );
  if (!desktop) {
    return (
      <View style={{ paddingTop: 28 }}>
        <View style={{ paddingHorizontal: 16 }}>{copy}</View>
        <View style={{ marginTop: 18, alignItems: "center", overflow: "hidden" }}>{visual}</View>
      </View>
    );
  }
  return (
    <View
      className="mx-auto w-full max-w-[1400px] flex-row items-center px-10 pb-10 pt-12"
      style={{ gap: 24 }}
    >
      <View style={{ flex: 1, minWidth: 460 }}>{copy}</View>
      {visual}
    </View>
  );
}

/** Hero copy (headline, subcopy, CTAs, note). Shared by the native hero and the web door hero (Journey). */
export function HeroCopy({
  nav,
  desktop,
  width,
  stacked = false,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
  /** Break all three headline beats onto their own lines (narrow column). */
  stacked?: boolean;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const size = desktop
    ? Math.min(92, Math.max(64, width * 0.054)) * (locale === "vi" ? 0.86 : 1)
    : Math.min(50, width * 0.125) * (locale === "vi" ? 0.86 : 1);
  const style = { fontFamily: font.display, fontSize: size, letterSpacing: -size * 0.035 };
  return (
    <View style={{ gap: desktop ? 26 : 18 }}>
      <View accessibilityRole="header">
        <Text role="display" size={size} lineHeight={size * 1.02}>
          <GradientText colors={G1} style={style}>
            {t("hero.line1")}
          </GradientText>
          {desktop && !stacked ? " " : "\n"}
          {t("hero.line2")}
          {"\n"}
          <GradientText colors={G2} style={style}>
            {t("hero.line3")}
          </GradientText>
        </Text>
      </View>
      <Text
        size={desktop ? 20 : 16.5}
        lineHeight={desktop ? 30 : 25}
        color={color.ink2}
        style={{ maxWidth: 560 }}
      >
        {t("hero.subtitle")}
      </Text>
      <View className="gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-4">
        <Button
          label={t("hero.trialCta")}
          onPress={nav.trial}
          height={desktop ? 60 : 52}
          fontSize={desktop ? 17 : 16}
          paddingX={32}
          trailingArrow
        />
        <Button
          variant="outline"
          label={t("hero.howCta")}
          onPress={() => {
            nav.scrollTo("story");
          }}
          height={desktop ? 60 : 52}
          fontSize={desktop ? 16.5 : 15.5}
          paddingX={28}
        />
      </View>
      <Text size={13.5} color={color.muted}>
        {t("hero.note")}
      </Text>
    </View>
  );
}
