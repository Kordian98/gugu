import { Slot, Unmatched, useLocalSearchParams } from "expo-router";

import { localeSchema } from "@gugu/contracts";

// Validates the [locale] segment. Unknown locales render 404 (topic 10 §3.1).
export default function LocaleLayout() {
  const { locale } = useLocalSearchParams<{ locale: string }>();
  if (!localeSchema.safeParse(locale).success) {
    return <Unmatched />;
  }
  return <Slot />;
}
