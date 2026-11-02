import { useLocalSearchParams, usePathname, useRouter } from "expo-router";

import { DEFAULT_LOCALE, isLocale, type AppLocale } from "@gugu/localization";

/** Current locale from the `[locale]` route segment. */
export function useLocale(): AppLocale {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** Switches vi ⇄ en while staying on the same route (and keeping the query string on web). */
export function useSwitchLocale(): () => void {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return () => {
    const next: AppLocale = locale === "vi" ? "en" : "vi";
    const rest = pathname.replace(/^\/(vi|en)(?=\/|$)/, "");
    const search =
      typeof window !== "undefined" && typeof window.location === "object"
        ? window.location.search
        : "";
    router.replace(`/${next}${rest}${search}` as never);
  };
}
