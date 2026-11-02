import { useRef } from "react";
import { Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import {
  Button,
  CategoryTile,
  GradientText,
  Icon,
  IconButton,
  Logo,
  Surface,
  Text,
  color,
  font,
  gradient,
} from "@gugu/design-system";

import { useSwitchLocale } from "@/services/i18n/useLocale";

import { CATEGORY_ICON, IMG } from "../assets";
import { CATEGORY_IDS, DEMO_SALONS } from "../data";
import { Diorama } from "../hero/Diorama";
import { Float } from "../hero/Float";
import { Carousel, type CarouselHandle } from "../sections/Carousel";
import { GlowCard } from "../sections/GlowCard";
import { SalonCard } from "../sections/SalonCard";
import { SearchCard } from "../sections/SearchCard";
import { SocialProofContent } from "../sections/SocialProof";
import { useFavorites } from "../useFavorites";
import type { HomeNav } from "../useHomeNav";

const G = 16; // page gutter
const NAV_H = 64;
const OVERLAP = 40; // search card overlaps the hero bottom

/**
 * Mobile homepage (owner decision): navbar → living diorama → search card, with the search card fully
 * above the fold on 360×740 … 430×932. No hero copy block on mobile; desktop keeps the ref-01 layout.
 */
export function MobileHome({
  width,
  height,
  nav,
}: {
  width: number;
  height: number;
  nav: HomeNav;
}) {
  const { t } = useTranslation("marketing");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("a11y");
  const insets = useSafeAreaInsets();
  const switchLocale = useSwitchLocale();
  const favs = useFavorites();
  const spots = useRef<CarouselHandle>(null);
  const cardW = width - 2 * G;
  const cardH = cardW * (352 / 383);
  // Hero fills what is left above the card (never taller than the diorama's natural 118 %-width crop).
  const natural = width * 1.18 * (980 / 1388);
  const available = height - insets.top - (NAV_H + 20) - cardH + OVERLAP - 16;
  const heroH = Math.max(200, Math.min(natural, available));
  const dioramaW = heroH * (1388 / 980);
  const salonW = width * 0.82;
  return (
    <View
      style={{
        backgroundColor: color.canvas,
        paddingTop: insets.top,
        paddingBottom: 56 + insets.bottom,
      }}
    >
      <View
        style={{
          marginHorizontal: G,
          marginTop: 10,
          height: NAV_H,
          borderRadius: NAV_H / 2,
          backgroundColor: color.white,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 20,
          paddingRight: 10,
          zIndex: 3,
          shadowColor: color.ink,
          shadowOpacity: 0.05,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={ta("home")}
          onPress={nav.home}
          style={{ flex: 1 }}
        >
          <Logo height={36} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconButton size={44} onPress={switchLocale} accessibilityLabel={ta("switchLanguage")}>
            <Text role="uiSemiBold" size={13}>
              {tc("language.switchTo")}
            </Text>
          </IconButton>
          <IconButton size={44} onPress={nav.explore} accessibilityLabel={ta("search")}>
            <Icon name="search" size={20} />
          </IconButton>
          <Button
            label={tc("nav.getStarted")}
            onPress={nav.signUp}
            height={44}
            fontSize={15}
            paddingX={18}
          />
        </View>
      </View>

      <View style={{ height: heroH, marginTop: 6, overflow: "hidden", alignItems: "center" }}>
        <View style={{ width: dioramaW, marginLeft: Math.min(0, width - dioramaW) * 0.1 }}>
          <Diorama width={dioramaW} fadeEdges={false} small />
        </View>
      </View>
      <View style={{ marginTop: -OVERLAP, marginHorizontal: G, zIndex: 2 }}>
        <SearchCard width={cardW} nav={nav} />
      </View>

      <Carousel itemWidth={118} gap={10} padding={G} style={{ marginTop: 22 }}>
        {CATEGORY_IDS.map((id, i) => (
          <CategoryTile
            key={id}
            label={t(`home.categories.${id}`)}
            icon={CATEGORY_ICON[id]}
            active={i === 0}
            width={118}
            height={118}
            onPress={() => {
              nav.category(id);
            }}
          />
        ))}
      </Carousel>

      <View style={{ marginHorizontal: G, marginTop: 10, height: 150 }}>
        <Surface
          variant="card"
          radius={26}
          style={{ position: "absolute", left: 0, top: 0, width: "74%", height: 150, padding: 16 }}
        >
          <SocialProofContent k={0.68} />
        </Surface>
        <Float
          style={{ position: "absolute", right: -6, top: -4, width: 150, height: 138 }}
          amplitude={8}
        >
          <Image
            source={IMG.heart3d}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </Float>
      </View>

      <View style={{ marginHorizontal: G, marginTop: 40 }}>
        <Text role="eyebrow" size={11} style={{ fontFamily: font.uiSemiBold, letterSpacing: 2.4 }}>
          {t("home.spots.eyebrow")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 8 }}>
          <View style={{ flex: 1 }} accessibilityRole="header">
            <Text role="display" size={38} lineHeight={42}>
              {t("home.spots.title")}
            </Text>
          </View>
          <Image source={IMG.crown} style={{ width: 36, height: 36, marginTop: 4 }} />
        </View>
        <Button
          variant="outline"
          label={t("home.spots.viewAll")}
          onPress={nav.viewAll}
          height={44}
          fontSize={14}
          trailingArrow
          style={{ alignSelf: "flex-start", marginTop: 14 }}
        />
      </View>
      <Carousel ref={spots} itemWidth={salonW} gap={14} padding={G} style={{ marginTop: 8 }}>
        {DEMO_SALONS.map((s) => (
          <SalonCard
            key={s.slug}
            salon={s}
            width={salonW}
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

      <View style={{ marginHorizontal: G, marginTop: 40 }}>
        <Text role="eyebrow" size={11} style={{ letterSpacing: 2.2 }}>
          {t("home.glow.eyebrow")}
        </Text>
        <View accessibilityRole="header" style={{ marginTop: 8 }}>
          <Text role="display" size={50} lineHeight={56}>
            {t("home.glow.titleStart")}
            {"\n"}
            <GradientText
              colors={gradient.glowUp}
              style={{ fontFamily: font.display, fontSize: 50, letterSpacing: -1.75 }}
            >
              {t("home.glow.titleAccent")}
            </GradientText>
          </Text>
        </View>
      </View>
      <Carousel itemWidth={width * 0.86} gap={12} padding={G} style={{ marginTop: 6 }}>
        {[0, 1, 2].map((i) => (
          <GlowCard
            key={i}
            index={i as 0 | 1 | 2}
            width={width * 0.86}
            height={(width * 0.86) / 1.64}
            size={18}
            caption={t(`home.glow.card${String(i + 1) as "1" | "2" | "3"}`)}
            onPress={nav.viewAll}
          />
        ))}
      </Carousel>
    </View>
  );
}
