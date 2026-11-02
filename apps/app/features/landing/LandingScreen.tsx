import { useRef, type ComponentRef } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { color } from "@gugu/design-system";

import { useViewport } from "@/services/viewport/useViewport";

import { Businesses } from "./Businesses";
import { Features } from "./Features";
import { FinalCta } from "./FinalCta";
import { Footer } from "./Footer";
import { LandingNav } from "./LandingNav";
import { Pricing } from "./Pricing";
import { Anchor } from "./Section";
import { StoryStatic } from "./StoryStatic";
import { Story } from "./story/Story";
import { StudioHero } from "./StudioHero";
import { useLandingNav } from "./useLandingNav";

/**
 * GuGu Studio landing (X22/X23): hero, a pinned scroll story walking through the salon (pain → gain →
 * switching; web: CSS sticky + GSAP scrub), features, business types, plans, final CTA. Light only (X18).
 * Native and reduced motion → static chapters.
 */
export function LandingScreen() {
  // Plain ScrollView: no per-frame JS scroll handler. The web story pins with CSS sticky inside it.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nav = useLandingNav(scroll);
  const reduce = useReducedMotion();
  const { mounted, width } = useViewport();
  const w = mounted ? width : 1440;
  const desktop = w >= 900;
  return (
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={{ overflow: "hidden" }}>
        <LandingNav nav={nav} desktop={desktop} />
        <StudioHero nav={nav} desktop={desktop} width={w} />
      </View>
      <Anchor id="story" onY={nav.onAnchorY}>
        {Platform.OS === "web" && mounted && !reduce ? (
          <Story />
        ) : (
          <StoryStatic width={w} desktop={desktop} />
        )}
      </Anchor>
      <Anchor id="features" onY={nav.onAnchorY}>
        <Features columns={w >= 1100 ? 3 : w >= 700 ? 2 : 1} />
      </Anchor>
      <Businesses columns={w >= 1100 ? 5 : w >= 700 ? 3 : 2} />
      <Anchor id="pricing" onY={nav.onAnchorY}>
        <Pricing nav={nav} stacked={w < 1000} />
      </Anchor>
      <FinalCta nav={nav} />
      <Footer nav={nav} />
    </ScrollView>
  );
}
