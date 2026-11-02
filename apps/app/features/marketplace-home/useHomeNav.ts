import { useRouter } from "expo-router";

import { useLocale } from "@/services/i18n/useLocale";

import { SEARCH_DEFAULTS, type CategoryId } from "./data";

/** Navigation targets for every homepage action (all routes are locale-prefixed). */
export function useHomeNav() {
  const router = useRouter();
  const locale = useLocale();
  const go = (path: string) => {
    router.push(`/${locale}${path}` as never);
  };
  return {
    explore: () => {
      go("/search");
    },
    findMyGlow: (tab: "book" | "find") => {
      const q = new URLSearchParams(
        tab === "book"
          ? { ...SEARCH_DEFAULTS, mode: "book" }
          : { province: SEARCH_DEFAULTS.province, mode: "salons" },
      );
      go(`/search?${q.toString()}`);
    },
    searchField: (field: "location" | "service" | "when") => {
      go(`/search?focus=${field}`);
    },
    category: (id: CategoryId) => {
      go(`/c/${id}`);
    },
    salon: (slug: string) => {
      go(`/salon/${slug}`);
    },
    viewAll: () => {
      go("/search");
    },
    signIn: () => {
      go("/sign-in");
    },
    signUp: () => {
      go("/sign-up");
    },
    businessJoin: () => {
      go("/business/join");
    },
    home: () => {
      router.replace(`/${locale}` as never);
    },
  };
}

export type HomeNav = ReturnType<typeof useHomeNav>;
