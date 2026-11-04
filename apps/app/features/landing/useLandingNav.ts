import { useRef, type RefObject } from "react";
import { useRouter } from "expo-router";

import { useLocale } from "@/services/i18n/useLocale";

export type LandingAnchor = "story" | "features" | "pricing" | "cases";
type Scrollable = { scrollTo: (o: { y: number; animated: boolean }) => void };

/** Landing actions: in-page anchors (scroll) and routes to the business sign-up / sign-in. */
export function useLandingNav(scroll: RefObject<Scrollable | null>) {
  const router = useRouter();
  const locale = useLocale();
  const offsets = useRef<Partial<Record<LandingAnchor, number>>>({});
  return {
    onAnchorY: (id: LandingAnchor, y: number) => {
      offsets.current[id] = y;
    },
    scrollTo: (id: LandingAnchor) => {
      // Web flow: sections inside the DOM story expose ids (e.g. #fl-features) instead of RN anchors.
      const el = typeof document === "undefined" ? null : document.getElementById(`fl-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[id] ?? 0) - 8), animated: true });
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
