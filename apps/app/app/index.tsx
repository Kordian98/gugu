import { Redirect } from "expo-router";

import { DEFAULT_LOCALE } from "@gugu/contracts";

// Entry without a locale (native launch, bare domain). Topic 03 replaces DEFAULT_LOCALE
// with the persisted preference on native and Accept-Language/cookie on web.
export default function Index() {
  return <Redirect href={`/${DEFAULT_LOCALE}`} />;
}
