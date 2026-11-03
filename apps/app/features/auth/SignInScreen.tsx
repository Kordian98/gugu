import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type { AuthProviders } from "@gugu/contracts";
import { Button, Icon, Text, color } from "@gugu/design-system";

import { apiFetch } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { afterSignInHref, toHref } from "./afterSignIn";
import { AuthCard } from "./AuthCard";
import { EMAIL_RE, authErrorMessage } from "./errors";
import { TextField } from "./TextField";

/** Signup reassurance lines (keys under `auth:signUp.points`). */
const SIGNUP_POINTS = ["free", "fast", "ai"] as const;

/** Only app-relative paths are accepted as `next` (the API re-validates). */
const safeNext = (next: unknown): string | undefined =>
  typeof next === "string" && /^\/(?!\/)/.test(next) ? next : undefined;

/**
 * Email magic-link sign-in (X12: no SMS/OTP). Step 1: email → link sent. Step 2: "check your inbox",
 * with a 6-digit code field for native or another device. Apple/Google buttons appear only when the
 * API reports them enabled.
 *
 * `mode="signUp"` (`/business/join`, owner 2026-11-04) is the same flow with signup copy: email is
 * the only thing needed to start. New and existing emails see exactly the same screens (no account
 * enumeration); after sign-in the business area creates the salon if the user has none.
 */
export function SignInScreen({ mode = "signIn" }: { mode?: "signIn" | "signUp" }) {
  const signUp = mode === "signUp";
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
    router.replace(toHref(path ?? next ?? `/${locale}/business`));
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

  const confirmCode = async (value = code) => {
    if (!sentTo || busy) return;
    if (!/^\d{6}$/.test(value)) {
      setError(t("errors.invalidCode"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await auth.verify({ email: sentTo, code: value });
      router.replace(
        afterSignInHref(session.user, session.redirectPath ?? next ?? `/${locale}/business`),
      );
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
            const digits = v.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            // Six digits typed or pasted: confirm at once (one tap fewer).
            if (digits.length === 6 && digits !== code) void confirmCode(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          error={error}
          onSubmitEditing={() => void confirmCode()}
          testID="auth-code"
        />
        <Button
          label={busy ? t("signIn.sending") : t("checkInbox.verify")}
          onPress={() => void confirmCode()}
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
        {signUp ? t("signUp.title") : t("signIn.title")}
      </Text>
      <Text size={16} color={color.body}>
        {signUp ? t("signUp.subtitle") : t("signIn.subtitle")}
      </Text>
      {signUp ? (
        <View className="gap-2">
          {SIGNUP_POINTS.map((k) => (
            <View key={k} className="flex-row items-center gap-2">
              <Icon name="check" size={16} color={color.lilac700} strokeWidth={2.4} />
              <Text size={15} color={color.ink}>
                {t(`signUp.points.${k}`)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
        label={busy ? t("signIn.sending") : signUp ? t("signUp.submit") : t("signIn.submit")}
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
      {signUp ? (
        <Text size={14} color={color.muted}>
          {t("signUp.existing")}
        </Text>
      ) : (
        <>
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
        </>
      )}
    </AuthCard>
  );
}
