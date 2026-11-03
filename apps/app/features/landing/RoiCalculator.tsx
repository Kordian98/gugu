import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { GradientText, Text, color, font, gradient } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

/**
 * Benefits built into the pricing cards (owner, 2026-11-04). The visitor sets two numbers once
 * ("your salon"), and every plan card shows what it gives back each month right above its CTA.
 * Clearly illustrative; the assumptions are in `roi.note` under the cards:
 * - time: ≈ 3 min of confirming / reminding / rebooking by phone or chat per booking;
 * - money: 10 % no-shows, 25 % fewer with reminders (BMJ Open 2016), × average service price.
 */
const WEEKS = 4.33;
const MIN_PER_BOOKING = 3;
const NO_SHOW = 0.1;
const FEWER = 0.25;
const MINUS = "−";
const PLUS = "+";

export type Roi = {
  weekly: number;
  price: number;
  setWeekly: (v: number) => void;
  setPrice: (v: number) => void;
  hours: number;
  recovered: number;
};

export function useRoi(): Roi {
  const [weekly, setWeekly] = useState(80);
  const [price, setPrice] = useState(350_000);
  const monthly = weekly * WEEKS;
  return {
    weekly,
    price,
    setWeekly,
    setPrice,
    hours: Math.round((monthly * MIN_PER_BOOKING) / 60),
    recovered: Math.round((monthly * NO_SHOW * FEWER * price) / 1000) * 1000,
  };
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
      accessibilityLabel={`${a11y}: ${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        onChange(Math.min(max, Math.max(min, value + d)));
      }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: color.line,
        backgroundColor: color.white,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text role="uiSemiBold" size={18} color={color.ink}>
        {txt}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <Text size={13.5} color={color.ink2}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {btn(MINUS, t("roi.less"), -step, value <= min)}
        <View style={{ minWidth: 120, alignItems: "center" }}>
          <Text role="uiSemiBold" size={18} color={color.ink}>
            {shown}
          </Text>
        </View>
        {btn(PLUS, t("roi.more"), step, value >= max)}
      </View>
    </View>
  );
}

/** "Your salon": the two inputs that drive every card's benefit. */
export function RoiInputs({ roi, stacked }: { roi: Roi; stacked: boolean }) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  return (
    <View
      style={{
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "flex-start" : "center",
        gap: stacked ? 14 : 36,
        padding: 20,
        borderRadius: 24,
        backgroundColor: color.lilac100,
      }}
    >
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text role="uiSemiBold" size={17} color={color.ink}>
          {t("roi.title")}
        </Text>
        <Text size={13.5} color={color.ink2}>
          {t("roi.sub")}
        </Text>
      </View>
      <Stepper
        label={t("roi.weekly")}
        value={roi.weekly}
        shown={t("roi.perWeek", { n: roi.weekly })}
        onChange={roi.setWeekly}
        step={10}
        min={10}
        max={500}
      />
      <Stepper
        label={t("roi.price")}
        value={roi.price}
        shown={formatVND(roi.price, locale)}
        onChange={roi.setPrice}
        step={50_000}
        min={50_000}
        max={2_000_000}
      />
    </View>
  );
}

/** Basic only: what it saves every month (time + revenue kept), live, right above its CTA. */
export function RoiBenefit({ roi }: { roi: Roi }) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        gap: 4,
        padding: 16,
        borderRadius: 20,
        backgroundColor: color.canvas,
        borderWidth: 1,
        borderColor: color.lineSoft,
      }}
    >
      <Text role="uiSemiBold" size={13} color={color.ink2}>
        {t("roi.save")}
      </Text>
      <GradientText
        colors={gradient.glowHere}
        style={{ fontFamily: font.display, fontSize: 40, lineHeight: 44 }}
      >
        {t("roi.saveHours", { n: roi.hours })}
      </GradientText>
      <Text role="uiSemiBold" size={16} color={color.ink}>
        {t("roi.saveMoney", { v: formatVND(roi.recovered, locale) })}
      </Text>
      <Text size={12.5} color={color.ink2}>
        {t("roi.saveSub")}
      </Text>
      <Text size={11.5} lineHeight={16} color={color.ink2} style={{ marginTop: 4 }}>
        {t("roi.saveNote")}
      </Text>
    </View>
  );
}
