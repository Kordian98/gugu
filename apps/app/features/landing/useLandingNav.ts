import { useRef, type ComponentRef, type RefObject } from "react";
import type { ScrollView } from "react-native";
import { useRouter } from "expo-router";

import { useLocale } from "@/services/i18n/useLocale";

export type LandingAnchor = "features" | "pricing" | "marketplace" | "faq";

/** Landing actions: in-page anchors (scroll) and routes to the business sign-up / sign-in. */
export function useLandingNav(scroll: RefObject<ComponentRef<typeof ScrollView> | null>) {
  const router = useRouter();
  const locale = useLocale();
  const offsets = useRef<Partial<Record<LandingAnchor, number>>>({});
  return {
    onAnchorY: (id: string, y: number) => {
      offsets.current[id as LandingAnchor] = y;
    },
    scrollTo: (id: LandingAnchor) => {
      scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[id] ?? 0) - 16), animated: true });
    },
    top: () => {
      scroll.current?.scrollTo({ y: 0, animated: true });
    },
    trial: () => {
      router.push(`/${locale}/business/join` as never);
    },
    signIn: () => {
      router.push(`/${locale}/sign-in` as never);
    },
  };
}

export type LandingNavActions = ReturnType<typeof useLandingNav>;
