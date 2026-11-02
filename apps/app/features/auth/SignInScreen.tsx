import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type { AuthProviders } from "@gugu/contracts";
import { Button, Text, color } from "@gugu/design-system";

import { apiFetch } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { AuthCard } from "./AuthCard";
import { EMAIL_RE, authErrorMessage } from "./errors";
import { TextField } from "./TextField";

/** Only app-relative paths are accepted as `next` (the API re-validates). */
const safeNext = (next: unknown): string | undefined =>
  typeof next === "string" && /^\/(?!\/)/.test(next) ? next : undefined;

/**
 * Email magic-link sign-in (X12: no SMS/OTP). Step 1: email → link sent. Step 2: "check your inbox",
 * with a 6-digit code field for native or another device. Apple/Google buttons appear only when the
 * API reports them enabled.
 */
export function SignInScreen({ mode }: { mode: "signIn" | "signUp" }) {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const router = useRouter();
  const auth = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: () => apiFetch<AuthProviders>("/auth/providers"),
  });

  const goNext = (path: string | null) => {
    router.replace((path ?? next ?? `/${locale}/me`) as Href);
  };

  const send = async (address: string) => {
    if (!EMAIL_RE.test(address)) {
      setError(t("errors.invalidEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.requestMagicLink(address, locale, next);
      setSentTo(address);
    } catch (e) {
      setError(authErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) {
      setError(t("errors.invalidCode"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await auth.verify({ email: sentTo, code });
      goNext(session.redirectPath);
    } catch (e) {
      setError(authErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "signedIn" && auth.user && !sentTo) {
    return (
      <AuthCard>
        <Text role="display" size={40} lineHeight={44}>
          {t("signedIn.title")}
        </Text>
        <Text size={16} color={color.body}>
          {t("signedIn.body", { email: auth.user.email ?? "" })}
        </Text>
        <Button
          label={t("signedIn.continue")}
          onPress={() => {
            goNext(null);
          }}
          height={52}
          fontSize={16}
          trailingArrow
        />
        <Button
          label={t("signedIn.signOut")}
          variant="outline"
          onPress={() => void auth.signOut()}
          height={52}
          fontSize={16}
        />
      </AuthCard>
    );
  }

  if (sentTo) {
    return (
      <AuthCard>
        <Text role="display" size={40} lineHeight={44}>
          {t("checkInbox.title")}
        </Text>
        <Text size={16} color={color.body}>
          {t("checkInbox.body", { email: sentTo })}
        </Text>
        <TextField
          label={t("checkInbox.codeLabel")}
          placeholder={t("checkInbox.codePlaceholder")}
          value={code}
          onChangeText={(v) => {
            setCode(v.replace(/\D/g, "").slice(0, 6));
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          error={error}
          onSubmitEditing={() => void confirmCode()}
        />
        <Button
          label={busy ? t("signIn.sending") : t("checkInbox.verify")}
          onPress={() => void (busy ? undefined : confirmCode())}
          height={52}
          fontSize={16}
        />
        <View className="flex-row flex-wrap justify-between gap-3">
          <Pressable accessibilityRole="button" onPress={() => void send(sentTo)}>
            <Text role="uiSemiBold" size={14} color={color.lilac700}>
              {t("checkInbox.resend")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSentTo(null);
              setCode("");
              setError(null);
            }}
          >
            <Text role="uiSemiBold" size={14} color={color.lilac700}>
              {t("checkInbox.changeEmail")}
            </Text>
          </Pressable>
        </View>
      </AuthCard>
    );
  }

  const enabled = providers.data;
  return (
    <AuthCard>
      <Text role="display" size={44} lineHeight={48}>
        {mode === "signUp" ? t("signUp.title") : t("signIn.title")}
      </Text>
      <Text size={16} color={color.body}>
        {mode === "signUp" ? t("signUp.subtitle") : t("signIn.subtitle")}
      </Text>
      <TextField
        label={t("signIn.emailLabel")}
        placeholder={t("signIn.emailPlaceholder")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={error}
        onSubmitEditing={() => void send(email.trim())}
      />
      <Button
        label={busy ? t("signIn.sending") : t("signIn.submit")}
        onPress={() => void (busy ? undefined : send(email.trim()))}
        height={52}
        fontSize={16}
        trailingArrow
      />
      {enabled?.apple || enabled?.google ? (
        <View className="gap-3">
          <Text size={13} color={color.muted} style={{ textAlign: "center" }}>
            {t("signIn.or")}
          </Text>
          {/* TODO(05): wire native/web provider SDKs once client IDs exist (docs/domains/auth-security.md#enable-apple-google). */}
          {enabled.apple ? (
            <Button
              label={t("signIn.apple")}
              variant="outline"
              onPress={() => undefined}
              height={52}
              fontSize={16}
            />
          ) : null}
          {enabled.google ? (
            <Button
              label={t("signIn.google")}
              variant="outline"
              onPress={() => undefined}
              height={52}
              fontSize={16}
            />
          ) : null}
        </View>
      ) : null}
      <Text size={14} color={color.muted}>
        {t("signIn.noAccount")}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text size={14} color={color.body}>
          {t("signIn.forSalons")}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push(`/${locale}/business/join`);
          }}
        >
          <Text role="uiSemiBold" size={14} color={color.lilac700}>
            {t("signIn.forSalonsLink")}
          </Text>
        </Pressable>
      </View>
    </AuthCard>
  );
}
