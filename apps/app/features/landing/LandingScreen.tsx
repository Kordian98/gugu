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
import { Flow } from "./flow/Flow";
import { StudioHero } from "./StudioHero";
import { useLandingNav } from "./useLandingNav";

/**
 * GuGu Studio landing (X22/X23): hero, then on web a photoreal scroll-scrubbed walk through one salon
 * (street → front desk pain → calm → treatment area features → back office → business types → switching;
 * CSS sticky + GSAP scrub), plans, final CTA. Light only (X18). Native and reduced motion → static
 * chapters + features + business types.
 */
export function LandingScreen() {
  // Plain ScrollView: no per-frame JS scroll handler. The web story pins with CSS sticky inside it.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nav = useLandingNav(scroll);
  const reduce = useReducedMotion();
  const { mounted, width } = useViewport();
  const w = mounted ? width : 1440;
  const desktop = w >= 900;
  // Web with motion: the photoreal walk (features and business types live inside it).
  const flow = Platform.OS === "web" && mounted && !reduce;
  return (
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: color.canvas }}>
      {flow ? (
        // Web flow: the hero is the door portal inside the Journey stage; the nav floats above it.
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
          <LandingNav nav={nav} desktop={desktop} />
        </View>
      ) : (
        <View style={{ overflow: "hidden" }}>
          <LandingNav nav={nav} desktop={desktop} />
          <StudioHero nav={nav} desktop={desktop} width={w} />
        </View>
      )}
      <Anchor id="story" onY={nav.onAnchorY}>
        {flow ? (
          <Flow nav={nav} desktop={desktop} width={w} />
        ) : (
          <StoryStatic width={w} desktop={desktop} />
        )}
      </Anchor>
      {flow ? null : (
        <>
          <Anchor id="features" onY={nav.onAnchorY}>
            <Features columns={w >= 1100 ? 3 : w >= 700 ? 2 : 1} />
          </Anchor>
          <Businesses columns={w >= 1100 ? 5 : w >= 700 ? 3 : 2} />
        </>
      )}
      <Anchor id="pricing" onY={nav.onAnchorY}>
        <Pricing nav={nav} stacked={w < 1000} />
      </Anchor>
      <FinalCta nav={nav} />
      <Footer nav={nav} />
    </ScrollView>
  );
}
