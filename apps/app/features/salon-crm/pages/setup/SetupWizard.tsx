import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import {
  SETUP_STEPS,
  type BusinessType,
  type SetupItem,
  type SetupMethod,
  type SetupStep,
  setupStepSchema,
} from "@gugu/contracts";
import { CalmButton, CalmCard, Logo, Text, useCalm } from "@gugu/design-system";
import { DEFAULT_SALON_TIMEZONE } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useOnboarding, useServices, useSettings, useTeam } from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";
import { setupApi, useSetupMutation } from "../../data/setup";
import { useZaloConnection } from "../../data/zalo";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { CheckPop, Confetti } from "./parts/Celebrate";
import { successHaptic } from "./parts/haptics";
import { ProgressRing } from "./parts/ProgressRing";
import { BusinessStep } from "./steps/BusinessStep";
import { DoneStep } from "./steps/DoneStep";
import { HoursStep } from "./steps/HoursStep";
import { ServicesStep } from "./steps/ServicesStep";
import { TeamStep } from "./steps/TeamStep";
import { ZaloStep } from "./steps/ZaloStep";

type WizardStep = Exclude<SetupStep, "done">;
/** The five steps that count towards progress; `done` is the celebration. */
const WIZARD: readonly WizardStep[] = ["business", "hours", "services", "team", "zalo"];
const ETA: Record<WizardStep, "seconds" | "minute" | "minutes"> = {
  business: "seconds",
  hours: "seconds",
  services: "minutes",
  team: "minute",
  zalo: "minute",
};

const nextStep = (from: SetupStep): SetupStep =>
  SETUP_STEPS[Math.min(SETUP_STEPS.indexOf(from) + 1, SETUP_STEPS.length - 1)] ?? "done";

/**
 * Guided setup after the email-only signup (07 §3.7, owner 2026-11-04): full screen, mobile first,
 * one short skippable step at a time, progress saved on the server after every step (resume on any
 * device), a progress ring, a check pop + small confetti and haptics on completion (reduced motion
 * respected), encouraging copy and time estimates. `?step=x&single=1` opens one step from the Today
 * card and returns there afterwards.
 */
