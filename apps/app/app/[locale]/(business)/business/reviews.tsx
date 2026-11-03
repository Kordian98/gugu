import { Redirect, useLocalSearchParams } from "expo-router";

/** Reviews arrive with topic 11; until then the page is hidden from the nav and redirects home. */
export default function Screen() {
  const { locale } = useLocalSearchParams<{ locale?: string }>();
  return <Redirect href={`/${locale ?? "vi"}/business` as never} />;
}
