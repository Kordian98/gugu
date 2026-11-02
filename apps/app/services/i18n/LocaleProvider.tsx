import { useMemo, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { createI18n, type AppLocale } from "@gugu/localization";

/** Binds i18next to the `[locale]` route segment (the URL is the source of truth on web). */
export function LocaleProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const i18n = useMemo(() => createI18n(locale), [locale]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
