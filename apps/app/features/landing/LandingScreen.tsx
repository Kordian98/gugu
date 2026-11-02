import { View } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";

import { color } from "@gugu/design-system";

import { useViewport } from "@/services/viewport/useViewport";

import { Businesses } from "./Businesses";
import { Features } from "./Features";
import { FinalCta } from "./FinalCta";
import { Footer } from "./Footer";
import { LandingNav } from "./LandingNav";
import { Pricing } from "./Pricing";
import { Anchor } from "./Section";
import { StoryScroll } from "./StoryScroll";
import { StoryStatic } from "./StoryStatic";
import { StudioHero } from "./StudioHero";
import { useLandingNav } from "./useLandingNav";

/**
 * GuGu Studio landing (X22/X23): Apple-style hero, pinned scroll story (dive into the salon → before →
 * after chapters with real CRM captures → AI assistant (Pro) → Zalo-to-booking finale), features,
 * business types, plans, final CTA. Light only (X18). Reduced motion → static chapters.
 */
export function LandingScreen() {
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const nav = useLandingNav(scroll);
  const scrollY = useSharedValue(0);
  const storyTop = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const reduce = useReducedMotion();
  const { mounted, width, height } = useViewport();
  const w = mounted ? width : 1440;
  const h = mounted ? height : 900;
  const desktop = w >= 900;
  return (
    <Animated.ScrollView
      ref={scroll}
      onScroll={onScroll}
      scrollEventThrottle={16}
      style={{ flex: 1, backgroundColor: color.canvas }}
    >
      <View style={{ overflow: "hidden" }}>
        <LandingNav nav={nav} desktop={desktop} />
        <StudioHero nav={nav} desktop={desktop} width={w} />
      </View>
      <Anchor
        id="story"
        onY={(id, y) => {
          storyTop.value = y;
          nav.onAnchorY(id, y);
        }}
      >
        {reduce || !mounted ? (
          <StoryStatic width={w} desktop={desktop} />
        ) : (
          <StoryScroll scrollY={scrollY} top={storyTop} width={w} height={h} desktop={desktop} />
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
    </Animated.ScrollView>
  );
}
