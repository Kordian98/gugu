import { Linking, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";
import { formatDateLong } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useOptionalSalon } from "../data/SalonContext";

/**
 * Persistent banner on every workspace page while GuGu has suspended the salon (q89, ADR-0010):
 * what is happening (read-only, Zalo bot and customer reminders paused) and how to reach GuGu
 * support. The contact comes from the API (`SUPPORT_EMAIL` / `SUPPORT_PHONE`), never from code.
 * UX only: the API refuses every write of a suspended salon with `salon.suspended`, except client
 * erasure and the salon-wide export (q92), which the owner can still use for privacy requests.
 */
export function SuspensionBanner() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const summary = useOptionalSalon()?.summary ?? null;
  const suspension = summary?.suspension ?? null;
  if (!summary || !suspension) return null;
  const { email, phone } = suspension.support;
  const since = suspension.since
    ? formatDateLong(new Date(suspension.since), locale, summary.timezone)
    : null;
  return (
    <View
      testID="crm-suspension-banner"
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: c.down.bg,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <Icon name="alert" size={20} color={c.down.text} />
      <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
        <Text role="uiSemiBold" size={14} color={c.down.text}>
          {since ? t("shell.suspension.titleSince", { date: since }) : t("shell.suspension.title")}
        </Text>
        <Text size={13} color={c.ink}>
          {t("shell.suspension.body")}
        </Text>
        <Text size={13} color={c.body} testID="crm-suspension-contact">
          {phone
            ? t("shell.suspension.contactPhone", { email, phone })
            : t("shell.suspension.contact", { email })}
        </Text>
      </View>
      <CalmButton
        testID="crm-suspension-email"
        size="sm"
        variant="secondary"
        icon="mail"
        label={t("shell.suspension.emailAction")}
        onPress={() => {
          void Linking.openURL(`mailto:${email}`);
        }}
      />
    </View>
  );
}
