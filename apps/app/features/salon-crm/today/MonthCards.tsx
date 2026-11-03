import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, ProgressBar, Text, useCalm } from "@gugu/design-system";
import { formatLocalDate, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { salonDate } from "../data/dates";
import { useMyEarnings, useProfit } from "../data/payroll";
import { useSalon } from "../data/SalonContext";
import { signedVnd } from "../pages/payroll/parts";
import { useCrmNav } from "../shell/useCrmNav";

function Figure({
  label,
  value,
  strong,
  testID,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <View style={{ flex: 1, minWidth: 110, gap: 2 }}>
      <Text size={12} color={c.muted}>
        {label}
      </Text>
      <Text
        testID={testID}
        role={strong ? "uiSemiBold" : "uiMedium"}
        size={strong ? 18 : 16}
        color={c.ink}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Owner's compact "This month" on Today (ADR-0014): progress, earned so far, still to come and
 * the estimated net profit; details in Insights → This month. Hidden without payroll.read.
 */
export function ProfitCard() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { summary, can } = useSalon();
  const { go } = useCrmNav();
  const allowed = can("payroll.read");
  const month = salonDate(new Date(), summary?.timezone).slice(0, 7);
  const q = useProfit(month, allowed);
  const p = q.data?.data ?? null;
  if (!allowed || !p) return null;
  const v = (k: string) => p.metrics[k]?.value ?? 0;
  return (
    <CalmCard testID="crm-today-profit" style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          role="uiSemiBold"
          size={12}
          color={c.ink}
          style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
        >
          {t("profit.card.title")}
        </Text>
        <Text size={12} color={c.muted}>
          {t("profit.progress", { elapsed: p.elapsedDays, days: p.daysInMonth })}
        </Text>
      </View>
      <ProgressBar value={p.breakdown.monthProgress} width="100%" />
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Figure
          label={t("profit.card.earned")}
          value={formatVND(v("profit.revenue_earned"), locale)}
        />
        <Figure
          label={t("profit.card.upcoming")}
          value={formatVND(v("profit.revenue_upcoming"), locale)}
        />
        <Figure
          testID="crm-today-profit-net"
          strong
          label={t("profit.card.net")}
          value={formatVND(v("profit.net"), locale)}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Pill size={10} tone="accent" label={t("revenueKind.estimated")} />
        <View style={{ flex: 1 }} />
        <CalmButton
          size="sm"
          variant="ghost"
          label={t("profit.card.open")}
          onPress={() => {
            go("/business/insights?tab=month");
          }}
        />
      </View>
    </CalmCard>
  );
}

/**
 * A staff member's own month (payroll.self.read): commission done, upcoming, base and the
 * estimate at month end. Only the member's own numbers ever come back from the API.
 */
export function MyEarningsCard() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { summary, can } = useSalon();
  // Owners (and granted managers) see the salon figures instead.
  const allowed = can("payroll.self.read") && !can("payroll.read");
  const month = salonDate(new Date(), summary?.timezone).slice(0, 7);
  const q = useMyEarnings(month, allowed);
  const m = q.data?.data ?? null;
  if (!allowed || !m?.hasProfile) return null;
  const vnd = (n: number) => formatVND(n, locale);
  const adj = m.bonus - m.deduction - m.advance;
  return (
    <CalmCard testID="crm-my-earnings" style={{ gap: 10 }}>
      <Text
        role="uiSemiBold"
        size={12}
        color={c.ink}
        style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
      >
        {t("myEarnings.title")}
      </Text>
      {m.baseType === null && m.commissionEarned === 0 ? (
        <Text size={14} color={c.body}>
          {t("myEarnings.noPay")}
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <Figure
              testID="crm-my-earnings-commission"
              label={`${t("myEarnings.commissionEarned")} · ${t("myEarnings.services", { count: m.earnedLines })}`}
              value={vnd(m.commissionEarned)}
            />
            {m.commissionProjected > 0 ? (
              <Figure
                label={t("myEarnings.commissionProjected")}
                value={vnd(m.commissionProjected)}
              />
            ) : null}
            <Figure label={t("myEarnings.base")} value={vnd(m.base)} />
            {adj !== 0 ? (
              <Figure label={t("myEarnings.adjustments")} value={signedVnd(adj, locale)} />
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderTopWidth: 1,
              borderColor: c.line,
              paddingTop: 8,
            }}
          >
            <Text role="uiMedium" size={14} color={c.ink}>
              {t("myEarnings.total")}
            </Text>
            <Text testID="crm-my-earnings-total" role="uiSemiBold" size={20} color={c.ink}>
              {vnd(m.totalEstimate)}
            </Text>
          </View>
        </>
      )}
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {m.closed ? <Pill size={10} tone="up" label={t("myEarnings.closed")} /> : null}
        {m.paidOn ? (
          <Pill
            size={10}
            tone="up"
            label={t("myEarnings.paid", { date: formatLocalDate(m.paidOn, locale) })}
          />
        ) : null}
      </View>
      <Text size={12} color={c.muted}>
        {t("myEarnings.note")}
      </Text>
    </CalmCard>
  );
}
