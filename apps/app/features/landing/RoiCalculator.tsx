import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { MIN_TOUCH, Text, color, opacity, radius } from "@gugu/design-system";
import { formatNumber, formatPercentPoints, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { ASSUMPTIONS, LIMITS, type Advice } from "./pricing/model";

const MINUS = "−";
const PLUS = "+";

/**
 * "Cách tính" (X27 buying assistant): the two numbers behind the savings estimate (defaults from
 * the team size; the visitor may change them) and every step of the sum in plain numbers. The
 * figures are assumptions, labelled as such; the plan cost comes from the shared list prices.
 */
export function RoiCalculator({
  weekly,
  price,
  setWeekly,
  setPrice,
  advice,
}: {
  weekly: number;
  price: number;
  setWeekly: (v: number) => void;
  setPrice: (v: number) => void;
  advice: Advice;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const vnd = (v: number) => formatVND(v, locale);
  const e = advice.estimate;
  const steps = [
    t("roi.stepMonth", {
      weekly: formatNumber(weekly, locale),
      weeks: formatNumber(ASSUMPTIONS.weeksPerMonth, locale, 2),
      n: formatNumber(e.bookingsPerMonth, locale),
    }),
    t("roi.stepTime", {
      min: formatNumber(ASSUMPTIONS.minutesPerBooking, locale),
      h: formatNumber(e.hours, locale),
    }),
    t("roi.stepNoShow", {
      rate: formatPercentPoints(ASSUMPTIONS.noShowRate * 100, locale),
      cut: formatPercentPoints(ASSUMPTIONS.reminderCut * 100, locale),
      a: formatNumber(e.noShowsAvoided, locale, 1),
    }),
    t("roi.stepMoney", { price: vnd(price), v: vnd(e.keptVnd) }),
    t("roi.stepNet", {
      cost: vnd(advice.cost.firstYearPerMonthVnd),
      net: vnd(advice.netFirstYearPerMonthVnd),
    }),
  ];
  return (
    <View style={{ gap: 16 }} testID="pricing-how">
      <Text size={14} lineHeight={21} color={color.body}>
        {t("roi.intro")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
        <Stepper
          label={t("roi.weekly")}
          value={weekly}
          shown={t("roi.perWeek", { n: formatNumber(weekly, locale) })}
          onChange={setWeekly}
          {...LIMITS.weekly}
        />
        <Stepper
          label={t("roi.price")}
          value={price}
          shown={vnd(price)}
          onChange={setPrice}
          {...LIMITS.price}
        />
      </View>
      <View
        style={{
          gap: 10,
          padding: 16,
          borderRadius: radius.lg,
          backgroundColor: color.white,
          borderWidth: 1,
          borderColor: color.lineSoft,
        }}
      >
        {steps.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: color.lilac100,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text role="uiSemiBold" size={12} color={color.ink2}>
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size={14} lineHeight={21} color={color.ink2}>
                {s}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text size={12.5} lineHeight={19} color={color.body}>
        {t("roi.source", { cut: formatPercentPoints(ASSUMPTIONS.reminderCut * 100, locale) })}
      </Text>
    </View>
  );
}

function Stepper({
  label,
  value,
  shown,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  shown: string;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  const { t } = useTranslation("landing");
  const btn = (txt: string, a11y: string, d: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("roi.stepA11y", { action: a11y, label })}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => {
        onChange(Math.min(max, Math.max(min, value + d)));
      }}
      style={(state) => ({
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        borderRadius: MIN_TOUCH / 2,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: (state as { hovered?: boolean }).hovered ? color.lilac700 : color.lineStrong,
        backgroundColor: color.white,
        opacity: disabled ? opacity.disabled : 1,
        transform: [{ scale: state.pressed ? 0.94 : 1 }],
      })}
    >
      <View aria-hidden importantForAccessibility="no-hide-descendants">
        <Text role="uiSemiBold" size={18} color={color.ink}>
          {txt}
        </Text>
      </View>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <Text size={13.5} color={color.ink2}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {btn(MINUS, t("roi.less"), -step, value <= min)}
        <View style={{ minWidth: 112, alignItems: "center" }} accessibilityLiveRegion="polite">
          <Text role="uiSemiBold" size={17} color={color.ink}>
            {shown}
          </Text>
        </View>
        {btn(PLUS, t("roi.more"), step, value >= max)}
      </View>
    </View>
  );
}
