import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, DatePicker, Icon, Text, useCalm } from "@gugu/design-system";
import { formatLocalDate, formatMonth, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { shiftMonth } from "../../data/payroll";
import { Input } from "../../ui/form";

/** Typographic signs (not copy): minus sign, em dash, middle dot. */
const PLUS = "+";
const MINUS = "\u2212";
export const DASH = "\u2014";
export const DOT = " \u00b7 ";

/** +500.000đ / −200.000đ / — for zero. */
export function signedVnd(n: number, locale: "vi" | "en"): string {
  if (n === 0) return DASH;
  return `${n > 0 ? PLUS : MINUS}${formatVND(Math.abs(n), locale)}`;
}

/** ‹ Tháng 11/2026 › — one control, 44 pt targets. */
export function MonthSwitcher({
  month,
  onChange,
  testID,
}: {
  month: string;
  onChange: (m: string) => void;
  testID?: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const arrow = (n: number, label: string, icon: "chevronLeft" | "chevronRight") => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID ? `${testID}-${n < 0 ? "prev" : "next"}` : undefined}
      onPress={() => {
        onChange(shiftMonth(month, n));
      }}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name={icon} size={18} color={c.ink} />
    </Pressable>
  );
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      {arrow(-1, t("payroll.prevMonth"), "chevronLeft")}
      <Text
        role="uiSemiBold"
        size={15}
        color={c.ink}
        style={{ minWidth: 120, textAlign: "center" }}
      >
        {formatMonth(month, locale)}
      </Text>
      {arrow(1, t("payroll.nextMonth"), "chevronRight")}
    </View>
  );
}

/** Calm info banner (lilac tint) used for the "estimate before tax and insurance" note. */
export function Note({ text, testID }: { text: string; testID?: string }) {
  const { c } = useCalm();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        padding: 12,
        borderRadius: 14,
        backgroundColor: c.accentSoft,
      }}
    >
      <Icon name="alert" size={16} color={c.accent} />
      <Text size={13} color={c.body} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

export function SectionTitle({ text }: { text: string }) {
  const { c } = useCalm();
  return (
    <Text
      role="uiSemiBold"
      size={12}
      color={c.ink}
      style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
    >
      {text}
    </Text>
  );
}

/** A date shown as text; tapping opens an inline calendar (one sheet at most, no modal stack). */
export function DateField({
  value,
  onChange,
  today,
  testID,
}: {
  value: string;
  onChange: (ymd: string) => void;
  today: string;
  testID?: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => {
          setOpen((o) => !o);
        }}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        <Icon name="calendar" size={16} color={c.body} />
        <Text size={15} color={c.ink}>
          {formatLocalDate(value, locale)}
        </Text>
      </Pressable>
      {open ? (
        <DatePicker
          value={value}
          today={today}
          allowBeyondMax
          localeTag={locale === "vi" ? "vi-VN" : "en-US"}
          prevLabel={t("payroll.prevMonth")}
          nextLabel={t("payroll.nextMonth")}
          onChange={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** Percent with up to two decimals ("12,5" or "12.5" → 12.5), clamped to 0–100. */
export function PercentInput({
  value,
  onChange,
  label,
  testID,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  testID?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <Input
      testID={testID}
      label={label}
      width={96}
      keyboardType="decimal-pad"
      value={text}
      onChangeText={(s) => {
        const clean = s
          .replace(",", ".")
          .replace(/[^\d.]/g, "")
          .slice(0, 6);
        setText(clean);
        const n = clean === "" ? null : Number(clean);
        onChange(n === null || Number.isNaN(n) ? null : Math.min(100, Math.round(n * 100) / 100));
      }}
    />
  );
}

/** Skeleton rows for list loading states (no full-screen spinners, 07 §3.9). */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 10 }} accessibilityElementsHidden>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ height: 52, borderRadius: 12, backgroundColor: c.surfaceMuted }} />
      ))}
    </View>
  );
}

export function RetryError({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
      <Text size={14} color={c.body}>
        {text}
      </Text>
      <CalmButton size="sm" variant="secondary" label={t("payroll.retry")} onPress={onRetry} />
    </View>
  );
}
