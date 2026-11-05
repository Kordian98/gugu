import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Text, typeScale, useCalm } from "@gugu/design-system";
import type { SalonSettings } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Segmented, TimeInput, Toggle, isClock } from "../../ui/form";
import { weekdayLabel } from "../team/ScheduleEditor";

import {
  intervalSummary,
  scheduleDraftDay,
  scheduleDayInput,
  type ScheduleDraftDay as Day,
} from "../team/schedule-draft";

/** Weekly opening hours with the common "9:00–21:00 every day" preset (07 §3.7). */
export function HoursSection({ settings, canEdit }: { settings: SalonSettings; canEdit: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const [days, setDays] = useState<Day[]>(() =>
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
      const d = settings.openingHours.days.find((x) => x.weekday === weekday);
      return { ...scheduleDraftDay(weekday, d), end: d?.intervals.at(-1)?.end ?? "21:00" };
    }),
  );
  const [saved, setSaved] = useState(false);
  const save = useCrmMutation(crmApi.replaceOpeningHours, ["settings"]);
  const valid = days.every(
    (d) => !d.on || d.preserved !== null || (isClock(d.start) && isClock(d.end) && d.start < d.end),
  );

  return (
    <CalmCard style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("settings.hours")}
        </Text>
        {canEdit ? (
          <CalmButton
            size="sm"
            variant="ghost"
            label={t("settings.hoursPreset")}
            onPress={() => {
              setDays((ds) =>
                ds.map((d) => ({ ...d, on: true, start: "09:00", end: "21:00", preserved: null })),
              );
            }}
          />
        ) : null}
      </View>
      <ErrorBanner text={errorText(save.error) ?? (valid ? null : t("settings.hoursInvalid"))} />
      {days.map((d) => (
        <View
          key={d.weekday}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            minHeight: 44,
          }}
        >
          <Text
            size={14}
            color={c.ink}
            numberOfLines={1}
            style={{ width: 64, textTransform: "capitalize" }}
          >
            {weekdayLabel(d.weekday, locale)}
          </Text>
          <Toggle
            value={d.on}
            label={weekdayLabel(d.weekday, locale)}
            onChange={(on) => {
              setDays((ds) => ds.map((x) => (x.weekday === d.weekday ? { ...x, on } : x)));
            }}
          />
          {d.on && d.preserved ? (
            <View style={{ gap: 8 }}>
              <Text size={typeScale.body} color={c.body}>
                {intervalSummary(d.preserved.intervals)}
              </Text>
              <Text size={typeScale.body} color={c.muted}>
                {t("team.splitHoursPreserved")}
              </Text>
              {canEdit ? (
                <CalmButton
                  variant="secondary"
                  label={t("team.replaceSplitHours")}
                  onPress={() => {
                    setDays((ds) =>
                      ds.map((x) => (x.weekday === d.weekday ? { ...x, preserved: null } : x)),
                    );
                  }}
                />
              ) : null}
            </View>
          ) : d.on ? (
            <>
              <TimeInput
                label={t("team.start")}
                value={d.start}
                onChange={(v) => {
                  setDays((ds) =>
                    ds.map((x) => (x.weekday === d.weekday ? { ...x, start: v } : x)),
                  );
                }}
              />
              <Text size={13} color={c.body}>
                {t("team.to")}
              </Text>
              <TimeInput
                label={t("team.end")}
                value={d.end}
                onChange={(v) => {
                  setDays((ds) => ds.map((x) => (x.weekday === d.weekday ? { ...x, end: v } : x)));
                }}
              />
            </>
          ) : (
            <Text size={13} color={c.muted}>
              {t("settings.closed")}
            </Text>
          )}
        </View>
      ))}
      {canEdit ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          {saved ? (
            <Text size={13} color={c.accent}>
              {t("common.saved")}
            </Text>
          ) : null}
          <CalmButton
            disabled={save.isPending || !valid}
            testID="crm-hours-save"
            label={save.isPending ? t("common.saving") : t("common.save")}
            onPress={() => {
              if (!valid) return;
              setSaved(false);
              save.mutate(
                {
                  days: days
                    .filter((d) => d.on)
                    .map((d) => ({ weekday: d.weekday, intervals: scheduleDayInput(d).intervals })),
                },
                {
                  onSuccess: () => {
                    setSaved(true);
                  },
                },
              );
            }}
          />
        </View>
      ) : null}
    </CalmCard>
  );
}

/** Closed days / special hours (Tết etc.). */
export function HolidaysSection({
  settings,
  canEdit,
}: {
  settings: SalonSettings;
  canEdit: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"closed" | "special">("closed");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("14:00");
  const add = useCrmMutation(crmApi.addHoliday, ["settings"]);
  const remove = useCrmMutation(crmApi.removeHoliday, ["settings"]);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;

  return (
    <CalmCard style={{ gap: 12 }}>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {t("settings.holidays")}
      </Text>
      <Text size={13} color={c.body}>
        {t("settings.holidaysBody")}
      </Text>
      <ErrorBanner text={errorText(add.error ?? remove.error)} />
      {settings.holidays.map((h) => (
        <View
          key={h.id}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}
        >
          <Text size={14} color={c.ink} style={{ flex: 1 }}>
            {`${h.startDate}${h.endDate !== h.startDate ? ` → ${h.endDate}` : ""} · ${h.closed ? t("settings.closed") : `${h.interval?.start ?? ""}–${h.interval?.end ?? ""}`}${h.reason ? ` · ${h.reason}` : ""}`}
          </Text>
          {canEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              onPress={() => {
                remove.mutate(h.id);
              }}
              style={{ padding: 6 }}
            >
              <Icon name="trash" size={16} color={c.body} />
            </Pressable>
          ) : null}
        </View>
      ))}
      {canEdit ? (
        <View style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label={t("team.offFrom")}>
              <Input
                label={t("team.offFrom")}
                placeholder="2027-02-05"
                width={130}
                value={from}
                onChangeText={setFrom}
              />
            </Field>
            <Field label={t("team.offTo")}>
              <Input
                label={t("team.offTo")}
                placeholder="2027-02-10"
                width={130}
                value={to}
                onChangeText={setTo}
              />
            </Field>
            <Field flex={1} label={t("settings.reason")}>
              <Input label={t("settings.reason")} value={reason} onChangeText={setReason} />
            </Field>
          </View>
          <Segmented<"closed" | "special">
            value={mode}
            onChange={setMode}
            options={[
              { id: "closed", label: t("settings.closedAllDay") },
              { id: "special", label: t("settings.specialHours") },
            ]}
          />
          {mode === "special" ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TimeInput label={t("team.start")} value={start} onChange={setStart} />
              <Text size={13} color={c.body}>
                {t("team.to")}
              </Text>
              <TimeInput label={t("team.end")} value={end} onChange={setEnd} />
            </View>
          ) : null}
          <View style={{ alignItems: "flex-start" }}>
            <CalmButton
              size="sm"
              variant="secondary"
              icon="plus"
              label={t("settings.addHoliday")}
              onPress={() => {
                const endDate = to || from;
                if (!ymd.test(from) || !ymd.test(endDate) || endDate < from) return;
                if (mode === "special" && !(isClock(start) && isClock(end) && start < end)) return;
                add.mutate(
                  {
                    startDate: from,
                    endDate,
                    closed: mode === "closed",
                    interval: mode === "special" ? { start, end } : null,
                    reason: reason.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setFrom("");
                      setTo("");
                      setReason("");
                    },
                  },
                );
              }}
            />
          </View>
        </View>
      ) : null}
    </CalmCard>
  );
}
