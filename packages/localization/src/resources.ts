import enA11y from "../locales/en/a11y.json";
import enAdmin from "../locales/en/admin.json";
import enAuth from "../locales/en/auth.json";
import enCommon from "../locales/en/common.json";
import enCrm from "../locales/en/crm.json";
import enEmail from "../locales/en/email.json";
import enLanding from "../locales/en/landing.json";
import enMarketing from "../locales/en/marketing.json";
import enNotifications from "../locales/en/notifications.json";
import enPrivacy from "../locales/en/privacy.json";
import enZalo from "../locales/en/zalo.json";
import viA11y from "../locales/vi/a11y.json";
import viAdmin from "../locales/vi/admin.json";
import viAuth from "../locales/vi/auth.json";
import viCommon from "../locales/vi/common.json";
import viCrm from "../locales/vi/crm.json";
import viEmail from "../locales/vi/email.json";
import viLanding from "../locales/vi/landing.json";
import viMarketing from "../locales/vi/marketing.json";
import viNotifications from "../locales/vi/notifications.json";
import viPrivacy from "../locales/vi/privacy.json";
import viZalo from "../locales/vi/zalo.json";

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
    zalo: viZalo,
    admin: viAdmin,
    notifications: viNotifications,
    privacy: viPrivacy,
  },
  en: {
    common: enCommon,
    marketing: enMarketing,
    a11y: enA11y,
    auth: enAuth,
    email: enEmail,
    crm: enCrm,
    landing: enLanding,
    zalo: enZalo,
    admin: enAdmin,
    notifications: enNotifications,
    privacy: enPrivacy,
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
  "zalo",
  "admin",
  "notifications",
  "privacy",
] as const;
export type Namespace = (typeof NAMESPACES)[number];
export type Resources = (typeof resources)["vi"];
