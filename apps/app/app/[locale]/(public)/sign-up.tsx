import { Redirect } from "expo-router";

import { toHref } from "@/features/auth/afterSignIn";
import { useLocale } from "@/services/i18n/useLocale";

// There are no customer accounts (X21/X23): "sign up" means creating a salon in GuGu Studio.
export default function SignUpRoute() {
  const locale = useLocale();
  return <Redirect href={toHref(`/${locale}/business/join`)} />;
}
