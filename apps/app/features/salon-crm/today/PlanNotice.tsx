import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Text, useCalm } from "@gugu/design-system";
import { lastFreeInstant, planEndingNotice } from "@gugu/domain";
import { formatDateLong, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useSalonPlan } from "../data/plan";
import { useCrmNav } from "../shell/useCrmNav";

/**
 * Today: a quiet notice in the last 14 days before the Pro trial or the free Basic year ends (X25).
 * Members without `subscription.read` never see it.
 */
export function PlanNotice({ timeZone }: { timeZone: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { go } = useCrmNav();
  const plan = useSalonPlan();
  const now = useMemo(() => new Date(), []);
  const notice = plan.data ? planEndingNotice(plan.data, now) : null;
  if (!plan.data || !notice) return null;
  const day = (d: Date) => formatDateLong(d, locale, timeZone);
  const price =
    plan.data.basicMonthlyPriceVnd !== null
      ? formatVND(plan.data.basicMonthlyPriceVnd, locale)
      : null;
  const body =
    notice.kind === "trial_ends"
      ? notice.freeUntil && notice.freeUntil > notice.endsAt
        ? t("plan.notice.trialBody", {
            date: day(notice.endsAt),
            freeUntil: day(lastFreeInstant(notice.freeUntil)),
          })
        : t("plan.notice.trialBodyNoFree", { date: day(notice.endsAt) })
      : price
        ? t("plan.notice.freeBody", { date: day(lastFreeInstant(notice.endsAt)), price })
        : t("plan.notice.freeBodyNoPrice", { date: day(lastFreeInstant(notice.endsAt)) });
  return (
    <CalmCard testID={`today-plan-notice-${notice.kind}`} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="sparkles" size={16} color={c.accent} />
        <Text role="uiSemiBold" size={15} color={c.ink} style={{ flex: 1 }}>
          {t(notice.kind === "trial_ends" ? "plan.notice.trialTitle" : "plan.notice.freeTitle")}
        </Text>
      </View>
      <Text size={13} color={c.body}>
        {body}
      </Text>
      <View style={{ flexDirection: "row" }}>
        <CalmButton
          size="sm"
          variant="secondary"
          label={t("plan.notice.cta")}
          onPress={() => {
            go("/business/settings");
          }}
        />
      </View>
    </CalmCard>
  );
}