export function SetupWizard() {
  const { c, scheme } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const router = useRouter();
  const bp = useBreakpoint();
  const salon = useSalon();
  const params = useLocalSearchParams<{ step?: string; single?: string; zalo?: string }>();
  const onboarding = useOnboarding();
  const settings = useSettings();
  const services = useServices();
  const team = useTeam(true);
  const zalo = useZaloConnection();
  const progress = useSetupMutation(setupApi.progress, ["summary"]);
  const setup = onboarding.data?.setup ?? null;
  const single = params.single === "1";

  const [step, setStep] = useState<SetupStep | null>(null);
  const [completed, setCompleted] = useState<Set<SetupStep>>(new Set());
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [cheer, setCheer] = useState<{ text: string; burst: number } | null>(null);
  const viewed = useRef<SetupStep | null>(null);

  // Resume once: a valid `?step=`, else where the owner left off (server-side), else the start.
  if (step === null && onboarding.data) {
    const fromParam = setupStepSchema.safeParse(params.step);
    setStep(fromParam.success ? fromParam.data : (setup?.currentStep ?? "business"));
    setCompleted(new Set(setup?.completed ?? []));
    setBusinessType(setup?.businessType ?? null);
  }

  useEffect(() => {
    if (step === null || viewed.current === step) return;
    viewed.current = step;
    progress.mutate({ step, event: "viewed" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one "viewed" event per step entry
  }, [step]);

  const toToday = () => {
    router.replace(`/${locale}/business` as never);
  };

  if (onboarding.isError || settings.isError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.canvas }}>
        <CalmCard style={{ maxWidth: 520, width: "100%", alignSelf: "center" }}>
          <EmptyState
            testID="crm-setup-error"
            icon="alert"
            title={t("errors.loadFailed")}
            body={t("quickStart.failedBody")}
            action={
              <CalmButton
                label={t("quickStart.retry")}
                onPress={() => {
                  void onboarding.refetch();
                  void settings.refetch();
                }}
              />
            }
          />
        </CalmCard>
      </View>
    );
  }
  if (step === null || !settings.data || !onboarding.data) {
    return (
      <View
        testID="crm-setup-loading"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.canvas,
        }}
      >
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const index = step === "done" ? WIZARD.length : WIZARD.indexOf(step);
  const doneCount = WIZARD.filter((s) => completed.has(s)).length;
  const zaloOff = zalo.data?.mode === "disabled";
  const remaining: SetupItem[] = (setup?.remaining ?? []).filter((r) => !(r === "zalo" && zaloOff));

  /** Records the step, celebrates, moves on (or back to Today when opened from the Today card). */
  const advance = (from: WizardStep, kind: "completed" | "skipped", method?: SetupMethod) => {
    // The business step is recorded by its own endpoint.
    if (!(from === "business" && kind === "completed")) {
      progress.mutate({ step: from, event: kind, ...(method ? { method } : {}) });
    }
    const left = WIZARD.length - WIZARD.indexOf(from) - 1;
    if (kind === "completed") {
      setCompleted((s) => new Set(s).add(from));
      successHaptic();
      setCheer((prev) => ({
        text:
          left <= 0
            ? ""
            : left === 1
              ? t("setupWizard.cheer.last")
              : t("setupWizard.cheer.remaining", { count: left }),
        burst: (prev?.burst ?? 0) + 1,
      }));
    } else {
      setCheer({ text: t("setupWizard.cheer.skipped"), burst: 0 });
    }
    if (single) toToday();
    else setStep(nextStep(from));
  };

  const back = () => {
    setStep(SETUP_STEPS[Math.max(0, SETUP_STEPS.indexOf(step) - 1)] ?? "business");
    setCheer(null);
  };

  const later = () => {
    progress.mutate({ step, event: "left" }, { onSettled: toToday });
  };

  const mobile = bp === "mobile";
  const eta = step === "done" ? "" : t(`setupWizard.eta.${ETA[step]}`);

  return (
    <ScrollView
      testID="crm-setup"
      style={{ backgroundColor: c.canvas }}
      contentContainerStyle={{
        padding: mobile ? 16 : 32,
        paddingBottom: 48,
        alignItems: "center",
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: "100%", maxWidth: 640, gap: 18 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Logo height={28} variant={scheme === "dark" ? "onDark" : "color"} />
          {step === "done" ? null : (
            <CalmButton
              testID="crm-setup-later"
              size="sm"
              variant="ghost"
              label={t("setupWizard.later")}
              onPress={later}
            />
          )}
        </View>

        {step === "done" ? null : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <ProgressRing
                value={doneCount / WIZARD.length}
                label={`${String(index + 1)}/${String(WIZARD.length)}`}
                accessibilityLabel={t("setupWizard.progressLabel", {
                  done: doneCount,
                  total: WIZARD.length,
                })}
              />
              <Confetti burst={cheer?.burst ?? 0} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {WIZARD.map((s, i) => (
                  <View
                    key={s}
                    style={{
                      height: 6,
                      flex: 1,
                      borderRadius: 3,
                      backgroundColor: completed.has(s)
                        ? c.accentBg
                        : i === index
                          ? c.accent
                          : c.line,
                      opacity: !completed.has(s) && i === index ? 0.45 : 1,
                    }}
                  />
                ))}
              </View>
              {cheer?.text ? (
                <View
                  testID="crm-setup-cheer"
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  {cheer.burst > 0 ? <CheckPop key={cheer.burst} size={20} /> : null}
                  <Text role="uiSemiBold" size={14} color={c.accent}>
                    {cheer.text}
                  </Text>
                </View>
              ) : (
                <Text size={13} color={c.muted}>
                  {index === 0
                    ? t("setupWizard.totalEta")
                    : t("setupWizard.stepOf", { step: index + 1, total: WIZARD.length })}
                </Text>
              )}
            </View>
          </View>
        )}

        {step === "business" ? (
          <BusinessStep
            setup={setup}
            currentName={salon.summary?.name ?? settings.data.profile.name}
            eta={eta}
            onDone={(type) => {
              setBusinessType(type);
              advance("business", "completed", "tiles");
            }}
            onSkip={() => {
              advance("business", "skipped");
            }}
          />
        ) : null}
        {step === "hours" ? (
          <HoursStep
            settings={settings.data}
            eta={eta}
            onDone={(m) => {
              advance("hours", "completed", m);
            }}
            onSkip={() => {
              advance("hours", "skipped");
            }}
            onBack={back}
          />
        ) : null}
        {step === "services" ? (
          <ServicesStep
            services={services.data?.items ?? []}
            businessType={businessType}
            eta={eta}
            onDone={(m) => {
              advance("services", "completed", m);
            }}
            onSkip={() => {
              advance("services", "skipped");
            }}
            onBack={back}
          />
        ) : null}
        {step === "team" ? (
          <TeamStep
            team={team.data?.items ?? []}
            settings={settings.data}
            eta={eta}
            onDone={(m) => {
              advance("team", "completed", m);
            }}
            onSkip={() => {
              advance("team", "skipped");
            }}
            onBack={back}
          />
        ) : null}
        {step === "zalo" ? (
          <ZaloStep
            result={params.zalo}
            eta={eta}
            onDone={(m) => {
              advance("zalo", "completed", m);
            }}
            onSkip={() => {
              advance("zalo", "skipped");
            }}
            onBack={back}
          />
        ) : null}
        {step === "done" ? (
          <DoneStep
            team={team.data?.items ?? []}
            settings={settings.data}
            timeZone={salon.summary?.timezone ?? DEFAULT_SALON_TIMEZONE}
            remaining={remaining}
            onFirstBooking={() => {
              router.replace(`/${locale}/business/calendar?new=1` as never);
            }}
            onToday={toToday}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
