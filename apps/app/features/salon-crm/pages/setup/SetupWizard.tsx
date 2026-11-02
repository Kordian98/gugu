import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Logo, ProgressBar, Text, useCalm } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import {
  crmApi,
  useCrmMutation,
  useOnboarding,
  useServices,
  useSettings,
  useTeam,
} from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { HoursSection } from "../settings/HoursSection";
import { ProfileSection } from "../settings/ProfileSection";
import { dismissSetup } from "./firstRun";
import { ServicesStep, TeamStep } from "./steps";

const STEPS = ["business", "hours", "services", "team", "done"] as const;
type Step = (typeof STEPS)[number];
const CHECK_STEPS = ["business", "hours", "services", "team"] as const;

/**
 * First-run setup (07 §3.7, owner feedback): one continuous path after registration — salon
 * details → opening hours → first services (AI import entry or manual) → yourself/team → done.
 * Every step saves through the normal APIs, so leaving halfway keeps the progress and the Today
 * checklist shows the same state.
 */
export function SetupWizard() {
  const { c, scheme } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const router = useRouter();
  const bp = useBreakpoint();
  const { salonId } = useSalon();
  const onboarding = useOnboarding();
  const settings = useSettings();
  const services = useServices();
  const team = useTeam(true);
  const goLive = useCrmMutation(crmApi.goLive, ["settings"]);
  const done: readonly string[] = onboarding.data?.done ?? [];
  const firstOpen = STEPS.find((s) => s !== "done" && !done.includes(s)) ?? "done";
  const [step, setStep] = useState<Step | null>(null);
  // Start at the first unfinished step once, then stay where the user is (saving a step must not
  // jump ahead on its own).
  if (step === null && onboarding.data) setStep(firstOpen);
  const current = step ?? firstOpen;
  const index = STEPS.indexOf(current);
  const toToday = () => {
    dismissSetup(salonId);
    router.replace(`/${locale}/business` as never);
  };

  if (!settings.data || !onboarding.data) {
    return (
      <View
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
  return (
    <ScrollView
      style={{ backgroundColor: c.canvas }}
      contentContainerStyle={{ padding: bp === "mobile" ? 16 : 32, gap: 20, alignItems: "center" }}
    >
      <View style={{ width: "100%", maxWidth: 760, gap: 20 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Logo height={30} variant={scheme === "dark" ? "onDark" : "color"} />
          <CalmButton
            testID="crm-setup-later"
            size="sm"
            variant="ghost"
            label={t("wizard.later")}
            onPress={toToday}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text role="uiMedium" size={13} color={c.body}>
            {t("wizard.progress", { step: index + 1, total: STEPS.length })}
          </Text>
          <ProgressBar value={(index + 1) / STEPS.length} width="100%" />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      done.includes(s) || (s === "done" && i === index)
                        ? c.accentBg
                        : i === index
                          ? c.accentSoft
                          : c.surfaceMuted,
                  }}
                >
                  {done.includes(s) ? (
                    <Icon name="check" size={12} color={c.onAccent} strokeWidth={2.6} />
                  ) : (
                    <Text size={11} color={c.ink}>
                      {String(i + 1)}
                    </Text>
                  )}
                </View>
                <Text
                  role={i === index ? "uiSemiBold" : "ui"}
                  size={13}
                  color={i === index ? c.ink : c.muted}
                >
                  {t(`wizard.steps.${s}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text role="uiSemiBold" size={24} lineHeight={30} color={c.ink}>
            {t(`wizard.titles.${current}`)}
          </Text>
          <Text size={14} color={c.body}>
            {t(`wizard.bodies.${current}`)}
          </Text>
        </View>

        {current === "business" ? <ProfileSection settings={settings.data} canEdit /> : null}
        {current === "hours" ? (
          <HoursSection key={settings.dataUpdatedAt} settings={settings.data} canEdit />
        ) : null}
        {current === "services" ? <ServicesStep services={services.data?.items ?? []} /> : null}
        {current === "team" ? (
          <TeamStep
            team={team.data?.items ?? []}
            services={services.data?.items ?? []}
            settings={settings.data}
          />
        ) : null}
        {current === "done" ? (
          <CalmCard style={{ gap: 12, alignItems: "flex-start" }}>
            {CHECK_STEPS.map((s) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon
                  name={done.includes(s) ? "check" : "clock"}
                  size={16}
                  color={done.includes(s) ? c.accent : c.muted}
                />
                <Text size={14} color={done.includes(s) ? c.ink : c.muted}>
                  {t(`wizard.steps.${s}`)}
                </Text>
              </View>
            ))}
            {onboarding.data.canGoLive ? (
              <CalmButton
                testID="crm-wizard-go-live"
                icon="check"
                label={goLive.isPending ? t("common.saving") : t("setup.goLive")}
                onPress={() => {
                  goLive.mutate(undefined, { onSuccess: toToday });
                }}
              />
            ) : null}
          </CalmCard>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          {index > 0 ? (
            <CalmButton
              variant="secondary"
              label={t("common.back")}
              onPress={() => {
                setStep(STEPS[index - 1] ?? "business");
              }}
            />
          ) : (
            <View />
          )}
          {current === "done" ? (
            <CalmButton testID="crm-wizard-finish" label={t("wizard.toToday")} onPress={toToday} />
          ) : (
            <CalmButton
              testID="crm-wizard-next"
              icon="arrowRight"
              label={t("wizard.next")}
              onPress={() => {
                setStep(STEPS[index + 1] ?? "done");
              }}
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}
