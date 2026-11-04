import type { ReactNode } from "react";
import { Animated, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PUBLIC_PLANS, type BillingInterval, type PublicPlanCode } from "@gugu/contracts";
import { Icon, Text, color, radius, elevation, space } from "@gugu/design-system";

import { Segmented } from "./Choice";
import type { Advice } from "./model";
import { LinkChip } from "./links";
import { usePop, usePulse } from "./anim";
import { CostRow, Savings, useSummary } from "./parts";

/** Visually hidden but read by screen readers. */
const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
} as const;

/**
 * The live answer: recommended plan + one-line why, this year / later cost with the monthly-yearly
 * switch, the estimated monthly savings (one line + disclaimer) and links to the sheets. `cta` is
 * rendered inside on desktop; on phones the parent pins it to the bottom.
 */
export function ResultCard({
  advice,
  why,
  interval,
  onInterval,
  reduce,
  desktop,
  onCompare,
  onHow,
  cta,
  pulse,
  recommended,
  onPick,
}: {
  advice: Advice;
  why: string;
  interval: BillingInterval;
  onInterval: (i: BillingInterval) => void;
  reduce: boolean;
  desktop: boolean;
  onCompare: () => void;
  onHow: () => void;
  cta: ReactNode;
  /** Changes on every answer tap: the card glows briefly so it visibly reacts to the questions. */
  pulse: number;
  /** The plan the answers suggest (marked "Gợi ý" in the switch). */
  recommended: PublicPlanCode;
  /** Shows another plan with the same inputs; the answers stay as they are. */
  onPick: (p: PublicPlanCode) => void;
}) {
  const { t } = useTranslation("landing");
  const { plan } = advice;
  const { scale, check } = usePop(plan, reduce);
  const glow = usePulse(pulse, reduce);
  const name = t(`pricing.plan.${plan}.name`);
  const summary = useSummary(advice, interval, name, why, plan !== recommended);
  const links = (
    <>
      <LinkChip
        testID="pricing-compare-link"
        label={t("pricing.compareLink")}
        onPress={onCompare}
      />
      <LinkChip testID="pricing-how-link" label={t("pricing.howLink")} onPress={onHow} />
    </>
  );

  return (
    <Animated.View
      testID="pricing-result"
      style={{
        transform: [{ scale }],
        gap: desktop ? space[5] : space[2],
        padding: desktop ? space[8] : space[3],
        borderRadius: desktop ? radius.xl : radius.lg,
        backgroundColor: color.white,
        borderWidth: 1,
        borderColor: color.lineSoft,
        ...elevation.card,
      }}
    >
      <Animated.View
        aria-hidden
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -5,
          left: -5,
          right: -5,
          bottom: -5,
          borderRadius: (desktop ? radius.xl : radius.lg) + 5,
          borderWidth: 2,
          borderColor: color.lilac500,
          opacity: glow,
        }}
      />
      {/* Screen readers: one polite summary (plan, why, cost) whenever the answer changes. */}
      <View accessibilityLiveRegion="polite" aria-live="polite" style={SR_ONLY}>
        <Text size={12}>{summary}</Text>
      </View>
      <View style={{ gap: desktop ? space[2] : space[1] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
          <Animated.View
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: desktop ? 34 : 28,
              height: desktop ? 34 : 28,
              borderRadius: radius.pill,
              backgroundColor: color.ink,
              alignItems: "center",
              justifyContent: "center",
              opacity: check,
              transform: [
                { scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                {
                  rotate: check.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["-35deg", "0deg"],
                  }),
                },
              ],
            }}
          >
            <Icon name="check" size={desktop ? 18 : 15} color={color.white} strokeWidth={2.8} />
          </Animated.View>
          {desktop ? (
            <View style={{ flex: 1 }}>
              <Text
                testID="pricing-plan"
                role="display"
                size={40}
                lineHeight={44}
                color={color.ink}
              >
                {name}
              </Text>
            </View>
          ) : null}
          {/* Plan switch: always shows that three plans exist; the suggestion is marked. */}
          <Segmented
            testID="pricing-plan-switch"
            label={t("pricing.planSwitch")}
            value={plan}
            onChange={onPick}
            options={PUBLIC_PLANS.map((p) => ({ value: p, label: t(`pricing.plan.${p}.name`) }))}
            badge={{ [recommended]: t("pricing.suggested") }}
          />
        </View>
        <Text
          testID="pricing-why"
          size={desktop ? 15 : 13}
          lineHeight={desktop ? 21 : 18}
          color={color.body}
        >
          {why}
        </Text>
      </View>

      <Segmented
        testID="pricing-interval"
        label={t("pricing.interval.label")}
        value={interval}
        onChange={onInterval}
        options={[
          { value: "month", label: t("pricing.interval.month") },
          { value: "year", label: t("pricing.interval.year") },
        ]}
        badge={{ year: t("pricing.interval.yearBadge") }}
      />

      <CostRow advice={advice} interval={interval} reduce={reduce} desktop={desktop} />
      {/* Hairline between what it costs and what it saves. */}
      {desktop ? <View style={{ height: 1, backgroundColor: color.lineSoft }} /> : null}
      <Savings advice={advice} reduce={reduce} desktop={desktop} onHow={onHow} />

      {desktop ? (
        <>
          {cta}
          <View style={{ flexDirection: "row", gap: space[2] }}>{links}</View>
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: space[2] }}>{links}</View>
      )}
    </Animated.View>
  );
}
