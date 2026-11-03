import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, GradientText, Text, color, font, gradient } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { BASIC_MONTHLY_VND } from "./plans";

/**
 * "What you save vs what you invest" (pricing, owner 2026-11-04). Clearly illustrative, assumptions
 * spelled out in the note:
 * - time: ≈ 3 min of confirming / reminding / rebooking by phone or chat per booking;
 * - money: 10 % no-shows, 25 % fewer with reminders (BMJ Open 2016), × average service price;
 * - cost: Basic is 0 ₫ in the first year, then BASIC_MONTHLY_VND per month (X25).
 */
const WEEKS = 4.33;
const MIN_PER_BOOKING = 3;
const NO_SHOW = 0.1;
const FEWER = 0.25;
const MINUS = "\u2212";
const PLUS = "+";
type TileKey = "time" | "money" | "cost";

function Stepper({
  label,
  value,
  shown,
  onChange,
  step,
  min,
  max,
  less,
  more,
}: {
  label: string;
  value: number;
  shown: string;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  less: string;
  more: string;
}) {
  const btn = (txt: string, a11y: string, d: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
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
    <View className="gap-2">
      <Text size={14} color={color.ink2}>
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        {btn(MINUS, less, -step, value <= min)}
        <View style={{ minWidth: 132, alignItems: "center" }}>
          <Text role="uiSemiBold" size={18} color={color.ink}>
            {shown}
          </Text>
        </View>
        {btn(PLUS, more, step, value >= max)}
      </View>
    </View>
  );
}

export function RoiCalculator({ stacked, onStart }: { stacked: boolean; onStart: () => void }) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const [weekly, setWeekly] = useState(80);
  const [price, setPrice] = useState(350_000);
  const monthly = weekly * WEEKS;
  const hours = Math.round((monthly * MIN_PER_BOOKING) / 60);
  const recovered = Math.round((monthly * NO_SHOW * FEWER * price) / 1000) * 1000;
  const multiple = Math.max(1, Math.floor(recovered / BASIC_MONTHLY_VND));
  const vnd = (v: number) => formatVND(v, locale);
  const tile = (k: TileKey, value: string, sub: string, dark = false) => (
    <View
      key={k}
      style={{
        flex: 1,
        gap: 4,
        borderRadius: 22,
        padding: 20,
        backgroundColor: dark ? color.plum950 : color.white,
      }}
    >
      <Text size={13.5} color={dark ? color.lilac100 : color.ink2}>
        {t(`roi.${k}`)}
      </Text>
      {dark ? (
        <Text role="display" size={40} lineHeight={44} color={color.white}>
          {value}
        </Text>
      ) : (
        <GradientText
          colors={gradient.glowHere}
          style={{ fontFamily: font.display, fontSize: 40, lineHeight: 44 }}
        >
          {value}
        </GradientText>
      )}
      <Text size={13} color={dark ? color.lilac100 : color.ink2}>
        {sub}
      </Text>
    </View>
  );
  return (
    <View
      className="gap-6 rounded-[30px] p-6 min-[900px]:p-8"
      style={{ backgroundColor: color.lilac100 }}
      accessibilityLabel={t("roi.title")}
    >
      <View className="gap-2">
        <Text role="display" size={30} lineHeight={34} color={color.ink}>
          {t("roi.title")}
        </Text>
        <Text size={15} color={color.ink2}>
          {t("roi.sub")}
        </Text>
      </View>
      <View className={stacked ? "gap-5" : "flex-row gap-10"}>
        <Stepper
          label={t("roi.weekly")}
          value={weekly}
          shown={t("roi.perWeek", { n: weekly })}
          onChange={setWeekly}
          step={10}
          min={10}
          max={500}
          less={t("roi.less")}
          more={t("roi.more")}
        />
        <Stepper
          label={t("roi.price")}
          value={price}
          shown={vnd(price)}
          onChange={setPrice}
          step={50_000}
          min={50_000}
          max={2_000_000}
          less={t("roi.less")}
          more={t("roi.more")}
        />
      </View>
      <View className={stacked ? "gap-3" : "flex-row gap-3"} accessibilityLiveRegion="polite">
        {tile("time", t("roi.hours", { n: hours }), t("roi.timeSub"))}
        {tile("money", vnd(recovered), t("roi.moneySub"))}
        {tile("cost", vnd(0), t("roi.costSub", { price: vnd(BASIC_MONTHLY_VND) }), true)}
      </View>
      <View className={stacked ? "gap-4" : "flex-row items-center justify-between gap-6"}>
        <Text role="uiSemiBold" size={17} color={color.ink} style={{ flexShrink: 1 }}>
          {recovered >= BASIC_MONTHLY_VND * 2
            ? t("roi.verdict", { x: multiple })
            : t("roi.verdictLow", { price: vnd(BASIC_MONTHLY_VND) })}
        </Text>
        <Button
          label={t("roi.cta")}
          onPress={onStart}
          height={56}
          fontSize={16.5}
          paddingX={30}
          trailingArrow
        />
      </View>
      <Text size={12.5} lineHeight={19} color={color.ink2}>
        {t("roi.note")}
      </Text>
    </View>
  );
}
