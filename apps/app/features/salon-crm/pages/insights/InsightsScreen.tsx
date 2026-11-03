import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmCard, Pill, Text, useCalm } from "@gugu/design-system";
import type { Insights } from "@gugu/contracts";
import { formatDateLong, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useInsights } from "../../data/customers";
import { addDays, salonDate } from "../../data/dates";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { Segmented } from "../../ui/form";
import { ProfitView } from "./ProfitView";
import { ZaloInsightsCard } from "./ZaloInsightsCard";

/** Typographic placeholder for a metric without a value (not copy). */
const NO_VALUE = "\u2014";

type Period = "d7" | "d30" | "d90";
const DAYS: Record<Period, number> = { d7: 7, d30: 30, d90: 90 };

/** Headline order; keys come from the metric catalogue (packages/domain metrics registry). */
const HEADLINE = [
  "appointments.count",
  "appointments.upcoming",
  "appointments.completed",
  "customers.new",
  "customers.returning",
  "no_show.rate",
  "cancellation.rate",
  "revenue.estimated",
  "revenue.offline_recorded",
  "margin.estimated",
] as const;

const KIND_LABEL = {
  estimated_from_bookings: "revenueKind.estimated",
  recorded_offline_sale: "revenueKind.offline",
  reported_by_salon: "revenueKind.reported",
} as const;

