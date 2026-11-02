import { usePathname, useRouter } from "expo-router";

import { useLocale } from "@/services/i18n/useLocale";

import { ALL_ITEMS, type NavItemId } from "./nav";

/** Active nav item from the URL, and locale-aware navigation inside the workspace. */
export function useCrmNav() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const rest = pathname.replace(/^\/(vi|en)(?=\/|$)/, "") || "/";
  const active: NavItemId | null =
    [...ALL_ITEMS]
      .sort((a, b) => b.path.length - a.path.length)
      .find((i) => (i.path === "/business" ? rest === "/business" : rest.startsWith(i.path)))?.id ??
    null;
  const go = (path: string) => {
    router.push(`/${locale}${path}` as never);
  };
  return { active, go, locale };
}
