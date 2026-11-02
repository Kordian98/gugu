import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, ProgressBar, Text, useCalm } from "@gugu/design-system";

import type { SetupStep } from "../data/types";
import { crmApi, useCrmMutation } from "../data/catalog";
import { useCrmNav } from "../shell/useCrmNav";
import { useErrorText } from "../ui/errors";
import { ErrorBanner } from "../ui/form";

const STEPS: SetupStep[] = ["business", "services", "hours", "team", "live"];

/** Where each checklist step is completed. */
const STEP_PATH: Record<SetupStep, string> = {
  business: "/business/settings",
  services: "/business/services",
  hours: "/business/settings",
  team: "/business/team",
  live: "/business",
};

/**
 * Onboarding checklist on Today (07 §3.7). The first card is the headline "Effortless AI setup" path,
 * available in every plan (X13); it never sends personal data (X10).
 */
export function SetupCard({
  done,
  canGoLive,
  compact,
}: {
  done: SetupStep[];
  canGoLive: boolean;
  compact?: boolean | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { go } = useCrmNav();
  const errorText = useErrorText();
  const goLive = useCrmMutation(crmApi.goLive, ["settings"]);
  return (
    <View
      testID="crm-setup-card"
      style={{
        flexDirection: compact ? "column" : "row",
        gap: compact ? 16 : 28,
        padding: compact ? 18 : 24,
        borderRadius: 20,
        backgroundColor: c.accentSoft,
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      <View style={{ flex: compact ? undefined : 1.4, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="sparkles" size={18} color={c.accent} />
          <Text
            role="uiSemiBold"
            size={12}
            color={c.accent}
            style={{ letterSpacing: 0.6, textTransform: "uppercase" }}
          >
            {t("setup.eyebrow")}
          </Text>
        </View>
        <Text
          role="uiSemiBold"
          size={compact ? 20 : 24}
          lineHeight={compact ? 26 : 30}
          color={c.ink}
        >
          {t("setup.title")}
        </Text>
        <Text size={14} color={c.body} style={{ maxWidth: 560 }}>
          {t("setup.body")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
          <CalmButton
            testID="crm-setup-upload"
            icon="upload"
            label={t("setup.cta")}
            onPress={() => {
              go("/business/services?import=1");
            }}
          />
          <CalmButton
            variant="secondary"
            label={t("setup.manual")}
            onPress={() => {
              go("/business/services");
            }}
          />
        </View>
        <Text size={12} color={c.muted}>
          {t("setup.privacy")}
        </Text>
      </View>
      <View style={{ flex: compact ? undefined : 1, gap: 10 }}>
        <Text role="uiMedium" size={13} color={c.body}>
          {t("setup.progress", { done: String(done.length), total: String(STEPS.length) })}
        </Text>
        <ProgressBar value={done.length / STEPS.length} width="100%" />
        <View style={{ gap: 8, marginTop: 4 }}>
          {STEPS.map((s) => {
            const ok = done.includes(s);
            return (
              <Pressable
                key={s}
                testID={`crm-setup-step-${s}`}
                accessibilityRole="link"
                accessibilityState={{ checked: ok }}
                disabled={s === "live"}
                onPress={() => {
                  go(STEP_PATH[s]);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: ok ? c.accentBg : c.surface,
                    borderWidth: ok ? 0 : 1,
                    borderColor: c.line,
                  }}
                >
                  {ok ? <Icon name="check" size={13} color={c.onAccent} strokeWidth={2.6} /> : null}
                </View>
                <Text
                  size={14}
                  color={ok ? c.muted : c.ink}
                  style={{ flex: 1, ...(ok ? { textDecorationLine: "line-through" } : {}) }}
                >
                  {t(`setup.steps.${s}`)}
                </Text>
                {!ok && s !== "live" ? (
                  <Icon name="chevronRight" size={14} color={c.muted} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <ErrorBanner text={errorText(goLive.error)} />
        {canGoLive ? (
          <CalmButton
            testID="crm-go-live"
            icon="check"
            label={goLive.isPending ? t("common.saving") : t("setup.goLive")}
            onPress={() => {
              goLive.mutate(undefined);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
