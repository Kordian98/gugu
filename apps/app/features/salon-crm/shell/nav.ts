import type { IconName } from "@gugu/design-system";

export type NavItemId =
  | "overview"
  | "calendar"
  | "appointments"
  | "customers"
  | "services"
  | "team"
  | "resources"
  | "reviews"
  | "insights"
  | "settings";

export type NavSectionId = "workspace" | "growth" | "business" | "system";

export type NavItem = {
  id: NavItemId;
  icon: IconName;
  path: string;
  /** Hidden for members without it (UX only; the API enforces). */
  permission?: "members.read";
};

/**
 * Workspace navigation (07 §3.1, owner decision: only features in GuGu's scope, no "soon" entries).
 * Role filtering arrives with the session/permission model (05); the API enforces access regardless.
 */
export const NAV: { id: NavSectionId; items: NavItem[] }[] = [
  {
    id: "workspace",
    items: [
      { id: "overview", icon: "home", path: "/business" },
      { id: "calendar", icon: "calendar", path: "/business/calendar" },
      { id: "appointments", icon: "clipboard", path: "/business/appointments" },
      { id: "customers", icon: "users", path: "/business/customers" },
      { id: "services", icon: "tag", path: "/business/services" },
      { id: "team", icon: "team", path: "/business/team", permission: "members.read" },
      { id: "resources", icon: "box", path: "/business/resources" },
    ],
  },
  { id: "growth", items: [{ id: "reviews", icon: "star", path: "/business/reviews" }] },
  { id: "business", items: [{ id: "insights", icon: "chart", path: "/business/insights" }] },
  { id: "system", items: [{ id: "settings", icon: "settings", path: "/business/settings" }] },
];

/** Mobile bottom tabs; everything else is under "More". */
export const TABS: NavItemId[] = ["overview", "calendar", "customers"];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);
