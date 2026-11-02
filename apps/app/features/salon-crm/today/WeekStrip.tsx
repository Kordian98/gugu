import { View } from "react-native";

import { CalmCard, Text, useCalm } from "@gugu/design-system";
import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

/** Current week (Mon–Sun) in the salon timezone with today highlighted (ref crm-02 phone). */
export function WeekStrip({ now }: { now: Date }) {
  const { c } = useCalm();
  const locale = useLocale();
  const tz = DEFAULT_SALON_TIMEZONE;
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const noon = new Date(`${ymd}T12:00:00+07:00`);
  // 12:00 in HCMC is 05:00 UTC on the same calendar day, so getUTCDay() is the salon's weekday.
  const dow = noon.getUTCDay() || 7;
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(noon.getTime() + (i + 1 - dow) * 86_400_000),
  );
  const tag = locale === "vi" ? "vi-VN" : "en-US";
  return (
    <CalmCard
      testID="crm-week-strip"
      padding={12}
      style={{ flexDirection: "row", justifyContent: "space-between" }}
    >
      {days.map((d) => {
        const today = d.getTime() === noon.getTime();
        return (
          <View key={d.toISOString()} style={{ alignItems: "center", gap: 6, flex: 1 }}>
            <Text role="uiMedium" size={11} color={c.muted} style={{ textTransform: "uppercase" }}>
              {new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: tz }).format(d)}
            </Text>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: today ? c.accentBg : "transparent",
              }}
            >
              <Text role={today ? "uiSemiBold" : "ui"} size={14} color={today ? c.onAccent : c.ink}>
                {new Intl.DateTimeFormat(tag, { day: "numeric", timeZone: tz }).format(d)}
              </Text>
            </View>
          </View>
        );
      })}
    </CalmCard>
  );
}
