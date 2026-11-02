import { useRef, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";

import { color } from "@gugu/design-system";

import { useViewport } from "@/services/viewport/useViewport";

import { Faq } from "./Faq";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { LandingHero } from "./LandingHero";
import { LandingNav } from "./LandingNav";
import { Marketplace } from "./Marketplace";
import { Pricing } from "./Pricing";
import { Anchor } from "./Section";
import { useLandingNav } from "./useLandingNav";

/**
 * SaaS landing page for salon owners (X19). Light only (X18). Before hydration completes the desktop
 * variant is rendered at a reference width (SSR-safe); real width applies right after mount.
 */
export function LandingScreen() {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nav = useLandingNav(scroll);
  const { mounted, width } = useViewport();
  const w = mounted ? width : 1440;
  const desktop = w >= 900;
  return (
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={{ overflow: "hidden" }}>
        <LandingNav nav={nav} desktop={desktop} />
        <LandingHero nav={nav} desktop={desktop} width={w} />
      </View>
      <Anchor id="features" onY={nav.onAnchorY}>
        <Features columns={w >= 1100 ? 3 : w >= 700 ? 2 : 1} />
      </Anchor>
      <Anchor id="pricing" onY={nav.onAnchorY}>
        <Pricing nav={nav} stacked={w < 1000} />
      </Anchor>
      <Anchor id="marketplace" onY={nav.onAnchorY}>
        <Marketplace stacked={w < 1000} />
      </Anchor>
      <Anchor id="faq" onY={nav.onAnchorY}>
        <Faq />
      </Anchor>
      <Footer nav={nav} />
    </ScrollView>
  );
}
