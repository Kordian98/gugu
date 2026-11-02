import enA11y from "../locales/en/a11y.json";
import enCommon from "../locales/en/common.json";
import enMarketing from "../locales/en/marketing.json";
import viA11y from "../locales/vi/a11y.json";
import viCommon from "../locales/vi/common.json";
import viMarketing from "../locales/vi/marketing.json";

/** Dictionaries are bundled statically (topic 03 §4). vi is the source of truth for keys. */
export const resources = {
  vi: { common: viCommon, marketing: viMarketing, a11y: viA11y },
  en: { common: enCommon, marketing: enMarketing, a11y: enA11y },
} as const;

export const NAMESPACES = ["common", "marketing", "a11y"] as const;
export type Namespace = (typeof NAMESPACES)[number];
export type Resources = (typeof resources)["vi"];
