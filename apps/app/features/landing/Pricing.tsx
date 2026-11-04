import { useState } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "react-native-reanimated";

import type { BillingInterval, PublicPlanCode } from "@gugu/contracts";
import { Button, GradientText, Text, color, font, gradient, space } from "@gugu/design-system";

import { RoiCalculator } from "./RoiCalculator";
import { Container, SectionHead } from "./Section";
import { Compare } from "./pricing/Compare";
import { Questions } from "./pricing/Questions";
import { DEFAULT_ANSWERS, advise, profileDefaults, recommend, type Answers } from "./pricing/model";
import { ResultCard } from "./pricing/ResultCard";
import { Sheet } from "./pricing/Sheet";
import { useFocusClearance } from "./pricing/useFocusClearance";
import type { LandingNavActions } from "./useLandingNav";

/** Web, phone: the section is a snap point of the mobile story's proximity snapping. */
const SNAP_START = (Platform.OS === "web"
  ? { scrollSnapAlign: "start" }
  : {}) as unknown as ViewStyle;

/** Web only: keeps the phone CTA pinned to the bottom while the section is on screen. */
const STICKY_BOTTOM = (Platform.OS === "web"
  ? { position: "sticky", bottom: 0 }
  : {}) as unknown as ViewStyle;

/**
 * Pricing as a buying assistant (X27, owner 2026-11-04): three one-tap questions → the recommended
 * plan with a one-line why, this-year and later cost (monthly/yearly), an illustrative monthly
 * saving and the matching CTA. Defaults answer at once; every tap updates the result live.
 * Desktop: questions | result. Phone: one screen, CTA pinned at the bottom, comparison and
 * "Cách tính" in bottom sheets. Prices: @gugu/contracts (same numbers as `plan_prices`).
 */
export function Pricing({ nav, stacked }: { nav: LandingNavActions; stacked: boolean }) {
  const { t } = useTranslation("landing");
  const reduce = useReducedMotion();
  const desktop = !stacked;
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [picked, setPicked] = useState<PublicPlanCode | null>(null);
  const [weekly, setWeekly] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [locations, setLocations] = useState<number | null>(null);
  const [sheet, setSheet] = useState<"compare" | "how" | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const [taps, setTaps] = useState(0);
  useFocusClearance("pricing-section", desktop ? 0 : barHeight);

  const profile = profileDefaults(answers, locations ?? undefined);
  const w = weekly ?? profile.weekly;
  const p = price ?? profile.price;
  const recommended = recommend(answers);
  const plan = picked ?? recommended;
  const inputs = { ...profile, weekly: w, price: p };
  const advice = advise(plan, interval, inputs);

  const answer = (patch: Partial<Answers>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setPicked(null);
    setTaps((n) => n + 1);
    // A new team size brings new defaults; numbers the visitor typed in "Cách tính" are kept
    // otherwise and apply to every plan.
    if (patch.team) {
      setWeekly(null);
      setPrice(null);
    }
  };
  // A picked plan explains itself; Ultra always says multi-location is coming (honest, q106).
  const why =
    plan === recommended || plan === "ultra"
      ? t(`pricing.why.${plan}`, { team: t(`pricing.teamPhrase.${answers.team}`) })
      : t(`pricing.plan.${plan}.highlight`);

  const cta = (
    <View style={{ gap: 6, alignItems: "center" }}>
      <Button
        label={t(`pricing.cta.${plan}`)}
        onPress={nav.trial}
        height={52}
        fontSize={16}
        trailingArrow
        style={{ alignSelf: "stretch" }}
      />
      <Text size={12.5} color={color.ink2}>
        {t("pricing.noCard")}
      </Text>
      {/* No separate Ultra trial: say so in one short line. */}
      {plan === "ultra" ? (
        <Text size={12} lineHeight={16} color={color.body} style={{ textAlign: "center" }}>
          {t("pricing.cta.ultraNote")}
        </Text>
      ) : null}
    </View>
  );

  const questions = (
    <Questions answers={answers} onAnswer={answer} desktop={desktop} reduce={reduce} />
  );

  const card = (
    <ResultCard
      advice={advice}
      why={why}
      interval={interval}
      onInterval={setInterval}
      reduce={reduce}
      desktop={desktop}
      onCompare={() => {
        setSheet("compare");
      }}
      onHow={() => {
        setSheet("how");
      }}
      cta={cta}
      pulse={taps}
      recommended={recommended}
      onPick={(pl) => {
        setPicked(pl === recommended ? null : pl);
      }}
    />
  );

  return (
    <View testID="pricing-section" style={desktop ? undefined : SNAP_START}>
      <Container className={desktop ? "py-10" : "pt-4"}>
        {desktop ? (
          <View style={{ flexDirection: "row", gap: space[10] + space[4], alignItems: "center" }}>
            <View style={{ flex: 1, gap: space[6], maxWidth: 540 }}>
              <SectionHead
                eyebrow={t("pricing.eyebrow")}
                title={t("pricing.titlePre")}
                glow={{
                  words: t("pricing.titleGlow"),
                  after: t("pricing.titlePost"),
                  colors: gradient.glowInk,
                }}
              />
              <Text size={16.5} lineHeight={25} color={color.body}>
                {t("pricing.sub")}
              </Text>
              {questions}
            </View>
            <View style={{ flex: 1.1 }}>{card}</View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View>
              <View accessibilityRole="header">
                <Text role="display" size={32} lineHeight={38} color={color.ink}>
                  {t("pricing.titlePre")}
                  <GradientText
                    colors={gradient.glowInk}
                    style={{ fontFamily: font.display, fontSize: 32, lineHeight: 38 }}
                  >
                    {t("pricing.titleGlow")}
                  </GradientText>
                  {t("pricing.titlePost")}
                </Text>
              </View>
            </View>
            {questions}
            {card}
          </View>
        )}
      </Container>
      {desktop ? null : (
        <View
          testID="pricing-section-cta-bar"
          onLayout={(e) => {
            setBarHeight(Math.ceil(e.nativeEvent.layout.height));
          }}
          style={[
            {
              zIndex: 5,
              marginTop: 12,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 12,
              backgroundColor: color.canvas,
              borderTopWidth: 1,
              borderTopColor: color.lineSoft,
            },
            STICKY_BOTTOM,
          ]}
        >
          {cta}
        </View>
      )}
      <Sheet
        testID="pricing-compare-sheet"
        open={sheet === "compare"}
        onClose={() => {
          setSheet(null);
        }}
        title={t("pricing.compare.title")}
        closeLabel={t("pricing.close")}
        desktop={desktop}
        reduce={reduce}
      >
        <Compare
          shown={plan}
          onPick={(pl) => {
            setPicked(pl === recommended ? null : pl);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet
        testID="pricing-how-sheet"
        open={sheet === "how"}
        onClose={() => {
          setSheet(null);
        }}
        title={t("roi.title")}
        closeLabel={t("pricing.close")}
        desktop={desktop}
        reduce={reduce}
      >
        <RoiCalculator
          weekly={w}
          price={p}
          setWeekly={setWeekly}
          setPrice={setPrice}
          advice={advice}
          profile={inputs}
          setLocations={(n) => {
            setLocations(n);
            setWeekly(null);
          }}
          uplifted={profile.uplift && weekly === null}
        />
      </Sheet>
    </View>
  );
}
