import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { OpeningHoursInput, SalonSettings, SetupMethod } from "@gugu/contracts";
import { Text, checkableA11y, useCalm } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../../data/catalog";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner, Field, TimeInput, isClock } from "../../../ui/form";
import { weekdayLabel } from "../../team/ScheduleEditor";
import { selectHaptic } from "../parts/haptics";
import { ChoiceTile, StepFooter, StepFrame } from "../parts/StepFrame";

const ALL = [1, 2, 3, 4, 5, 6, 7];
type Plan = { days: number[]; opens: string; closes: string };

export const HOUR_PRESETS = {
  everyday_9_21: { days: ALL, opens: "09:00", closes: "21:00" },
  everyday_8_20: { days: ALL, opens: "08:00", closes: "20:00" },
  weekdays_9_19: { days: [1, 2, 3, 4, 5, 6], opens: "09:00", closes: "19:00" },
} as const satisfies Record<string, Plan>;
type PresetKey = keyof typeof HOUR_PRESETS | "custom";
const PRESET_ORDER: readonly PresetKey[] = [
  "everyday_9_21",
  "everyday_8_20",
  "weekdays_9_19",
  "custom",
];

/** Existing hours as one simple plan (first interval of the first open day), if any. */
function planOf(settings: SalonSettings): Plan | null {
  const open = settings.openingHours.days.filter((d) => d.intervals.length > 0);
  const first = open[0]?.intervals[0];
  if (!first) return null;
  return { days: open.map((d) => d.weekday), opens: first.start, closes: first.end };
}

function presetOf(plan: Plan | null): PresetKey {
  if (!plan) return "everyday_9_21";
  for (const [key, p] of Object.entries(HOUR_PRESETS)) {
    if (p.opens === plan.opens && p.closes === plan.closes && p.days.join() === plan.days.join())
      return key as PresetKey;
  }
  return "custom";
}

export const toOpeningHours = (plan: Plan): OpeningHoursInput => ({
  days: plan.days.map((weekday) => ({
    weekday,
    intervals: [{ start: plan.opens, end: plan.closes }],
  })),
});

/** Step (b): opening hours from a preset, with a quick tweak (days + one open/close time). */
export function HoursStep({
  settings,
  eta,
  onDone,
  onSkip,
  onBack,
}: {
  settings: SalonSettings;
  eta: string;
  onDone: (method: SetupMethod) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const existing = planOf(settings);
  const [preset, setPreset] = useState<PresetKey>(presetOf(existing));
  const [custom, setCustom] = useState<Plan>(
    existing ?? { ...HOUR_PRESETS.everyday_9_21, days: [...ALL] },
  );
  const save = useCrmMutation(crmApi.replaceOpeningHours, ["settings"]);
  const plan: Plan = preset === "custom" ? custom : HOUR_PRESETS[preset];
  const valid =
    plan.days.length > 0 && isClock(plan.opens) && isClock(plan.closes) && plan.opens < plan.closes;
  return (
    <StepFrame
      title={t("setupWizard.hours.title")}
      body={t("setupWizard.hours.body")}
      eta={eta}
      footer={
        <StepFooter
          label={t("setupWizard.next")}
          disabled={!valid}
          busy={save.isPending}
          hint={valid ? null : t("setupWizard.hours.invalid")}
          onPress={() => {
            save.mutate(toOpeningHours(plan), {
              onSuccess: () => {
                onDone(preset === "custom" ? "custom" : "preset");
              },
            });
          }}
          onSkip={onSkip}
          onBack={onBack}
        />
      }
    >
      <ErrorBanner text={errorText(save.error)} />
      <View
        role="radiogroup"
        accessibilityRole="radiogroup"
        aria-label={t("setupWizard.hours.title")}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
      >
        {PRESET_ORDER.map((key) => (
          <ChoiceTile
            key={key}
            testID={`crm-setup-hours-${key}`}
            label={t(`setupWizard.hours.presets.${key}`)}
            selected={preset === key}
            minWidth={150}
            onPress={() => {
              selectHaptic();
              if (key === "custom" && preset !== "custom")
                setCustom({ ...plan, days: [...plan.days] });
              setPreset(key);
            }}
          />
        ))}
      </View>
      {preset === "custom" ? (
        <View
          style={{
            gap: 14,
            padding: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
          }}
        >
          <Field label={t("setupWizard.hours.days")}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ALL.map((d) => {
                const on = custom.days.includes(d);
                return (
                  <Pressable
                    key={d}
                    testID={`crm-setup-day-${String(d)}`}
                    {...checkableA11y("checkbox", on)}
                    accessibilityLabel={weekdayLabel(d, locale, "long")}
                    onPress={() => {
                      setCustom((p) => ({
                        ...p,
                        days: on
                          ? p.days.filter((x) => x !== d)
                          : [...p.days, d].sort((a, b) => a - b),
                      }));
                    }}
                    style={{
                      minWidth: 48,
                      height: 44,
                      paddingHorizontal: 10,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? c.accentBg : c.line,
                      backgroundColor: on ? c.accentSoft : c.surface,
                    }}
                  >
                    <Text role={on ? "uiSemiBold" : "ui"} size={14} color={c.ink}>
                      {weekdayLabel(d, locale, "short")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <Field flex={1} label={t("setupWizard.hours.opens")}>
              <TimeInput
                testID="crm-setup-opens"
                label={t("setupWizard.hours.opens")}
                value={custom.opens}
                onChange={(v) => {
                  setCustom((p) => ({ ...p, opens: v }));
                }}
              />
            </Field>
            <Field flex={1} label={t("setupWizard.hours.closes")}>
              <TimeInput
                testID="crm-setup-closes"
                label={t("setupWizard.hours.closes")}
                value={custom.closes}
                onChange={(v) => {
                  setCustom((p) => ({ ...p, closes: v }));
                }}
              />
            </Field>
          </View>
        </View>
      ) : null}
    </StepFrame>
  );
}
