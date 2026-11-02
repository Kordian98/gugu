import { useRef } from "react";
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  Button,
  CategoryTile,
  GradientText,
  Icon,
  IconButton,
  Surface,
  Text,
  color,
  font,
  gradient,
} from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { CATEGORY_ICON, IMG } from "../assets";
import { CATEGORY_IDS, DEMO_SALONS } from "../data";
import { Float } from "@/features/hero/Float";
import { Carousel, type CarouselHandle } from "../sections/Carousel";
import { GlowCard } from "../sections/GlowCard";
import { SalonCard } from "../sections/SalonCard";
import { SocialProofContent } from "../sections/SocialProof";
import type { HomeNav } from "../useHomeNav";
import type { useFavorites } from "../useFavorites";

const TILE_X = [98, 320, 541, 763, 985, 1210];
const GLOW = [
  { x: 552, w: 495 },
  { x: 1055, w: 393 },
  { x: 1455, w: 500 },
] as const;

/** Desktop sections below the hero: categories + social proof, spots carousel, glow-up strip. */
export function DesktopBelow({
  p,
  nav,
  favs,
}: {
  p: (v: number) => number;
  nav: HomeNav;
  favs: ReturnType<typeof useFavorites>;
}) {
  const { t } = useTranslation("marketing");
  const { t: ta } = useTranslation("a11y");
  const locale = useLocale();
  const vi = locale === "vi";
  const spots = useRef<CarouselHandle>(null);
  const glow = useRef<CarouselHandle>(null);
  const g2 = { size: p(vi ? 68 : 86), lh: p(vi ? 84 : 92) };
  return (
    <>
      {CATEGORY_IDS.map((id, i) => (
        <CategoryTile
          key={id}
          label={t(`home.categories.${id}`)}
          icon={CATEGORY_ICON[id]}
          active={i === 0}
          width={p(207)}
          height={p(185)}
          onPress={() => {
            nav.category(id);
          }}
          style={{ position: "absolute", left: p(TILE_X[i] ?? 0), top: p(980) }}
        />
      ))}
      <View
        style={{
          position: "absolute",
          left: p(1470),
          top: p(960),
          width: p(640),
          height: p(218),
          borderRadius: p(46),
          backgroundColor: "rgba(254,251,248,0.9)",
        }}
      />
      <Surface
        variant="glass"
        radius={p(34)}
        style={{ position: "absolute", left: p(1500), top: p(984), width: p(300), height: p(180) }}
      />
      <View style={{ position: "absolute", left: p(1530), top: p(996) }}>
        <SocialProofContent k={p(1)} />
      </View>
      <Float
        style={{
          position: "absolute",
          left: p(1800),
          top: p(944),
          width: p(235),
          height: p(235 * 0.92),
        }}
        depth={p(14)}
        duration={6000}
        delay={3000}
      >
        <Image
          source={IMG.heart3d}
          style={{ width: "100%", height: "100%" }}
          resizeMode="contain"
        />
      </Float>

      <View style={{ position: "absolute", left: p(113), top: p(1224) }}>
        <Text role="eyebrow" size={p(15)} style={{ fontFamily: font.uiSemiBold }}>
          {t("home.spots.eyebrow")}
        </Text>
      </View>
      <Image
        source={IMG.crown}
        style={{
          position: "absolute",
          left: p(vi ? 735 : 910),
          top: p(1210),
          width: p(54),
          height: p(54),
        }}
      />
      <View style={{ position: "absolute", left: p(100), top: p(1236) }} accessibilityRole="header">
        <Text role="display" size={p(70)} lineHeight={p(78)}>
          {t("home.spots.title")}
        </Text>
      </View>
      <IconButton
        size={p(52)}
        onPress={() => spots.current?.scrollBy(-1)}
        accessibilityLabel={ta("prev")}
        style={{ position: "absolute", left: p(1585), top: p(1255) }}
      >
        <Icon name="chevronLeft" size={p(18)} strokeWidth={2.2} />
      </IconButton>
      <IconButton
        size={p(52)}
        onPress={() => spots.current?.scrollBy(1)}
        accessibilityLabel={ta("next")}
        style={{ position: "absolute", left: p(1650), top: p(1255) }}
      >
        <Icon name="chevronRight" size={p(18)} strokeWidth={2.2} />
      </IconButton>
      <Button
        variant="outline"
        label={t("home.spots.viewAll")}
        onPress={nav.viewAll}
        height={p(70)}
        width={p(227)}
        fontSize={p(21)}
        trailingArrow
        style={{ position: "absolute", left: p(1722), top: p(1242) }}
      />
      <Carousel
        ref={spots}
        itemWidth={p(357)}
        gap={p(19)}
        style={{ position: "absolute", left: p(97), top: p(1326), width: p(1855) }}
      >
        {DEMO_SALONS.map((s) => (
          <SalonCard
            key={s.slug}
            salon={s}
            width={p(357)}
            saved={favs.isSaved(s.slug)}
            onToggleSave={() => {
              favs.toggle(s.slug);
            }}
            onOpen={() => {
              nav.salon(s.slug);
            }}
          />
        ))}
      </Carousel>

      <View
        style={{
          position: "absolute",
          left: p(70),
          top: p(1720),
          width: p(2100),
          height: p(420),
          borderRadius: p(54),
          backgroundColor: "rgba(255,255,255,0.72)",
        }}
      />
      <View style={{ position: "absolute", left: p(110), top: p(1774) }}>
        <Text role="eyebrow" size={p(15)} style={{ letterSpacing: p(3) }}>
          {t("home.glow.eyebrow")}
        </Text>
      </View>
      <View style={{ position: "absolute", left: p(103), top: p(1792) }} accessibilityRole="header">
        <Text role="display" size={g2.size} lineHeight={g2.lh}>
          {t("home.glow.titleStart")}
          {"\n"}
          <GradientText
            colors={gradient.glowUp}
            style={{ fontFamily: font.display, fontSize: g2.size, letterSpacing: -g2.size * 0.035 }}
          >
            {t("home.glow.titleAccent")}
          </GradientText>
        </Text>
      </View>
      <Carousel
        ref={glow}
        itemWidth={p(400)}
        gap={p(8)}
        style={{ position: "absolute", left: p(552), top: p(1710), width: p(1403) }}
      >
        {GLOW.map((g, i) => (
          <GlowCard
            key={g.x}
            index={i as 0 | 1 | 2}
            width={p(g.w)}
            height={p(302)}
            size={p(30)}
            caption={t(`home.glow.card${String(i + 1) as "1" | "2" | "3"}`)}
            onPress={nav.viewAll}
          />
        ))}
      </Carousel>
      <View
        style={{
          position: "absolute",
          left: p(1914),
          top: p(1824),
          width: p(84),
          height: p(84),
          borderRadius: p(42),
          backgroundColor: color.white,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: color.ink,
          shadowOpacity: 0.1,
          shadowRadius: p(25),
          shadowOffset: { width: 0, height: p(9) },
        }}
      >
        <IconButton
          size={p(56)}
          onPress={() => glow.current?.scrollBy(1)}
          accessibilityLabel={ta("next")}
        >
          <Icon name="chevronRight" size={p(20)} strokeWidth={2.2} />
        </IconButton>
      </View>
    </>
  );
}
