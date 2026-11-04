import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";

import { type BillingInterval, planPriceVnd } from "@gugu/contracts";
import { GradientText, Text, color, font, gradient, motion, radius } from "@gugu/design-system";
import { yearlySavingVnd } from "@gugu/domain";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { Advice } from "./model";
import { useCountUp } from "./useCountUp";

/** Small building blocks of the pricing result card. */
const NATIVE_DRIVER = Platform.OS !== "web";
const TEST_ID = { first: "pricing-first-year", later: "pricing-later" } as const;

/** Pop + check draw-in whenever `trigger` changes (skipped with reduced motion). */
export function usePop(trigger: string, reduce: boolean) {
  const [scale] = useState(() => new Animated.Value(1));
  const [check] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      return;
    }
    scale.setValue(0.965);
    check.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 160,
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(check, {
        toValue: 1,
        duration: motion.duration.slow,
        delay: motion.duration.fast,
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]).start();
  }, [trigger, reduce, scale, check]);
  return { scale, check };
}

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
      ? t("pricing.cost.saveYear", { v: formatVND(yearlySavingVnd(plan), locale) })
      : t("pricing.cost.orYear", { price: formatVND(planPriceVnd(plan, "year"), locale) });
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

/** Net monthly value (big, glides on change) + one line of what it is made of + disclaimer. */
export function Savings({
  advice,
  reduce,
  desktop,
}: {
  advice: Advice;
  reduce: boolean;
  desktop: boolean;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const net = advice.netFirstYearPerMonthVnd;
  const netShown = useCountUp(Math.abs(net), reduce);
  const hours = useCountUp(advice.estimate.hours, reduce);
  const kept = useCountUp(advice.estimate.keptVnd, reduce);
  const big = desktop ? 30 : 26;
  return (
    <View
      style={{
        gap: 2,
        padding: desktop ? 14 : 12,
        borderRadius: radius.md,
        backgroundColor: color.lilac100,
      }}
    >
      <Text role="uiSemiBold" size={12} color={color.ink2}>
        {t("pricing.save.label")}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <GradientText
          colors={gradient.glowSoft}
          style={{ fontFamily: font.display, fontSize: big, lineHeight: big * 1.15 }}
        >
          {t(net >= 0 ? "pricing.save.big" : "pricing.save.bigNegative", {
            v: formatVND(netShown, locale),
          })}
        </GradientText>
        <Text role="uiSemiBold" size={14} color={color.ink2}>
          {t("pricing.cost.unitMonth")}
        </Text>
      </View>
      <Text
        testID="pricing-save"
        role="uiSemiBold"
        size={desktop ? 14.5 : 13}
        lineHeight={desktop ? 21 : 18}
        color={color.ink}
      >
        {t("pricing.save.line", { h: hours, v: formatVND(kept, locale) })}
      </Text>
      <Text size={11.5} lineHeight={15} color={color.ink2}>
        {t("pricing.save.disclaimer")}
      </Text>
    </View>
  );
}
