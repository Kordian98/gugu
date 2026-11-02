import enA11y from "../locales/en/a11y.json";
import enAuth from "../locales/en/auth.json";
import enCommon from "../locales/en/common.json";
import enCrm from "../locales/en/crm.json";
import enEmail from "../locales/en/email.json";
import enLanding from "../locales/en/landing.json";
import enMarketing from "../locales/en/marketing.json";
import viA11y from "../locales/vi/a11y.json";
import viAuth from "../locales/vi/auth.json";
import viCommon from "../locales/vi/common.json";
import viCrm from "../locales/vi/crm.json";
import viEmail from "../locales/vi/email.json";
import viLanding from "../locales/vi/landing.json";
import viMarketing from "../locales/vi/marketing.json";

/** Dictionaries are bundled statically (topic 03 §4). vi is the source of truth for keys. */
export const resources = {
  vi: {
    common: viCommon,
    marketing: viMarketing,
    a11y: viA11y,
    auth: viAuth,
    email: viEmail,
    crm: viCrm,
    landing: viLanding,
  },
  en: {
    common: enCommon,
    marketing: enMarketing,
    a11y: enA11y,
    auth: enAuth,
    email: enEmail,
    crm: enCrm,
    landing: enLanding,
  },
} as const;

export const NAMESPACES = [
  "common",
  "marketing",
  "a11y",
  "auth",
  "email",
  "crm",
  "landing",
] as const;
export type Namespace = (typeof NAMESPACES)[number];
export type Resources = (typeof resources)["vi"];
