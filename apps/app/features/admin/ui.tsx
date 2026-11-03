import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import Head from "expo-router/head";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, useCalm, type PillTone } from "@gugu/design-system";

import { ApiError } from "@/services/auth/api";

import { useBreakpoint } from "../salon-crm/shell/useBreakpoint";

/** Scrollable admin page with a document title and a header row. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  testID,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const mobile = useBreakpoint() === "mobile";
  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 20, maxWidth: 1320, width: "100%" }}
    >
      <Head>
        <title>{t("shell.docTitle", { page: title })}</title>
      </Head>
      <View
        style={{
          flexDirection: mobile ? "column" : "row",
          alignItems: mobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View accessibilityRole="header" style={{ gap: 4, flexShrink: 1 }}>
          <Text
            role="uiSemiBold"
            size={mobile ? 22 : 26}
            lineHeight={mobile ? 28 : 32}
            color={c.ink}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text size={14} color={c.body}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions}</View>
        ) : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Section({
  title,
  body,
  actions,
  children,
  testID,
}: {
  title: string;
  body?: string | undefined;
  actions?: ReactNode;
  children?: ReactNode;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <CalmCard testID={testID} style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View accessibilityRole="header" style={{ gap: 2, flexShrink: 1 }}>
          <Text role="uiSemiBold" size={16} color={c.ink}>
            {title}
          </Text>
          {body ? (
            <Text size={12} color={c.muted}>
              {body}
            </Text>
          ) : null}
        </View>
        {actions ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{actions}</View>
        ) : null}
      </View>
      {children}
    </CalmCard>
  );
}

/** Label / value row. */
export function KV({ label, value, testID }: { label: string; value: ReactNode; testID?: string }) {
  const { c } = useCalm();
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", gap: 12, paddingVertical: 4, alignItems: "center" }}
    >
      <Text size={13} color={c.muted} style={{ width: 150 }}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>
        {typeof value === "string" ? (
          <Text size={14} color={c.ink}>
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

export function Loading() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  return (
    <View
      style={{ padding: 40, alignItems: "center", gap: 8 }}
      accessibilityLabel={t("common.loading")}
    >
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  return (
    <CalmCard style={{ alignItems: "flex-start", gap: 10 }}>
      <Text size={14} color={c.body}>
        {t("common.loadFailed")}
      </Text>
      <CalmButton variant="secondary" size="sm" label={t("common.retry")} onPress={onRetry} />
    </CalmCard>
  );
}

/** problem+json code → admin:errors.* sentence, with a generic fallback. */
export function useAdminErrorText(): (e: unknown) => string | null {
  const { t, i18n } = useTranslation("admin");
  return (e) => {
    if (!e) return null;
    const code = e instanceof ApiError ? e.code : "common.internal_error";
    const key = `errors.${code.replace(/\./g, "_")}`;
    return i18n.exists(`admin:${key}`) ? t(key as never) : t("errors.generic");
  };
}

export function statusTone(status: string): PillTone {
  if (status === "active") return "up";
  if (status === "trialing") return "accent";
  if (status === "past_due" || status === "suspended" || status === "expired") return "down";
  return "neutral";
}

export function StatusPill({ label, status }: { label: string; status: string }) {
  return <Pill label={label} tone={statusTone(status)} />;
}
