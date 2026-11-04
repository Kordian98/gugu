import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PLAN_MONTHLY_PRICE_VND, type BillingInterval, planPriceVnd } from "@gugu/contracts";
import { Icon, MIN_TOUCH, Text, color, radius, space } from "@gugu/design-system";
import { yearlySavingVnd } from "@gugu/domain";
import { formatNumber, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { Advice } from "./model";
import { useCountUp } from "./useCountUp";

/** Small building blocks of the pricing result card. */
const TEST_ID = { first: "pricing-first-year", later: "pricing-later" } as const;

export function Money({
  v,
  reduce,
  size,
  testID,
}: {
  v: number;
  reduce: boolean;
  size: number;
  testID?: string;
}) {
  const locale = useLocale();
  const shown = useCountUp(v, reduce);
  return (
    <Text
      testID={testID}
      role="uiSemiBold"
      size={size}
      color={color.ink}
      style={{ fontVariant: ["tabular-nums"] }}
    >
      {formatVND(shown, locale)}
    </Text>
  );
}

export function CostCell({
  label,
  desktop,
  children,
}: {
  label: string;
  desktop: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        gap: 2,
        padding: desktop ? 14 : 10,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.lineSoft,
        backgroundColor: color.canvas,
      }}
    >
      <Text role="uiSemiBold" size={12} color={color.ink2}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Price with a smaller unit ("99.000đ" + "/tháng") so it never wraps mid-word. */
function Price({
  v,
  unit,
  reduce,
  size,
  testID,
}: {
  v: number;
  unit: string | null;
  reduce: boolean;
  size: number;
  testID: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }}>
      <Money testID={testID} v={v} reduce={reduce} size={size} />
      {unit ? (
        <Text role="uiSemiBold" size={size * 0.62} color={color.ink2}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

/** This year and from year two, for the chosen billing interval (shared list prices). */
export function CostRow({
  advice,
  interval,
  reduce,
  desktop,
}: {
  advice: Advice;
  interval: BillingInterval;
  reduce: boolean;
  desktop: boolean;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const { plan, cost } = advice;
  const size = desktop ? 24 : 18;
  const unit = t(interval === "month" ? "pricing.cost.unitMonth" : "pricing.cost.unitYear");
  const yearlyLine =
    interval === "year"
      ? t("pricing.cost.saveYear", { v: formatVND(yearlySavingVnd(advice.billed), locale) })
      : t("pricing.cost.orYear", {
          price: formatVND(planPriceVnd(advice.billed, "year"), locale),
        });
  const later = (testID: string) => (
    <>
      <Price testID={testID} v={cost.laterPeriodVnd} unit={unit} reduce={reduce} size={size} />
      <Text size={12} lineHeight={16} color={color.body}>
        {yearlyLine}
      </Text>
    </>
  );
  // Pro / Ultra cost the same every year (from the end of the trial): one cell.
  if (plan !== "basic") {
    return (
      <CostCell label={t("pricing.cost.afterTrialLabel")} desktop={desktop}>
        {later(TEST_ID.first)}
        {plan === "ultra" ? (
          <Text size={12} lineHeight={16} color={color.ink2}>
            {t("pricing.cost.ultraLater", {
              price: formatVND(PLAN_MONTHLY_PRICE_VND.ultra, locale),
            })}
          </Text>
        ) : null}
      </CostCell>
    );
  }
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <CostCell label={t("pricing.cost.firstYear")} desktop={desktop}>
        <Price testID="pricing-first-year" v={0} unit={null} reduce={reduce} size={size} />
        <Text size={12} lineHeight={16} color={color.body}>
          {t("pricing.cost.freeSub")}
        </Text>
      </CostCell>
      <CostCell label={t("pricing.cost.later")} desktop={desktop}>
        {later(TEST_ID.later)}
      </CostCell>
    </View>
  );
}

/**
 * "Bạn tiết kiệm khoảng X₫ mỗi tháng" (revenue kept − plan fee), "sau khi đã trừ phí gói", then the
 * hours split by who saves them (front desk + owner, one line, tap for the breakdown; never
 * converted into đ) and the disclaimer.
 */
export function Savings({
  advice,
  reduce,
  desktop,
  onHow,
}: {
  advice: Advice;
  reduce: boolean;
  desktop: boolean;
  /** Opens "Cách tính" with the hours breakdown. */
  onHow: () => void;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const net = advice.netFirstYearPerMonthVnd;
  const netShown = useCountUp(Math.abs(net), reduce);
  const hours = useCountUp(advice.estimate.hours, reduce);
  const owner = useCountUp(advice.estimate.ownerHours, reduce);
  const big = desktop ? 32 : 26;
  return (
    <View
      style={{
        gap: space[1],
        padding: desktop ? space[5] : space[3],
        borderRadius: radius.md,
        backgroundColor: color.lilac100,
      }}
    >
      <Text role="uiSemiBold" size={desktop ? 15 : 13.5} color={color.ink2}>
        {t(net >= 0 ? "pricing.save.lead" : "pricing.save.leadNegative")}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[2] }}>
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Icon name="sparkles" size={big * 0.55} color={color.lilac700} />
        </View>
        <Text
          testID="pricing-save-amount"
          role="display"
          size={big}
          lineHeight={big * 1.15}
          color={color.ink}
        >
          {t("pricing.save.amount", { v: formatVND(netShown, locale) })}
        </Text>
        <Text role="uiSemiBold" size={desktop ? 16 : 14} color={color.ink}>
          {t("pricing.save.unit")}
        </Text>
      </View>
      <Text size={12.5} lineHeight={17} color={color.ink2}>
        {t("pricing.save.sub")}
      </Text>
      {/* Hours, split by who saves them; tap for the breakdown ("Cách tính"). */}
      <Pressable
        testID="pricing-save"
        accessibilityRole="button"
        accessibilityHint={t("pricing.howLink")}
        onPress={onHow}
        style={(state) => ({
          alignSelf: "flex-start",
          minHeight: MIN_TOUCH,
          flexDirection: "row",
          alignItems: "center",
          gap: space[2],
          marginVertical: -space[2],
          opacity: state.pressed ? 0.7 : 1,
        })}
      >
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Icon name="clock" size={14} color={color.lilac700} />
        </View>
        <Text role="uiSemiBold" size={13} lineHeight={18} color={color.ink}>
          {t("pricing.save.hours", {
            a: formatNumber(hours, locale),
            b: formatNumber(owner, locale),
          })}
        </Text>
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Icon name="info" size={14} color={color.ink2} />
        </View>
      </Pressable>
      <Text size={11.5} lineHeight={15} color={color.ink2} style={{ marginTop: space[2] }}>
        {t("pricing.save.disclaimer")}
      </Text>
    </View>
  );
}

/** Screen-reader summary of the answer: plan, why and what is billed (Ultra starts on Pro). */
export function useSummary(
  advice: Advice,
  interval: BillingInterval,
  name: string,
  why: string,
  picked: boolean,
) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const unit = t(interval === "month" ? "pricing.cost.unitMonth" : "pricing.cost.unitYear");
  const price = formatVND(planPriceVnd(advice.billed, interval), locale);
  const ultra = t("pricing.cost.ultraLater", {
    price: formatVND(PLAN_MONTHLY_PRICE_VND.ultra, locale),
  });
  const cost =
    advice.plan === "basic"
      ? t("pricing.a11y.costBasic", { free: formatVND(0, locale), price, unit })
      : advice.plan === "ultra"
        ? t("pricing.a11y.costUltra", { price, unit, ultra })
        : t("pricing.a11y.costPaid", { price, unit });
  return t(picked ? "pricing.a11y.resultPicked" : "pricing.a11y.result", { plan: name, why, cost });
}
