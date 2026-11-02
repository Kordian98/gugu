import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { Avatar, Text, useCalm } from "@gugu/design-system";
import { DEFAULT_SALON_TIMEZONE, formatTime } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { BookingStatus, StaffMember, TimelineItem } from "../data/types";

const STATUS_KEY = {
  confirmed: "confirmed",
  inProgress: "inProgress",
  pending: "pending",
  completed: "completed",
} as const satisfies Record<BookingStatus, string>;

/** Minutes since local midnight in the salon timezone. */
function minutesInZone(d: Date): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: DEFAULT_SALON_TIMEZONE,
  })
    .format(d)
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Staff-column day timeline (ref crm-01): time gutter, one column per team member, coloured blocks
 * (lilac confirmed, pink in progress, peach pending), hatched breaks. Purely presentational: the
 * booking engine (06) is the source of truth for what is shown and where it may move.
 */
export function Timeline({
  staff,
  items,
  startHour = 9,
  endHour = 18,
  hourHeight = 46,
}: {
  staff: StaffMember[];
  items: TimelineItem[];
  startHour?: number | undefined;
  endHour?: number | undefined;
  hourHeight?: number | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const gutter = locale === "en" ? 76 : 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const top = (d: Date) => ((minutesInZone(d) - startHour * 60) / 60) * hourHeight;
  const height = (endHour - startHour) * hourHeight;
  const label = (h: number) =>
    formatTime(new Date(Date.UTC(2026, 0, 1, h - 7, 0)), locale, DEFAULT_SALON_TIMEZONE);

  return (
    <View testID="crm-timeline">
      <View style={{ flexDirection: "row", paddingLeft: gutter, paddingBottom: 10 }}>
        {staff.map((s) => (
          <View
            key={s.id}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8 }}
          >
            <Avatar name={s.name} size={28} />
            <Text role="uiMedium" size={14} color={c.ink}>
              {s.name}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", height: height + 12 }}>
        <View style={{ width: gutter }}>
          {hours.map((h) => (
            <Text
              key={h}
              size={12}
              color={c.body}
              style={{ position: "absolute", top: (h - startHour) * hourHeight - 2, right: 10 }}
            >
              {label(h)}
            </Text>
          ))}
        </View>
        <View
          style={{ flex: 1, flexDirection: "row", borderLeftWidth: 1, borderLeftColor: c.line }}
        >
          {hours.map((h) => (
            <View
              key={h}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (h - startHour) * hourHeight + 6,
                height: 1,
                backgroundColor: c.line,
              }}
            />
          ))}
          {staff.map((s) => (
            <View key={s.id} style={{ flex: 1, borderRightWidth: 1, borderRightColor: c.line }}>
              {items
                .filter((i) => i.staffId === s.id)
                .map((i) => {
                  const y = top(i.start) + 8;
                  const h = Math.max(top(i.end) - top(i.start) - 4, 22);
                  return i.kind === "break" ? (
                    <BreakBlock key={i.id} y={y} h={h} label={t("timeline.break")} />
                  ) : (
                    <View
                      key={i.id}
                      accessible
                      accessibilityLabel={`${formatTime(i.start, locale)} ${i.service}, ${i.customer}, ${t(`timeline.status.${STATUS_KEY[i.status]}`)}`}
                      style={{
                        position: "absolute",
                        top: y,
                        left: 4,
                        right: 4,
                        height: h,
                        borderRadius: 8,
                        borderLeftWidth: 3,
                        borderLeftColor: c.event[i.status].border,
                        backgroundColor: c.event[i.status].bg,
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                        overflow: "hidden",
                        gap: 1,
                      }}
                    >
                      {h < 40 ? (
                        <Text size={12} color={c.event[i.status].text} numberOfLines={1}>
                          {`${formatTime(i.start, locale)} · ${i.service}`}
                        </Text>
                      ) : (
                        <>
                          <Text size={12} color={c.event[i.status].text} numberOfLines={1}>
                            {formatTime(i.start, locale)}
                          </Text>
                          <Text
                            role="uiSemiBold"
                            size={13}
                            color={c.event[i.status].text}
                            numberOfLines={1}
                          >
                            {i.service}
                          </Text>
                        </>
                      )}
                      {h > 56 ? (
                        <Text size={12} color={c.event[i.status].text} numberOfLines={1}>
                          {i.customer}
                        </Text>
                      ) : null}
                      {h > 76 ? (
                        <View
                          style={{
                            alignSelf: "flex-start",
                            marginTop: 3,
                            paddingHorizontal: 7,
                            paddingVertical: 1,
                            borderRadius: 999,
                            backgroundColor: c.surface,
                          }}
                        >
                          <Text role="uiMedium" size={11} color={c.ink}>
                            {t(`timeline.status.${STATUS_KEY[i.status]}`)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function BreakBlock({ y, h, label }: { y: number; h: number; label: string }) {
  const { c } = useCalm();
  const id = `hatch${useId().replace(/:/g, "")}`;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        position: "absolute",
        top: y,
        left: 4,
        right: 4,
        height: h,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: c.event.break.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        width="100%"
        height="100%"
      >
        <Defs>
          <Pattern
            id={id}
            patternUnits="userSpaceOnUse"
            width={8}
            height={8}
            patternTransform="rotate(45)"
          >
            <Line x1={0} y1={0} x2={0} y2={8} stroke={c.event.break.hatch} strokeWidth={3} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <Text role="uiMedium" size={12} color={c.event.break.text}>
        {label}
      </Text>
    </View>
  );
}
