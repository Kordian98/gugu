import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Button, Text, color } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { afterSignInHref } from "./afterSignIn";
import { AuthCard } from "./AuthCard";

/** Landing page of the emailed magic link: exchanges the token once, then redirects. */
export function VerifyScreen() {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const router = useRouter();
  const auth = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const validToken = typeof token === "string" && token.length >= 32 ? token : null;
  const [rejected, setRejected] = useState(false);
  const failed = rejected || validToken === null;
  const started = useRef(false);

  useEffect(() => {
    if (started.current || validToken === null) return;
    started.current = true;
    auth
      .verify({ token: validToken })
      .then((session) => {
        router.replace(
          afterSignInHref(session.user, session.redirectPath ?? `/${locale}/business`),
        );
      })
      .catch(() => {
        setRejected(true);
      });
  }, [validToken, auth, router, locale]);

  return (
    <AuthCard>
      {failed ? (
        <>
          <Text role="display" size={40} lineHeight={44}>
            {t("verify.failedTitle")}
          </Text>
          <Text size={16} color={color.body}>
            {t("verify.failedBody")}
          </Text>
          <Button
            label={t("verify.retry")}
            onPress={() => {
              router.replace(`/${locale}/sign-in`);
            }}
            height={52}
            fontSize={16}
          />
        </>
      ) : (
        <>
          <ActivityIndicator color={color.lilac700} />
          <Text size={16} color={color.body} style={{ textAlign: "center" }}>
            {t("verify.working")}
          </Text>
        </>
      )}
    </AuthCard>
  );
}
