import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import type { SalonSettings, SetupItem, StaffMember } from "@gugu/contracts";
import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";

import { Timeline } from "../../../calendar/Timeline";
import { isoWeekday, minutesInZone, salonDate } from "../../../data/dates";
import { CheckPop, Confetti } from "../parts/Celebrate";
import { successHaptic } from "../parts/haptics";

/** Opening hours of today's weekday in the salon zone (or 9–18) as the preview's visible range. */
function todayRange(settings: SalonSettings, timeZone: string): { start: number; end: number } {
  const weekday = isoWeekday(salonDate(new Date(), timeZone));
  const iv = settings.openingHours.days.find((x) => x.weekday === weekday)?.intervals[0];
  const hour = (v: string | undefined, fallback: number) => (v ? Number(v.slice(0, 2)) : fallback);
  return { start: hour(iv?.start, 9), end: Math.min(24, hour(iv?.end, 18) + 1) };
}

/**
 * Step (f): celebration + a preview of the salon's real (empty) calendar for today, with one
 * suggested first action. Remaining optional items are listed quietly; they also stay on Today.
 */
export function DoneStep({
  team,
  settings,
  timeZone,
  remaining,
  onFirstBooking,
  onToday,
}: {
  team: StaffMember[];
  settings: SalonSettings;
  timeZone: string;
  remaining: SetupItem[];
  onFirstBooking: () => void;
  onToday: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  // One burst when the celebration mounts.
  const [burst] = useState(1);
  useEffect(() => {
    successHaptic();
  }, []);
  const staff = team.filter((s) => s.isBookable).map((s) => ({ id: s.id, name: s.displayName }));
  const range = todayRange(settings, timeZone);
  return (
    <View style={{ gap: 20 }} testID="crm-setup-done">
      <View style={{ alignItems: "center", gap: 14, paddingTop: 8 }}>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <CheckPop size={72} testID="crm-setup-done-check" />
          <Confetti burst={burst} pieces={28} spread={170} />
        </View>
        <Text
          role="uiSemiBold"
          size={26}
          lineHeight={32}
          color={c.ink}
          style={{ textAlign: "center" }}
          testID="crm-setup-title"
        >
          {t("setupWizard.done.title")}
        </Text>
        <Text size={16} color={c.body} style={{ textAlign: "center", maxWidth: 520 }}>
          {t("setupWizard.done.body")}
        </Text>
      </View>

      <View
        style={{
          gap: 12,
          padding: 16,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        <Text role="uiSemiBold" size={15} color={c.ink}>
          {t("setupWizard.done.calendarTitle")}
        </Text>
        {staff.length > 0 ? (
          <View style={{ maxHeight: 320, overflow: "hidden" }} testID="crm-setup-calendar-preview">
            <Timeline
              staff={staff}
              items={[]}
              startHour={range.start}
              endHour={range.end}
              hourHeight={44}
              timeZone={timeZone}
              nowMinutes={minutesInZone(new Date(), timeZone)}
            />
          </View>
        ) : (
          <Text size={14} color={c.muted}>
            {t("setupWizard.done.noStaff")}
          </Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <CalmButton
          testID="crm-setup-first-booking"
          icon="plus"
          label={t("setupWizard.done.firstBooking")}
          onPress={onFirstBooking}
        />
        <CalmButton
          testID="crm-setup-to-today"
          variant="secondary"
          label={t("setupWizard.done.toToday")}
          onPress={onToday}
        />
      </View>

      {remaining.length > 0 ? (
        <View style={{ gap: 6 }} testID="crm-setup-done-remaining">
          <Text size={13} color={c.muted}>
            {t("setupWizard.done.later")}
          </Text>
          {remaining.map((r) => (
            <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="clock" size={14} color={c.muted} />
              <Text size={14} color={c.body}>
                {t(`finishSetup.items.${r}`)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
