import type { ReactNode } from "react";
import { Animated, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PUBLIC_PLANS, type BillingInterval, type PublicPlanCode } from "@gugu/contracts";
import { Icon, Text, color, radius } from "@gugu/design-system";

import { Segmented } from "./Choice";
import type { Advice } from "./model";
import { LinkChip, OtherPlan } from "./links";
import { CostRow, Savings, usePop } from "./parts";

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
  onPick,
  cta,
}: {
  advice: Advice;
  why: string;
  interval: BillingInterval;
  onInterval: (i: BillingInterval) => void;
  reduce: boolean;
  desktop: boolean;
  onCompare: () => void;
  onHow: () => void;
  onPick: (p: PublicPlanCode) => void;
  cta: ReactNode;
}) {
  const { t } = useTranslation("landing");
  const { plan } = advice;
  const { scale, check } = usePop(plan, reduce);
  const name = t(`pricing.plan.${plan}.name`);
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
        gap: desktop ? 12 : 10,
        padding: desktop ? 24 : 14,
        borderRadius: desktop ? radius.xl : radius.lg,
        backgroundColor: color.white,
        borderWidth: 1,
        borderColor: color.lineSoft,
        shadowColor: color.lilac700,
        shadowOpacity: 0.14,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 14 },
      }}
    >
      {/* Plan + why: announced politely when the answer changes. */}
      <View accessibilityLiveRegion="polite" aria-live="polite" style={{ gap: desktop ? 8 : 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Animated.View
            style={{
              width: desktop ? 34 : 28,
              height: desktop ? 34 : 28,
              borderRadius: 999,
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
          <Text
            testID="pricing-plan"
            role="display"
            size={desktop ? 40 : 32}
            lineHeight={desktop ? 44 : 36}
            color={color.ink}
          >
            {name}
          </Text>
          <View
            style={{
              borderRadius: radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 3,
              backgroundColor: color.pink300,
            }}
          >
            <Text role="uiSemiBold" size={12} color={color.plum950}>
              {t("pricing.forYou")}
            </Text>
          </View>
        </View>
        <Text
          testID="pricing-why"
          size={desktop ? 15 : 13.5}
          lineHeight={desktop ? 21 : 19}
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
      <Savings advice={advice} reduce={reduce} desktop={desktop} />

      {desktop ? (
        <>
          {cta}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text role="eyebrow" size={11.5}>
                  {t("pricing.others")}
                </Text>
              </View>
              {links}
            </View>
            {PUBLIC_PLANS.filter((p) => p !== plan).map((p) => (
              <OtherPlan key={p} plan={p} onPick={onPick} />
            ))}
          </View>
        </>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>{links}</View>
      )}
    </Animated.View>
  );
}
