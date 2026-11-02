import { Slot, Unmatched, useLocalSearchParams } from "expo-router";

import { isLocale } from "@gugu/localization";

import { LocaleProvider } from "@/services/i18n/LocaleProvider";

// Validates the [locale] segment (unknown locales render 404, topic 10 §3.1) and binds i18n to it.
export default function LocaleLayout() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  if (!isLocale(locale)) return <Unmatched />;
  return (
    <LocaleProvider locale={locale}>
      <Slot />
    </LocaleProvider>
  );
}
