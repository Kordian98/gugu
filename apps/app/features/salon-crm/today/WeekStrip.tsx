import { Pressable, ScrollView, View } from "react-native";

import { CalmCard, MIN_TOUCH, radius, space, Text, typeScale, useCalm } from "@gugu/design-system";
import {
  DEFAULT_SALON_TIMEZONE,
  formatDateLong,
  formatNumber,
  formatWeekdayShort,
} from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";
import { addDays, instantAt, isoWeekday, salonDate } from "../data/dates";
import { useCrmNav } from "../shell/useCrmNav";

/** Tap any day to open its calendar; the week follows the salon's timezone. */
export function WeekStrip({
  now,
  timeZone = DEFAULT_SALON_TIMEZONE,
}: {
  now: Date;
  timeZone?: string;
}) {
  const { c } = useCalm();
  const locale = useLocale();
  const { go } = useCrmNav();
  const today = salonDate(now, timeZone);
  const monday = addDays(today, 1 - isoWeekday(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <CalmCard testID="crm-week-strip" padding={space[2]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {days.map((date) => {
          const selected = date === today;
          const noon = new Date(instantAt(date, 12 * 60, timeZone));
          return (
            <Pressable
              key={date}
              testID={`crm-week-day-${date}`}
              accessibilityRole="button"
              accessibilityLabel={formatDateLong(noon, locale, timeZone)}
              accessibilityState={{ selected }}
              onPress={() => {
                go(`/business/calendar?date=${date}`);
              }}
              style={{
                alignItems: "center",
                justifyContent: "center",
                gap: space[1],
                flex: 1,
                minWidth: MIN_TOUCH,
                minHeight: MIN_TOUCH,
                paddingVertical: space[1],
              }}
            >
              <Text
                role="uiMedium"
                size={typeScale.micro}
                color={c.muted}
                style={{ textTransform: "uppercase" }}
              >
                {formatWeekdayShort(noon, locale, timeZone)}
              </Text>
              <View
                style={{
                  width: space[8],
                  height: space[8],
                  borderRadius: radius.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? c.accentBg : "transparent",
                }}
              >
                <Text
                  role={selected ? "uiSemiBold" : "ui"}
                  size={typeScale.body}
                  color={selected ? c.onAccent : c.ink}
                >
                  {formatNumber(Number(date.slice(8)), locale)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </CalmCard>
  );
}
