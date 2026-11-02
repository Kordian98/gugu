import { Image, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, GradientText, Icon, Text, color, font, gradient } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { IMG } from "../assets";
import { Diorama } from "@/features/hero/Diorama";
import { SelfLoveAccent } from "@/features/hero/SelfLoveAccent";
import { SearchCard } from "../sections/SearchCard";
import type { HomeNav } from "../useHomeNav";

const TRUST = [
  { key: "verified", icon: IMG.trustShield, x: 124, tx: 193 },
  { key: "easy", icon: IMG.trustCal, x: 325, tx: 396 },
  { key: "reviews", icon: IMG.trustStar, x: 510, tx: 579 },
] as const;

/** Desktop hero (ref-01 layout): copy left, living diorama right, search card overlapping its lower left. */
export function DesktopHero({ p, nav }: { p: (v: number) => number; nav: HomeNav }) {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const vi = locale === "vi";
  const h1 = {
    size: p(vi ? 58 : 102),
    lh: p(vi ? 80 : 103),
    top: p(vi ? 198 : 190),
    width: p(vi ? 600 : 700),
  };
  return (
    <>
      <View style={{ position: "absolute", left: p(660), top: 0 }}>
        <Diorama width={p(1388)} />
      </View>
      <View style={{ position: "absolute", left: p(117), top: p(160) }}>
        <Text role="eyebrow" size={p(14.5)}>
          {t("home.hero.eyebrow")}
        </Text>
      </View>
      <View
        style={{ position: "absolute", left: p(100), top: h1.top, width: h1.width }}
        accessibilityRole="header"
      >
        <Text role="display" size={h1.size} lineHeight={h1.lh}>
          {t("home.hero.titleStart")}{" "}
          <GradientText
            colors={gradient.glowHere}
            style={{ fontFamily: font.display, fontSize: h1.size, letterSpacing: -h1.size * 0.035 }}
          >
            {t("home.hero.titleAccent")}
          </GradientText>
        </Text>
      </View>
      <View style={{ position: "absolute", left: p(117), top: p(vi ? 386 : 410), width: p(560) }}>
        <Text size={p(vi ? 22 : 23)} lineHeight={p(33)} color={color.ink2}>
          {t("home.hero.subtitleStart")}
          <Text role="uiMedium" size={p(vi ? 22 : 23)} lineHeight={p(33)} color={color.ink2}>
            {t("home.hero.subtitleBold")}
          </Text>
          {t("home.hero.subtitleEnd")}
        </Text>
      </View>
      {/* CTA row: buttons size to their (localized) labels, 18 ref px apart as in ref-01 */}
      <View
        style={{
          position: "absolute",
          left: p(109),
          top: p(512),
          flexDirection: "row",
          gap: p(18),
        }}
      >
        <Button
          label={t("home.hero.exploreCta")}
          onPress={nav.explore}
          height={p(76)}
          radius={p(30)}
          paddingX={p(46)}
          fontSize={p(21)}
          trailingArrow
        />
        <Button
          variant="outline"
          label={t("home.hero.proCta")}
          onPress={nav.businessJoin}
          height={p(76)}
          radius={p(30)}
          paddingX={p(58)}
          fontSize={p(19.5)}
        />
      </View>
      {TRUST.map((tr) => (
        <View key={tr.key}>
          <View
            style={{
              position: "absolute",
              left: p(tr.x),
              top: p(633),
              width: p(58),
              height: p(58),
              borderRadius: p(29),
              backgroundColor: "#FAF8F4",
              borderWidth: p(1.5),
              borderColor: "#EAE2DF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image source={tr.icon} style={{ width: p(50), height: p(50) }} resizeMode="contain" />
          </View>
          <View style={{ position: "absolute", left: p(tr.tx), top: p(640) }}>
            <Text size={p(15.5)} lineHeight={p(22)} color={color.body}>
              {t(`home.trust.${tr.key}`)}
            </Text>
          </View>
        </View>
      ))}
      <View style={{ position: "absolute", left: p(104), top: p(704) }} pointerEvents="none">
        <SelfLoveAccent text={t("home.accent.selfLove")} size={p(33)} />
      </View>
      <View style={{ position: "absolute", left: p(745), top: p(568) }}>
        <SearchCard width={p(383)} nav={nav} />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={nav.viewAll}
        style={{
          position: "absolute",
          left: p(1348),
          top: p(888),
          width: p(160),
          alignItems: "center",
        }}
      >
        <Text
          role="uiSemiBold"
          size={p(12.5)}
          lineHeight={p(17)}
          style={{ textAlign: "center", letterSpacing: p(1.25), textTransform: "uppercase" }}
        >
          {t("home.hero.scroll")}
        </Text>
        <Icon name="chevronDown" size={p(18)} strokeWidth={2.4} />
      </Pressable>
    </>
  );
}
