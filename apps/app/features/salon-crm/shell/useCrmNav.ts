import { usePathname, useRouter } from "expo-router";

import { useLocale } from "@/services/i18n/useLocale";

import { useOptionalSalon } from "../data/SalonContext";
import { ALL_ITEMS, NAV, type NavItem, type NavItemId } from "./nav";

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

/** Navigation the current member may see (role-aware, 07 §3.1). Outside a salon (demo) everything. */
export function useVisibleNav() {
  const salon = useOptionalSalon();
  const visible = (i: NavItem) =>
    !i.permission || !salon?.summary || salon.summary.myPermissions.includes(i.permission);
  return {
    sections: NAV.map((s) => ({ ...s, items: s.items.filter(visible) })).filter(
      (s) => s.items.length > 0,
    ),
    items: ALL_ITEMS.filter(visible),
  };
}
