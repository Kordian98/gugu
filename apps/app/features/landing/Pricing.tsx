import { useMemo, useState } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "react-native-reanimated";

import type { BillingInterval, PublicPlanCode } from "@gugu/contracts";
import { Button, GradientText, Text, color, font, gradient } from "@gugu/design-system";

import { RoiCalculator } from "./RoiCalculator";
import { Container, SectionHead } from "./Section";
import { ChoiceRow } from "./pricing/Choice";
import { Compare } from "./pricing/Compare";
import {
  DEFAULT_ANSWERS,
  TEAM_DEFAULTS,
  TEAMS,
  advise,
  recommend,
  type Answers,
} from "./pricing/model";
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
  const [sheet, setSheet] = useState<"compare" | "how" | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  useFocusClearance("pricing-section", desktop ? 0 : barHeight);

  const defaults = TEAM_DEFAULTS[answers.team];
  const w = weekly ?? defaults.weekly;
  const p = price ?? defaults.price;
  const recommended = recommend(answers);
  const plan = picked ?? recommended;
  const advice = useMemo(() => advise(plan, interval, w, p), [plan, interval, w, p]);

  const answer = (patch: Partial<Answers>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setPicked(null);
  };
  const why =
    plan === recommended
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
      {plan === "ultra" ? (
        <Text size={12} lineHeight={16} color={color.body} style={{ textAlign: "center" }}>
          {t("pricing.cta.ultraNote")}
        </Text>
      ) : null}
    </View>
  );

  const questions = (
    <View style={{ gap: desktop ? 20 : 6 }} testID="pricing-questions">
      <ChoiceRow
        testID="pricing-q-team"
        inline={!desktop}
        label={t("pricing.q.team.label")}
        question={t("pricing.q.team.full")}
        value={answers.team}
        onChange={(team) => {
          answer({ team });
          setWeekly(null);
          setPrice(null);
        }}
        options={TEAMS.map((v) => ({
          value: v,
          label: desktop ? t(`pricing.q.team.${v}`) : t(`pricing.q.team.short.${v}`),
        }))}
      />
      <ChoiceRow
        testID="pricing-q-ai"
        inline={!desktop}
        label={t("pricing.q.ai.label")}
        question={t("pricing.q.ai.full")}
        value={answers.ai ? "yes" : "no"}
        onChange={(v) => {
          answer({ ai: v === "yes" });
        }}
        options={[
          { value: "yes", label: t("pricing.q.ai.yes") },
          { value: "no", label: t("pricing.q.ai.no") },
        ]}
      />
      <ChoiceRow
        testID="pricing-q-multi"
        inline={!desktop}
        label={t("pricing.q.multi.label")}
        question={t("pricing.q.multi.full")}
        value={answers.multi ? "many" : "one"}
        onChange={(v) => {
          answer({ multi: v === "many" });
        }}
        options={[
          { value: "one", label: t("pricing.q.multi.one") },
          { value: "many", label: t("pricing.q.multi.many") },
        ]}
      />
    </View>
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
      onPick={setPicked}
      cta={cta}
    />
  );

  return (
    <View testID="pricing-section" style={desktop ? undefined : SNAP_START}>
      <Container className={desktop ? "py-10" : "pt-5"}>
        {desktop ? (
          <View style={{ flexDirection: "row", gap: 56, alignItems: "center" }}>
            <View style={{ flex: 1, gap: 28, maxWidth: 520 }}>
              <SectionHead
                eyebrow={t("pricing.eyebrow")}
                title={t("pricing.titlePre")}
                glow={{
                  words: t("pricing.titleGlow"),
                  after: t("pricing.titlePost"),
                  colors: gradient.glowInk,
                }}
              />
              <Text size={17} lineHeight={26} color={color.body}>
                {t("pricing.sub")}
              </Text>
              {questions}
            </View>
            <View style={{ flex: 1.1 }}>{card}</View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Text role="eyebrow" size={12}>
                {t("pricing.eyebrow")}
              </Text>
              <View accessibilityRole="header">
                <Text role="display" size={32} lineHeight={42} color={color.ink}>
                  {t("pricing.titlePre")}
                  <GradientText
                    colors={gradient.glowInk}
                    style={{ fontFamily: font.display, fontSize: 32, lineHeight: 42 }}
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
        />
      </Sheet>
    </View>
  );
}
