import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, ProgressBar, Text, useCalm } from "@gugu/design-system";
import { formatLocalDate, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { salonDate } from "../data/dates";
import { useMyEarnings, useMyLines, useProfit } from "../data/payroll";
import { useSalon } from "../data/SalonContext";
import { topServices } from "../pages/payroll/model";
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
 * Owner's compact "This month" on Today (ADR-0016): progress, earned so far, still to come and
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
          testID="crm-today-payroll"
          variant="ghost"
          icon="wallet"
          label={t("profit.card.payroll")}
          onPress={() => {
            go("/business/payroll");
          }}
        />
        <CalmButton
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
 * A staff member's own month (payroll.self.read), redesigned after the owner's review 2026-11-03:
 * ONE big number (the month estimate), how much is already earned vs still expected, and a short
 * list of the services that earned commission. Only the member's own numbers come back from the
 * API; the employer cost ("chi phí thực tế") is never part of it.
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
  const lines = useMyLines(month, allowed && m?.hasProfile === true);
  if (!allowed || !m?.hasProfile) return null;
  const vnd = (n: number) => formatVND(n, locale);
  const earned = m.totalEstimate - m.commissionProjected;
  const top = topServices(lines.data?.data?.items ?? [], locale, 4);
  return (
    <CalmCard testID="crm-my-earnings" style={{ gap: 12 }}>
      <Text
        role="uiSemiBold"
        size={12}
        color={c.ink}
        style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
      >
        {t("myEarnings.title")}
      </Text>
      {m.baseType === null && m.commissionEarned === 0 ? (
        <Text size={15} color={c.body}>
          {t("myEarnings.noPay")}
        </Text>
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text size={14} color={c.body}>
              {t("myEarnings.total")}
            </Text>
            <Text
              testID="crm-my-earnings-total"
              role="uiSemiBold"
              size={34}
              lineHeight={42}
              color={c.ink}
            >
              {vnd(m.totalEstimate)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
            <Figure
              testID="crm-my-earnings-earned"
              label={t("myEarnings.earnedSoFar")}
              value={vnd(earned)}
            />
            {m.commissionProjected > 0 ? (
              <Figure
                label={t("myEarnings.stillExpected", { count: m.projectedLines })}
                value={`+${vnd(m.commissionProjected)}`}
              />
            ) : null}
          </View>
          <View style={{ gap: 4 }}>
            <Text role="uiMedium" size={14} color={c.ink}>
              {t("myEarnings.commissionFrom", {
                count: m.earnedLines,
                amount: vnd(m.commissionEarned),
              })}
            </Text>
            {top.length === 0 ? (
              <Text size={14} color={c.muted}>
                {t("myEarnings.noServicesYet")}
              </Text>
            ) : (
              top.map((s) => (
                <View
                  key={s.name}
                  testID="crm-my-earnings-service"
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 8,
                    paddingVertical: 6,
                    borderTopWidth: 1,
                    borderColor: c.line,
                  }}
                >
                  <Text size={15} color={c.body} style={{ flex: 1 }} numberOfLines={1}>
                    {t("myEarnings.serviceLine", { name: s.name, count: s.count })}
                  </Text>
                  <Text role="uiSemiBold" size={15} color={c.ink}>
                    {vnd(s.amount)}
                  </Text>
                </View>
              ))
            )}
            <Text size={13} color={c.muted}>
              {m.bonus - m.deduction - m.advance !== 0
                ? t("myEarnings.baseAndAdjustments", {
                    base: vnd(m.base),
                    adjustments: signedVnd(m.bonus - m.deduction - m.advance, locale),
                  })
                : t("myEarnings.baseLine", { base: vnd(m.base) })}
            </Text>
          </View>
        </>
      )}
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {m.closed ? <Pill size={11} tone="up" label={t("myEarnings.closed")} /> : null}
        {m.paidOn ? (
          <Pill
            size={11}
            tone="up"
            label={t("myEarnings.paid", { date: formatLocalDate(m.paidOn, locale) })}
          />
        ) : null}
      </View>
      <Text size={13} color={c.muted}>
        {t("myEarnings.note")}
      </Text>
    </CalmCard>
  );
}
