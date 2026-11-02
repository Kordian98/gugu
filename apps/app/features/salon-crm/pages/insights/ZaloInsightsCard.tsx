import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useOptionalSalon } from "../../data/SalonContext";
import { useZaloConnection, useZaloStats } from "../../data/zalo";
import { useCrmNav } from "../../shell/useCrmNav";

/**
 * Insights → Zalo (topic 09): the period's headline Zalo numbers and the top reason bookings
 * didn't happen, linking to the full statistics. Hidden when Zalo was never connected.
 */
export function ZaloInsightsCard({ from, to }: { from: string; to: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  const { go } = useCrmNav();
  const allowed = useOptionalSalon()?.can("analytics.read") ?? false;
  const connection = useZaloConnection();
  const everConnected = connection.data !== undefined && connection.data.status !== "not_connected";
  const stats = useZaloStats(from, to, allowed && everConnected);
  const s = stats.data;
  if (!allowed || !everConnected || !s) return null;
  const pct = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(s.funnel.conversionRate);
  const top = s.lostReasons[0];
  const reasonLabel = (reason: string) =>
    reason.startsWith("abandoned:")
      ? t("panel.stats.reason.abandoned", {
          step: t(`panel.stats.step.${reason.slice("abandoned:".length) as "service"}`),
        })
      : t(`panel.stats.reason.${reason as "handoff"}`, { defaultValue: reason });
  const quiet = s.contacts.uniqueCustomers === 0 && s.funnel.sessions === 0;
  return (
    <CalmCard style={{ gap: 12 }} testID="crm-insights-zalo">
      <View style={{ gap: 2 }}>
        <Text role="uiSemiBold" size={15} color={c.ink}>
          {t("panel.insights.title")}
        </Text>
        <Text size={12} color={c.muted}>
          {t("panel.insights.subtitle")}
        </Text>
      </View>
      {quiet ? (
        <Text size={13} color={c.body}>
          {t("panel.insights.none")}
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
            <Figure
              label={t("panel.insights.customers")}
              value={String(s.contacts.uniqueCustomers)}
            />
            <Figure label={t("panel.insights.bookings")} value={String(s.funnel.bookings)} />
            <Figure label={t("panel.insights.conversion")} value={pct} />
            <Figure label={t("panel.insights.cost")} value={formatVND(s.costs.totalVnd, locale)} />
          </View>
          {top ? (
            <Text size={13} color={c.body}>
              {t("panel.insights.topLost", { reason: reasonLabel(top.reason), count: top.count })}
            </Text>
          ) : null}
        </>
      )}
      <View style={{ flexDirection: "row" }}>
        <CalmButton
          size="sm"
          variant="secondary"
          icon="chart"
          label={t("panel.insights.open")}
          onPress={() => {
            go("/business/zalo?tab=stats");
          }}
        />
      </View>
    </CalmCard>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 2, minWidth: 120 }}>
      <Text size={12} color={c.muted}>
        {label}
      </Text>
      <Text role="uiSemiBold" size={20} color={c.ink}>
        {value}
      </Text>
    </View>
  );
}
