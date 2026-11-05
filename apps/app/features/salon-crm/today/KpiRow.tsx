import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, Pill, ProgressBar, Sparkline, StatCard, Text, useCalm } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { Workspace } from "../data/types";

const pct = (n: number) => `${n > 0 ? "+" : ""}${String(n)}%`;

/** Four headline numbers (07 §3.8): estimated revenue (RevenueKind badge), appointments, new, occupancy. */
export function KpiRow({
  today,
  only,
}: {
  today: Workspace["today"];
  only?: "revenue" | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const r = today.revenueEstimated;
  const a = today.appointments;
  const n = today.newCustomers;
  const o = today.occupancy;
  const revenue = (
    <StatCard
      testID="crm-kpi-revenue"
      label={t("kpi.revenueToday")}
      value={r ? formatVND(r.amountVnd, locale) : null}
      badge={
        r ? (
          <>
            <Pill label={t("revenueKind.estimated")} tone="accent" />
            {r.deltaPct !== null ? (
              <Pill label={pct(r.deltaPct)} tone={r.deltaPct >= 0 ? "up" : "down"} />
            ) : null}
          </>
        ) : undefined
      }
      caption={r && r.deltaPct !== null ? t("kpi.vsLastWeek") : undefined}
      visual={
        r && r.trend.length > 1 ? <Sparkline values={r.trend} width={84} height={34} /> : undefined
      }
      emptyCaption={t("kpi.emptyRevenue")}
    />
  );
  if (only === "revenue") return revenue;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
      {revenue}
      <StatCard
        testID="crm-kpi-appointments"
        label={t("kpi.appointments")}
        value={a ? t("kpi.appointmentsValue", { count: a.total }) : null}
        caption={a ? t("kpi.remainingToday", { count: a.remaining }) : undefined}
        visual={
          a ? (
            <ProgressBar value={a.done / a.total} secondary={a.inProgress / a.total} width={64} />
          ) : undefined
        }
        emptyCaption={t("kpi.emptyAppointments")}
      />
      {n ? (
        <StatCard
          testID="crm-kpi-new"
          label={t("kpi.newCustomers")}
          value={t("kpi.newCustomersValue", { count: n.count })}
          badge={<Pill label={pct(n.deltaPct)} tone={n.deltaPct >= 0 ? "up" : "down"} />}
          caption={t("kpi.thisMonth")}
          visual={
            <View style={{ flexDirection: "row" }}>
              {n.names.map((name, i) => (
                <View key={name} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <Avatar name={name} size={28} />
                </View>
              ))}
            </View>
          }
          emptyCaption={t("kpi.emptyNewCustomers")}
        />
      ) : null}
      {o ? (
        <StatCard
          testID="crm-kpi-occupancy"
          label={t("kpi.occupancy")}
          value={`${String(Math.round(o.rate * 100))}%`}
          caption={
            <Text size={13} color={c.body}>
              {t("kpi.vsPrevWeek")}
            </Text>
          }
          visual={<ProgressBar value={o.rate} width={72} />}
          emptyCaption={t("kpi.emptyOccupancy")}
        />
      ) : null}
    </View>
  );
}
