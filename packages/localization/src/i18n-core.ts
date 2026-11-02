import i18next, { type i18n } from "i18next";

import { DEFAULT_LOCALE, LOCALES, type AppLocale } from "./locales";
import { NAMESPACES, resources } from "./resources";

/** Platform-agnostic i18next factory shared by the app and (later) the API. */
export function createI18n(locale: AppLocale = DEFAULT_LOCALE): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    resources,
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
  return instance;
}
