import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";
import type { StaffMember, WeeklyScheduleInput } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Sheet, TimeInput, Toggle, isClock } from "../../ui/form";

type Day = {
  weekday: number;
  on: boolean;
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** ISO weekday label in the UI locale (2026-11-02 is a Monday). */
export function weekdayLabel(
  weekday: number,
  locale: "vi" | "en",
  style: "short" | "long" = "long",
) {
  const d = new Date(Date.UTC(2026, 10, 1 + weekday, 12));
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    weekday: style,
    timeZone: "UTC",
  }).format(d);
}

const fromStaff = (s: StaffMember): Day[] =>
  WEEKDAYS.map((weekday) => {
    const day = s.schedule.days.find((d) => d.weekday === weekday);
    const first = day?.intervals[0];
    const last = day?.intervals[day.intervals.length - 1];
    const brk = day?.breaks[0];
    return {
      weekday,
      on: Boolean(first),
      start: first?.start ?? "09:00",
      end: last?.end ?? "18:00",
      breakStart: brk?.start ?? "",
      breakEnd: brk?.end ?? "",
    };
  });

const valid = (d: Day) =>
  !d.on ||
  (isClock(d.start) &&
    isClock(d.end) &&
    d.start < d.end &&
    ((d.breakStart === "" && d.breakEnd === "") ||
      (isClock(d.breakStart) &&
        isClock(d.breakEnd) &&
        d.start <= d.breakStart &&
        d.breakStart < d.breakEnd &&
        d.breakEnd <= d.end)));

/** "24/12/2026 – 26/12/2026 · Tết" in the UI locale (end is exclusive, shown inclusive). */
const timeOffText = (
  o: { startsAt: string; endsAt: string; reason: string | null },
  locale: "vi" | "en",
) => {
  const tag = locale === "vi" ? "vi-VN" : "en-US";
  const range = `${new Date(o.startsAt).toLocaleDateString(tag)} – ${new Date(Date.parse(o.endsAt) - 1).toLocaleDateString(tag)}`;
  return o.reason ? `${range} · ${o.reason}` : range;
};

/** Next calendar day of "YYYY-MM-DD". */
const nextDay = (ymd: string) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Weekly working hours + one break per day, and time off (07 M7.4). Saving replaces the schedule
 * from today on; past days keep their hours (effective-dated rows, see team.service.ts).
 */
export function ScheduleEditor({
  staff,
  open,
  onClose,
}: {
  staff: StaffMember;
  open: boolean;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const [days, setDays] = useState<Day[]>(() => fromStaff(staff));
  const [offFrom, setOffFrom] = useState("");
  const [offTo, setOffTo] = useState("");
  const save = useCrmMutation(crmApi.replaceSchedule, ["team"]);
  const addOff = useCrmMutation(crmApi.addTimeOff, ["team"]);
  const removeOff = useCrmMutation(crmApi.removeTimeOff, ["team"]);
  const patch = (weekday: number, p: Partial<Day>) => {
    setDays((ds) => ds.map((d) => (d.weekday === weekday ? { ...d, ...p } : d)));
  };
  const allValid = days.every(valid);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;

  const submit = () => {
    if (!allValid) return;
    const body: WeeklyScheduleInput = {
      days: days
        .filter((d) => d.on)
        .map((d) => ({
          weekday: d.weekday,
          intervals: [{ start: d.start, end: d.end }],
          breaks: d.breakStart && d.breakEnd ? [{ start: d.breakStart, end: d.breakEnd }] : [],
        })),
    };
    save.mutate({ id: staff.id, body }, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("team.scheduleTitle", { name: staff.displayName })}
      footer={
        <>
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID="crm-schedule-save"
            label={save.isPending ? t("common.saving") : t("common.save")}
            onPress={submit}
          />
        </>
      }
    >
      <ErrorBanner
        text={
          errorText(save.error ?? addOff.error ?? removeOff.error) ??
          (allValid ? null : t("team.scheduleInvalid"))
        }
      />
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <CalmButton
          size="sm"
          variant="ghost"
          label={t("team.copyMonday")}
          onPress={() => {
            const mon = days[0];
            if (!mon) return;
            setDays((ds) => ds.map((d) => (d.weekday === 7 ? d : { ...mon, weekday: d.weekday })));
          }}
        />
      </View>
      {days.map((d) => (
        <View
          key={d.weekday}
          style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text role="uiSemiBold" size={14} color={c.ink} style={{ textTransform: "capitalize" }}>
              {weekdayLabel(d.weekday, locale)}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text size={12} color={c.muted}>
                {d.on ? t("team.working") : t("team.dayOff")}
              </Text>
              <Toggle
                value={d.on}
                label={weekdayLabel(d.weekday, locale)}
                onChange={(on) => {
                  patch(d.weekday, { on });
                }}
              />
            </View>
          </View>
          {d.on ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <TimeInput
                label={t("team.start")}
                value={d.start}
                onChange={(v) => {
                  patch(d.weekday, { start: v });
                }}
              />
              <Text size={13} color={c.body}>
                {t("team.to")}
              </Text>
              <TimeInput
                label={t("team.end")}
                value={d.end}
                onChange={(v) => {
                  patch(d.weekday, { end: v });
                }}
              />
              <Text size={13} color={c.muted} style={{ marginLeft: 8 }}>
                {t("team.break")}
              </Text>
              <TimeInput
                label={t("team.breakStart")}
                value={d.breakStart}
                onChange={(v) => {
                  patch(d.weekday, { breakStart: v });
                }}
              />
              <TimeInput
                label={t("team.breakEnd")}
                value={d.breakEnd}
                onChange={(v) => {
                  patch(d.weekday, { breakEnd: v });
                }}
              />
            </View>
          ) : null}
        </View>
      ))}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Text role="uiSemiBold" size={14} color={c.ink}>
          {t("team.timeOff")}
        </Text>
        {staff.timeOff.length === 0 ? (
          <Text size={13} color={c.muted}>
            {t("team.noTimeOff")}
          </Text>
        ) : (
          staff.timeOff.map((o) => (
            <View key={o.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text size={13} color={c.ink} style={{ flex: 1 }}>
                {timeOffText(o, locale)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.delete")}
                onPress={() => {
                  removeOff.mutate({ staffId: staff.id, id: o.id });
                }}
                style={{ padding: 6 }}
              >
                <Icon name="trash" size={16} color={c.body} />
              </Pressable>
            </View>
          ))
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
          <Field label={t("team.offFrom")}>
            <Input
              label={t("team.offFrom")}
              placeholder="2026-12-24"
              value={offFrom}
              width={130}
              onChangeText={setOffFrom}
            />
          </Field>
          <Field label={t("team.offTo")}>
            <Input
              label={t("team.offTo")}
              placeholder="2026-12-26"
              value={offTo}
              width={130}
              onChangeText={setOffTo}
            />
          </Field>
          <CalmButton
            size="sm"
            variant="secondary"
            icon="plus"
            label={t("team.addTimeOff")}
            onPress={() => {
              const to = offTo || offFrom;
              if (!ymd.test(offFrom) || !ymd.test(to) || to < offFrom) return;
              // Whole salon-local days; launch salons are in Asia/Ho_Chi_Minh (UTC+7, no DST).
              addOff.mutate(
                {
                  id: staff.id,
                  body: {
                    startsAt: `${offFrom}T00:00:00+07:00`,
                    endsAt: `${nextDay(to)}T00:00:00+07:00`,
                  },
                },
                {
                  onSuccess: () => {
                    setOffFrom("");
                    setOffTo("");
                  },
                },
              );
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}
