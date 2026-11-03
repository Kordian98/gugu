import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { checkableA11y, font, Icon, type IconName, Text, useCalm } from "@gugu/design-system";
import { formatLocalDate, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { MonthStatus } from "./model";
import { effectiveChoiceOf, effectivePreview, monthStart, parseMoney, parsePercent } from "./model";
import { DateField } from "./parts";

/**
 * Building blocks of the payroll & commission screens (owner review 2026-11-03): big, obvious
 * inputs with 44 pt targets, a segmented control sized for thumbs, the effective-date choice with
 * a plain-language preview, an undo bar (6 s) and the month status chip. Calm tokens only.
 */

/** Digits grouped as the locale writes money, without the currency sign ("8.000.000"). */
const grouped = (n: number, locale: "vi" | "en") => formatVND(n, locale).replace(/đ$/, "");

/** Large VND input: grouped digits while typing, "đ" suffix, number out. */
export function BigMoneyInput({
  value,
  onChange,
  label,
  testID,
  invalid,
  size = "lg",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  testID?: string | undefined;
  invalid?: boolean | undefined;
  size?: "lg" | "md" | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const fs = size === "lg" ? 24 : 16;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: size === "lg" ? 56 : 44,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: invalid ? 2 : 1,
        borderColor: invalid ? c.attention : c.line,
        backgroundColor: c.surface,
      }}
    >
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value === null ? "" : grouped(value, locale)}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={c.muted}
        onChangeText={(s) => {
          onChange(parseMoney(s));
        }}
        style={{
          flex: 1,
          minWidth: 0,
          color: c.ink,
          fontFamily: font.uiSemiBold,
          fontSize: fs,
          paddingVertical: 8,
        }}
      />
      <Text role="uiSemiBold" size={fs} color={c.muted}>
        {t("payroll.currencySuffix")}
      </Text>
    </View>
  );
}

