import { useState } from "react";
import { Pressable, View } from "react-native";

import { useCalm } from "../../calm";
import { Icon } from "../Icon";
import { Text } from "../Text";
import { monthCells, parseYmd as parse, toYmd } from "./month-grid";

export type DatePickerDayState = "closed" | "unavailable" | null;

/**
 * Month calendar date picker (calm mode). Monday-first weeks, previous/next month, today ring,
 * selected fill. Days outside `min`/`max` are disabled; `dayState` greys closed days (salon closed,
 * holidays) and marks days without free times. `allowBeyondMax` keeps days after `max` selectable
 * (e.g. an audited "outside the booking window" override) but shows them muted.
 * Labels are passed in already translated; the component has no copy of its own.
 */
export function DatePicker({
  value,
  onChange,
  today,
  min,
  max,
  allowBeyondMax = false,
  dayState,
  localeTag,
  prevLabel,
  nextLabel,
  onMonthChange,
  testID,
}: {
  value: string | null;
  onChange: (ymd: string) => void;
  today: string;
  min?: string | undefined;
  max?: string | undefined;
  allowBeyondMax?: boolean | undefined;
  dayState?: ((ymd: string) => DatePickerDayState) | undefined;
  /** BCP-47 tag for month and weekday names, e.g. "vi-VN". */
  localeTag: string;
  prevLabel: string;
  nextLabel: string;
  /** First and last day of the visible month (for fetching availability marks). */
  onMonthChange?: ((first: string, last: string) => void) | undefined;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  const start = parse(value ?? today);
  const [month, setMonth] = useState({ y: start.y, m: start.m });
  const title = new Intl.DateTimeFormat(localeTag, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.y, month.m, 15)));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(localeTag, { weekday: "narrow", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 10, 2 + i)),
    ),
  );
  const minMonth = min ? parse(min) : null;
  const canPrev =
    !minMonth || month.y > minMonth.y || (month.y === minMonth.y && month.m > minMonth.m);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(month.y, month.m + delta, 1));
    const next = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    setMonth(next);
    const last = new Date(Date.UTC(next.y, next.m + 1, 0)).getUTCDate();
    onMonthChange?.(toYmd(next.y, next.m, 1), toYmd(next.y, next.m, last));
  };
  const cells = monthCells(month.y, month.m);

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          testID={testID ? `${testID}-prev` : undefined}
          accessibilityRole="button"
          accessibilityLabel={prevLabel}
          disabled={!canPrev}
          onPress={() => {
            shift(-1);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            opacity: canPrev ? 1 : 0.3,
          }}
        >
          <Icon name="chevronLeft" size={18} color={c.ink} />
        </Pressable>
        <Text role="uiSemiBold" size={15} color={c.ink} style={{ textTransform: "capitalize" }}>
          {title}
        </Text>
        <Pressable
          testID={testID ? `${testID}-next` : undefined}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          onPress={() => {
            shift(1);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="chevronRight" size={18} color={c.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>
        {weekdays.map((w, i) => (
          <Text
            key={i}
            size={11}
            color={c.muted}
            style={{ flex: 1, textAlign: "center", textTransform: "uppercase" }}
          >
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => {
          if (!d)
            return (
              <View key={`e${String(i)}`} style={{ width: `${String(100 / 7)}%`, height: 42 }} />
            );
          const state = dayState?.(d) ?? null;
          const beforeMin = min !== undefined && d < min;
          const afterMax = max !== undefined && d > max;
          const disabled = beforeMin || state === "closed" || (afterMax && !allowBeyondMax);
          const selected = d === value;
          const isToday = d === today;
          const muted = disabled || state === "unavailable" || afterMax;
          return (
            <View
              key={d}
              style={{
                width: `${String(100 / 7)}%`,
                height: 42,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Pressable
                testID={testID ? `${testID}-${d}` : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={d}
                disabled={disabled}
                onPress={() => {
                  onChange(d);
                }}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? c.accentBg : "transparent",
                  borderWidth: isToday && !selected ? 1.5 : 0,
                  borderColor: c.accentBg,
                }}
              >
                <Text
                  role={selected || isToday ? "uiSemiBold" : "ui"}
                  size={14}
                  color={selected ? c.onAccent : muted ? c.muted : c.ink}
                  style={state === "closed" ? { textDecorationLine: "line-through" } : undefined}
                >
                  {String(Number(d.slice(8)))}
                </Text>
                {state === "unavailable" && !selected ? (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 4,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: c.muted,
                    }}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
