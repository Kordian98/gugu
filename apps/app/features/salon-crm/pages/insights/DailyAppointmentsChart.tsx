import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";

import type { Insights } from "@gugu/contracts";
import { CalmCard, Icon, Text, radius, space, typeScale, useCalm } from "@gugu/design-system";
import { formatLocalDate, formatNumber } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { EmptyState } from "../../ui/EmptyState";
import { dailyChartData, dailyChartTicks } from "./daily-chart";

/** Daily counts keep their calendar spacing, including dates with no appointments. */
export function DailyAppointmentsChart({
  data,
  from,
  to,
}: {
  data: Insights["daily"];
  from: string;
  to: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const days = dailyChartData(data, from, to);
  const max = Math.max(...days.map((day) => day.appointments), 0);
  const ticks = dailyChartTicks(max);
  const ceiling = ticks.at(-1) ?? 1;
  const [width, setWidth] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const peak = days.findIndex((day) => day.appointments === max);
  const selectedIndex = Math.max(
    0,
    selectedDate && days.some((day) => day.date === selectedDate)
      ? days.findIndex((day) => day.date === selectedDate)
      : peak,
  );
  const selected = days[selectedIndex];
  // Dimensions are multiples of the shared spacing scale; the plot fills its measured card.
  const plotHeight = space[10] * 4;
  const slotWidth = width / Math.max(days.length, 1);
  const barWidth = Math.max(1, Math.min(space[8], slotWidth * 0.65));
  const xLabels = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];

  return (
    <CalmCard testID="crm-insights-daily-card" style={{ gap: space[4], minWidth: 0 }}>
      <View style={{ gap: space[1] }}>
        <Text role="uiSemiBold" size={typeScale.body} color={c.ink}>
          {t("insights.daily")}
        </Text>
        <Text size={typeScale.caption} color={c.muted}>
          {t("insights.dailyHint")}
        </Text>
      </View>
      {max === 0 ? (
        <EmptyState compact icon="calendar" title={t("insights.dailyEmpty")} />
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: space[2],
              padding: space[3],
              backgroundColor: c.surfaceMuted,
              borderRadius: radius.sm,
            }}
          >
            <View style={{ gap: space[1], flex: 1 }} accessibilityLiveRegion="polite">
              <Text size={typeScale.caption} color={c.body}>
                {selected ? formatLocalDate(selected.date, locale) : ""}
              </Text>
              <Text
                testID="crm-insights-daily-selected"
                role="uiSemiBold"
                size={typeScale.body}
                color={c.ink}
              >
                {t("insights.dailyCount", { count: selected?.appointments ?? 0 })}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: space[1] }}>
              {([-1, 1] as const).map((direction) => {
                const next = selectedIndex + direction;
                const disabled = next < 0 || next >= days.length;
                return (
                  <Pressable
                    key={direction}
                    testID={direction < 0 ? "crm-insights-daily-prev" : "crm-insights-daily-next"}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      direction < 0 ? "insights.dailyPrevious" : "insights.dailyNext",
                    )}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => {
                      setSelectedDate(days[next]?.date ?? null);
                    }}
                    style={({ pressed }) => ({
                      width: space[10] + space[1],
                      height: space[10] + space[1],
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: radius.sm,
                      backgroundColor: pressed ? c.accentSoft : c.surface,
                      opacity: disabled ? 0.4 : 1,
                    })}
                  >
                    <Icon
                      name={direction < 0 ? "chevronLeft" : "chevronRight"}
                      size={space[5]}
                      color={c.ink}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <View style={{ width: space[7], height: plotHeight, position: "relative" }}>
              {ticks.map((tick) => (
                <Text
                  key={tick}
                  size={typeScale.micro}
                  color={c.muted}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: (1 - tick / ceiling) * plotHeight - typeScale.micro / 2,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatNumber(tick, locale)}
                </Text>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: space[3] }}>
              <View
                testID="crm-insights-daily"
                style={{ height: plotHeight }}
                onLayout={(event) => {
                  setWidth(event.nativeEvent.layout.width);
                }}
              >
                {width > 0 ? (
                  <Svg width={width} height={plotHeight} accessible={false}>
                    {ticks.map((tick) => (
                      <Line
                        key={tick}
                        x1={0}
                        x2={width}
                        y1={(1 - tick / ceiling) * plotHeight}
                        y2={(1 - tick / ceiling) * plotHeight}
                        stroke={c.line}
                        strokeWidth={1}
                        {...(tick === 0 ? {} : { strokeDasharray: [3, 5] })}
                      />
                    ))}
                    {days.map((day, index) => {
                      const height = (day.appointments / ceiling) * plotHeight;
                      return (
                        <Rect
                          key={day.date}
                          transform={[
                            { translateX: index * slotWidth + (slotWidth - barWidth) / 2 },
                            { translateY: plotHeight - height },
                          ]}
                          width={barWidth}
                          height={height}
                          rx={Math.min(space[1], barWidth / 2)}
                          fill={index === selectedIndex ? c.accent : c.accentBg}
                          onPress={() => {
                            setSelectedDate(day.date);
                          }}
                        />
                      );
                    })}
                  </Svg>
                ) : null}
              </View>
              <View
                style={{ flexDirection: "row", justifyContent: "space-between", gap: space[2] }}
              >
                {xLabels.map((index) => (
                  <Text key={index} size={typeScale.micro} color={c.muted}>
                    {days[index] ? formatLocalDate(days[index].date, locale) : ""}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </>
      )}
    </CalmCard>
  );
}