/** Large percentage input ("12,5" → 12.5), "%" suffix, plus optional quick-pick chips. */
export function BigPercentInput({
  value,
  onChange,
  label,
  testID,
  invalid,
  quick,
  size = "lg",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  testID?: string | undefined;
  invalid?: boolean | undefined;
  quick?: number[] | undefined;
  size?: "lg" | "md" | undefined;
}) {
  const { c } = useCalm();
  const [text, setText] = useState(value === null ? "" : String(value));
  // Follow outside changes (quick chips, bulk) without fighting the user's typing.
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === null ? "" : String(value));
    }
  }, [value]);
  const fs = size === "lg" ? 24 : 16;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          width: size === "lg" ? 140 : 110,
          minHeight: size === "lg" ? 56 : 44,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: invalid ? 2 : 1,
          borderColor: invalid ? c.attention : c.line,
          backgroundColor: c.surface,
        }}
      >
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          value={text}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={c.muted}
          onChangeText={(s) => {
            const clean = s.replace(/[^\d.,]/g, "").slice(0, 6);
            setText(clean);
            const n = parsePercent(clean);
            last.current = n;
            onChange(n);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            color: c.ink,
            fontFamily: font.uiSemiBold,
            fontSize: fs,
            paddingVertical: 8,
          }}
        />
        <Text role="uiSemiBold" size={fs} color={c.muted}>
          %
        </Text>
      </View>
      {quick?.length ? (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {quick.map((q) => (
            <Chip
              key={q}
              label={`${String(q)}%`}
              selected={value === q}
              onPress={() => {
                last.current = q;
                setText(String(q));
                onChange(q);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Pill-shaped choice (radio semantics), 44 pt high. */
export function Chip({
  label,
  selected,
  onPress,
  testID,
  role = "radio",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string | undefined;
  role?: "radio" | "checkbox";
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      {...checkableA11y(role, selected)}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: selected ? c.accentBg : c.line,
        backgroundColor: selected ? c.accentSoft : c.surface,
      }}
    >
      {selected && role === "checkbox" ? <Icon name="check" size={14} color={c.accent} /> : null}
      <Text role={selected ? "uiSemiBold" : "ui"} size={15} color={selected ? c.accent : c.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Segmented control sized for thumbs: equal-width options, 48 pt high, radio semantics. */
export function BigSegmented<T extends string>({
  value,
  options,
  onChange,
  label,
  testID,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
        padding: 4,
        borderRadius: 16,
        backgroundColor: c.surfaceMuted,
      }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            testID={testID ? `${testID}-${o.id}` : undefined}
            {...checkableA11y("radio", on)}
            accessibilityLabel={o.label}
            onPress={() => {
              onChange(o.id);
            }}
            style={{
              flexGrow: 1,
              flexBasis: 120,
              minHeight: 48,
              paddingHorizontal: 12,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? c.surface : "transparent",
              borderWidth: on ? 1 : 0,
              borderColor: c.accentBg,
            }}
          >
            <Text role={on ? "uiSemiBold" : "uiMedium"} size={15} color={on ? c.ink : c.body}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * "From when?": today (default) / first of this month / another date, and one plain sentence
 * saying what that means ("Áp dụng từ 03/11/2026; các tháng trước không đổi").
 */
export function EffectiveFrom({
  value,
  onChange,
  today,
  testID,
}: {
  value: string;
  onChange: (ymd: string) => void;
  today: string;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const choice = effectiveChoiceOf(value, today);
  const [custom, setCustom] = useState(choice === "custom");
  const first = monthStart(today);
  const preview = effectivePreview(value, today);
  return (
    <View testID={testID} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip
          testID={testID ? `${testID}-today` : undefined}
          label={t("payroll.effective.today", { date: formatLocalDate(today, locale) })}
          selected={!custom && choice === "today"}
          onPress={() => {
            setCustom(false);
            onChange(today);
          }}
        />
        {first !== today ? (
          <Chip
            testID={testID ? `${testID}-month` : undefined}
            label={t("payroll.effective.monthStart", { date: formatLocalDate(first, locale) })}
            selected={!custom && choice === "monthStart"}
            onPress={() => {
              setCustom(false);
              onChange(first);
            }}
          />
        ) : null}
        <Chip
          testID={testID ? `${testID}-custom` : undefined}
          label={t("payroll.effective.custom")}
          selected={custom || choice === "custom"}
          onPress={() => {
            setCustom(true);
          }}
        />
      </View>
      {custom || choice === "custom" ? (
        <DateField value={value} onChange={onChange} today={today} />
      ) : null}
      <View
        testID={testID ? `${testID}-preview` : undefined}
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          padding: 12,
          borderRadius: 12,
          backgroundColor: c.surfaceMuted,
        }}
      >
        <Icon name="calendar" size={16} color={c.body} />
        <Text size={14} color={c.body} style={{ flex: 1 }}>
          {t(`payroll.effective.preview.${preview}`, { date: formatLocalDate(value, locale) })}
        </Text>
      </View>
    </View>
  );
}

const STATUS_ICON: Record<MonthStatus, IconName> = {
  future: "calendar",
  open: "clock",
  closed: "check",
  paid: "wallet",
};

/** Month status: icon + label + tone (never colour alone). */
export function StatusChip({ status, testID }: { status: MonthStatus; testID?: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const tone =
    status === "open" || status === "future"
      ? { bg: c.surfaceMuted, fg: c.ink }
      : { bg: c.up.bg, fg: c.up.text };
  return (
    <View
      testID={testID}
      accessibilityLabel={t(`payroll.monthStatus.${status}`)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: tone.bg,
      }}
    >
      <Icon name={STATUS_ICON[status]} size={14} color={tone.fg} />
      <Text role="uiSemiBold" size={14} color={tone.fg}>
        {t(`payroll.monthStatus.${status}`)}
      </Text>
    </View>
  );
}

export type UndoState = { id: number; message: string; undo: () => void } | null;

/** One pending undo at a time, gone after 6 s (07 §3.11: reversible actions use undo). */
export function useUndo() {
  const [state, setState] = useState<UndoState>(null);
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => {
      setState((s) => (s?.id === state.id ? null : s));
    }, 6000);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);
  return {
    state,
    show: (message: string, undo: () => void) => {
      setState({ id: Date.now(), message, undo });
    },
    dismiss: () => {
      setState(null);
    },
  };
}

/** Inline undo snackbar (renders where it is placed: in the screen or inside a sheet). */
export function UndoBar({
  state,
  onDismiss,
  testID = "crm-undo",
}: {
  state: UndoState;
  onDismiss: () => void;
  testID?: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  if (!state) return null;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingLeft: 16,
        paddingRight: 6,
        minHeight: 52,
        borderRadius: 14,
        backgroundColor: c.ink,
      }}
    >
      <Text size={15} color={c.canvas} style={{ flex: 1 }}>
        {state.message}
      </Text>
      <Pressable
        testID={`${testID}-action`}
        accessibilityRole="button"
        onPress={() => {
          state.undo();
          onDismiss();
        }}
        style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center" }}
      >
        <Text role="uiSemiBold" size={15} color={c.canvas}>
          {t("payroll.undo.action")}
        </Text>
      </Pressable>
    </View>
  );
}

/** Big figure with a small label above and an optional note below. */
export function BigNumber({
  label,
  value,
  note,
  testID,
  size = 32,
  tone = "ink",
}: {
  label: string;
  value: string;
  note?: ReactNode;
  testID?: string | undefined;
  size?: number;
  tone?: "ink" | "muted" | "attention";
}) {
  const { c } = useCalm();
  const color = tone === "attention" ? c.attention : tone === "muted" ? c.body : c.ink;
  return (
    <View style={{ gap: 2, minWidth: 140 }}>
      <Text role="uiMedium" size={14} color={c.body}>
        {label}
      </Text>
      <Text testID={testID} role="uiSemiBold" size={size} lineHeight={size * 1.2} color={color}>
        {value}
      </Text>
      {typeof note === "string" ? (
        <Text size={13} color={c.muted}>
          {note}
        </Text>
      ) : (
        (note ?? null)
      )}
    </View>
  );
}

/** Tabs as a radio group (Payroll: "Bảng lương" | "Mức lương & hoa hồng"). */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  testID,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", gap: 4, borderBottomWidth: 1, borderColor: c.line }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            testID={testID ? `${testID}-${o.id}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => {
              onChange(o.id);
            }}
            style={{
              minHeight: 48,
              paddingHorizontal: 14,
              justifyContent: "center",
              borderBottomWidth: 3,
              borderColor: on ? c.accentBg : "transparent",
              marginBottom: -1,
            }}
          >
            <Text role={on ? "uiSemiBold" : "uiMedium"} size={15} color={on ? c.ink : c.body}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
