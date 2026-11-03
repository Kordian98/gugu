import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmCard, Pill, Text, useCalm, type PillTone } from "@gugu/design-system";
import type { SalonEntitlements } from "@gugu/contracts";
import { lastFreeInstant } from "@gugu/domain";
import { formatDateLong, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useSalonPlan } from "../../data/plan";

const TONE: Record<SalonEntitlements["status"], PillTone> = {
  trialing: "accent",
  active: "up",
  past_due: "down",
  cancelled: "neutral",
  expired: "down",
  none: "neutral",
};

type Row = { id: string; label: string; value: string };

/** Which dates the owner sees: trial end, last free Basic day, paid-until (not while free). */
function planRows(
  data: SalonEntitlements,
  onFreeBasic: boolean,
  t: (k: string) => string,
  date: (iso: string) => string,
  freeDay: (iso: string) => string,
): Row[] {
  const rows: Row[] = [];
  if (data.status === "trialing" && data.trialEndsAt) {
    rows.push({ id: "trial-ends", label: t("plan.trialEnds"), value: date(data.trialEndsAt) });
  }
  if ((data.plan === "trial" || data.plan === "basic") && data.freeUntil) {
    rows.push({ id: "free-until", label: t("plan.freeUntil"), value: freeDay(data.freeUntil) });
  }
  if (data.paidUntil && !onFreeBasic && data.plan !== "trial") {
    rows.push({ id: "paid-until", label: t("plan.paidUntil"), value: date(data.paidUntil) });
  }
  return rows;
}

function bodyKey(data: SalonEntitlements, onFreeBasic: boolean, hasPrice: boolean): string {
  if (data.plan === "trial") return "plan.trialBody";
  if (onFreeBasic) return hasPrice ? "plan.freeBody" : "plan.freeBodyNoPrice";
  return data.plan === "basic" ? "plan.basicBody" : "plan.contactBody";
}

/**
 * Settings → Plan (X25): current plan and status, trial end, free Basic year end and paid-until.
 * Read-only: plans are assigned and invoiced manually by GuGu, there is no self-serve billing.
 */
export function PlanSection({ timeZone }: { timeZone: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const plan = useSalonPlan();
  const now = useMemo(() => new Date(), []).getTime();
  const data = plan.data;
  if (!data) return null;
  const date = (iso: string) => formatDateLong(new Date(iso), locale, timeZone);
  const freeDay = (iso: string) => formatDateLong(lastFreeInstant(new Date(iso)), locale, timeZone);
  const onFreeBasic =
    data.plan === "basic" && data.freeUntil !== null && Date.parse(data.freeUntil) > now;
  const price =
    data.basicMonthlyPriceVnd !== null ? formatVND(data.basicMonthlyPriceVnd, locale) : null;
  const rows = planRows(data, onFreeBasic, (k) => t(k as never), date, freeDay);

  return (
    <CalmCard testID="crm-settings-plan" style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Text role="uiSemiBold" size={16} color={c.ink} style={{ flex: 1 }}>
          {t("plan.title")}
        </Text>
        <Pill label={t(`plan.status.${data.status}`)} tone={TONE[data.status]} />
      </View>
      <Text testID="crm-plan-name" role="uiSemiBold" size={20} color={c.ink}>
        {t(`plan.name.${data.plan ?? "none"}`)}
      </Text>
      {rows.map((r) => (
        <View
          key={r.id}
          testID={`crm-plan-${r.id}`}
          style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
        >
          <Text size={14} color={c.body}>
            {r.label}
          </Text>
          <Text role="uiSemiBold" size={14} color={c.ink}>
            {r.value}
          </Text>
        </View>
      ))}
      <Text size={13} color={c.body}>
        {t(bodyKey(data, onFreeBasic, price !== null) as never, { price: price ?? "" })}
      </Text>
    </CalmCard>
  );
}