/** Insights (07 M7.8, §3.8): period headline cards with deltas, daily bars, services, sources, staff. */
export function InsightsScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { summary, can } = useSalon();
  const mobile = bp === "mobile";
  const params = useLocalSearchParams<{ tab?: string }>();
  // "This month" profit view: owner by default (payroll.read), ADR-0014.
  const canProfit = can("payroll.read");
  // Permissions load after the first render: keep the requested tab and gate only the rendering.
  const [tab, setTab] = useState<"overview" | "month">(
    params.tab === "month" ? "month" : "overview",
  );
  const [period, setPeriod] = useState<Period>("d30");
  const to = salonDate(new Date(), summary?.timezone);
  const from = addDays(to, -(DAYS[period] - 1));
  const q = useInsights(from, to);
  const d = q.data?.data ?? null;

  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}>
      <PageHeader
        title={t("pages.insights.title")}
        subtitle={t("insights.subtitle")}
        workspace={ws}
      />
      {canProfit ? (
        <Segmented<"overview" | "month">
          value={tab}
          onChange={setTab}
          options={(["overview", "month"] as const).map((id) => ({
            id,
            label: t(`profit.tabs.${id}`),
          }))}
        />
      ) : null}
      {tab === "month" && canProfit ? <ProfitView /> : null}
      {tab === "month" && canProfit ? null : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Segmented<Period>
              value={period}
              onChange={setPeriod}
              options={(["d7", "d30", "d90"] as const).map((id) => ({
                id,
                label: t(`insights.periods.${id}`),
              }))}
            />
            <Text testID="crm-insights-range" size={13} color={c.body}>
              {t("insights.range", {
                from: formatDateLong(new Date(`${from}T12:00:00Z`), locale, "UTC"),
                to: formatDateLong(new Date(`${to}T12:00:00Z`), locale, "UTC"),
              })}
            </Text>
          </View>
          {q.isPending ? (
            <ActivityIndicator color={c.accent} />
          ) : q.data?.forbidden ? (
            <EmptyState
              testID="crm-insights-forbidden"
              icon="chart"
              title={t("insights.forbiddenTitle")}
              body={t("insights.forbiddenBody")}
            />
          ) : !d ? null : (
            <>
              {d.scope === "own" ? (
                <Text testID="crm-insights-own" size={13} color={c.body}>
                  {t("insights.ownScope")}
                </Text>
              ) : null}
              <View
                testID="crm-insights-cards"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
              >
                {HEADLINE.flatMap((k) => {
                  const m = d.metrics[k];
                  return m
                    ? [<MetricCard key={k} id={k} m={m} locale={locale} mobile={mobile} />]
                    : [];
                })}
              </View>
              <Daily data={d.daily} />
              <ZaloInsightsCard from={from} to={to} />
              <View
                style={{
                  flexDirection: mobile ? "column" : "row",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <CalmCard style={{ flex: 1, gap: 10, alignSelf: "stretch" }}>
                  <Title text={t("insights.services")} />
                  {d.services.length === 0 ? <Muted text={t("pages.insights.emptyBody")} /> : null}
                  {d.services.slice(0, 8).map((s) => (
                    <Bar
                      key={s.serviceId}
                      label={(locale === "en" && s.name.en) || s.name.vi}
                      value={s.count}
                      max={d.services[0]?.count ?? 1}
                      right={`${String(s.count)} · ${formatVND(s.estimatedRevenue, locale)}`}
                    />
                  ))}
                </CalmCard>
                <CalmCard style={{ flex: 1, gap: 10, alignSelf: "stretch" }}>
                  <Title text={t("insights.sources")} />
                  {d.sources.length === 0 ? <Muted text={t("pages.insights.emptyBody")} /> : null}
                  {d.sources.map((s) => (
                    <Bar
                      key={s.source}
                      label={t(`booking.source.${s.source}`, { defaultValue: s.source })}
                      value={s.count}
                      max={Math.max(...d.sources.map((x) => x.count), 1)}
                      right={String(s.count)}
                    />
                  ))}
                </CalmCard>
              </View>
              {d.staff.length ? (
                <StaffTable rows={d.staff} locale={locale} mobile={mobile} />
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function MetricCard({
  id,
  m,
  locale,
  mobile,
}: {
  id: string;
  m: Insights["metrics"][string];
  locale: "vi" | "en";
  mobile: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const fmt = (v: number) =>
    m.unit === "vnd"
      ? formatVND(v, locale)
      : m.unit === "ratio"
        ? `${(v * 100).toFixed(1)}%`
        : String(v);
  const delta =
    m.value !== null && m.previous !== null && m.previous !== 0 && m.unit !== "ratio"
      ? (m.value - m.previous) / Math.abs(m.previous)
      : m.value !== null && m.previous !== null && m.unit === "ratio"
        ? m.value - m.previous
        : null;
  // Lower is better for no-show / cancellation rates.
  const good = delta === null ? null : id.endsWith(".rate") ? delta <= 0 : delta >= 0;
  return (
    <CalmCard
      testID={`crm-metric-${id}`}
      style={{ gap: 6, flexBasis: mobile ? "47%" : 210, flexGrow: 1 }}
    >
      <Text size={12} color={c.muted}>
        {t(`insights.metrics.${id.replace(/\./g, "_")}`, { defaultValue: id })}
      </Text>
      <Text role="uiSemiBold" size={22} color={c.ink}>
        {m.value === null ? NO_VALUE : fmt(m.value)}
      </Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {delta !== null ? (
          <Pill
            size={10}
            tone={good ? "up" : "down"}
            label={`${delta >= 0 ? "+" : ""}${m.unit === "ratio" ? `${(delta * 100).toFixed(1)} pt` : `${(delta * 100).toFixed(0)}%`}`}
          />
        ) : null}
        <Text size={11} color={c.muted}>
          {id === "appointments.upcoming"
            ? t("insights.fromNow")
            : delta !== null
              ? t("insights.vsPrevious")
              : t("insights.noPrevious")}
        </Text>
      </View>
      {id === "margin.estimated" ? (
        <Text size={11} color={c.muted}>
          {t("insights.marginHint")}
        </Text>
      ) : null}
      {m.revenueKind ? <Pill size={10} tone="accent" label={t(KIND_LABEL[m.revenueKind])} /> : null}
    </CalmCard>
  );
}

function Daily({ data }: { data: Insights["daily"] }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const max = Math.max(...data.map((x) => x.appointments), 1);
  return (
    <CalmCard style={{ gap: 10 }}>
      <Title text={t("insights.daily")} />
      {data.length === 0 ? (
        <Muted text={t("pages.insights.emptyBody")} />
      ) : (
        <View
          testID="crm-insights-daily"
          style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 120 }}
        >
          {data.map((x) => (
            <View
              key={x.date}
              accessibilityLabel={`${x.date}: ${String(x.appointments)}`}
              style={{
                flex: 1,
                height: `${String(Math.max(4, (x.appointments / max) * 100))}%`,
                borderRadius: 4,
                backgroundColor: c.accentBg,
              }}
            />
          ))}
        </View>
      )}
    </CalmCard>
  );
}

function StaffTable({
  rows,
  locale,
  mobile,
}: {
  rows: Insights["staff"];
  locale: "vi" | "en";
  mobile: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const cols = [
    t("insights.appointments"),
    t("insights.completed"),
    t("insights.noShows"),
    t("insights.revenue"),
  ];
  return (
    <CalmCard style={{ gap: 8 }}>
      <Title text={t("insights.staff")} />
      {mobile ? null : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 2 }} />
          {cols.map((h) => (
            <Text key={h} size={11} color={c.muted} style={{ flex: 1, textAlign: "right" }}>
              {h}
            </Text>
          ))}
        </View>
      )}
      {rows.map((r) => (
        <View
          key={r.staffId}
          style={{
            flexDirection: mobile ? "column" : "row",
            gap: mobile ? 2 : 8,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderColor: c.line,
          }}
        >
          <Text role="uiSemiBold" size={14} color={c.ink} style={{ flex: 2 }}>
            {r.name}
          </Text>
          {[
            String(r.appointments),
            String(r.completed),
            String(r.noShows),
            formatVND(r.estimatedRevenue, locale),
          ].map((v, i) => (
            <Text
              key={i}
              size={13}
              color={c.body}
              style={{ flex: 1, textAlign: mobile ? "left" : "right" }}
            >
              {mobile ? `${cols[i] ?? ""}: ${v}` : v}
            </Text>
          ))}
        </View>
      ))}
    </CalmCard>
  );
}

function Bar({
  label,
  value,
  max,
  right,
}: {
  label: string;
  value: number;
  max: number;
  right: string;
}) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text size={13} color={c.ink} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        <Text size={12} color={c.body}>
          {right}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceMuted }}>
        <View
          style={{
            width: `${String((value / max) * 100)}%`,
            height: 6,
            borderRadius: 3,
            backgroundColor: c.accentBg,
          }}
        />
      </View>
    </View>
  );
}

function Title({ text }: { text: string }) {
  const { c } = useCalm();
  return (
    <Text
      role="uiSemiBold"
      size={12}
      color={c.ink}
      style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
    >
      {text}
    </Text>
  );
}

function Muted({ text }: { text: string }) {
  const { c } = useCalm();
  return (
    <Text size={13} color={c.muted}>
      {text}
    </Text>
  );
}
