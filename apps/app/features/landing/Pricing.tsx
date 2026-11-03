import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, Icon, Text, checkableA11y, color } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { BASIC_MONTHLY_VND } from "./plans";
import { RoiCalculator } from "./RoiCalculator";

import { Container, SectionHead } from "./Section";
import type { LandingNavActions } from "./useLandingNav";

const PLANS = ["basic", "pro", "ultra"] as const;
const PERIODS = ["monthly", "yearly"] as const;

/** Basic / Pro / Ultra (X17, q75, X25): Basic free for the first year then 99,000 VND/month; Pro/Ultra prices TBA. */
export function Pricing({ nav, stacked }: { nav: LandingNavActions; stacked: boolean }) {
  const { t } = useTranslation("landing");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const locale = useLocale();
  const price = formatVND(BASIC_MONTHLY_VND, locale);
  return (
    <Container className="gap-10 py-20">
      <View className="gap-6 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <SectionHead
          eyebrow={t("pricing.eyebrow")}
          title={t("pricing.titlePre")}
          glow={{ words: t("pricing.titleGlow"), after: t("pricing.titlePost") }}
        />
        <View
          accessibilityRole="radiogroup"
          className="flex-row self-start rounded-full bg-white p-1"
          style={{ borderWidth: 1, borderColor: color.line }}
        >
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              {...checkableA11y("radio", period === p)}
              onPress={() => {
                setPeriod(p);
              }}
              className="min-h-11 justify-center rounded-full px-5 py-2.5"
              style={{ backgroundColor: period === p ? color.ink : "transparent" }}
            >
              <Text role="uiSemiBold" size={14} color={period === p ? color.white : color.body}>
                {t(`pricing.${p}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {/* Benefits first, right under the headline and next to a CTA (owner): the calculator. */}
      <RoiCalculator stacked={stacked} onStart={nav.trial} />
      <View className={stacked ? "gap-5" : "flex-row gap-5"}>
        {PLANS.map((plan) => {
          const pro = plan === "pro";
          return (
            <View
              key={plan}
              className="flex-1 gap-5 rounded-[30px] p-8"
              style={{
                backgroundColor: pro ? color.plum950 : color.white,
                borderWidth: 1,
                borderColor: pro ? color.plum950 : color.lineSoft,
              }}
            >
              <View className="flex-row items-center justify-between">
                <Text role="display" size={36} lineHeight={40} color={pro ? "#FBF1F6" : color.ink}>
                  {t(`pricing.${plan}.name`)}
                </Text>
                {pro ? (
                  <View
                    className="rounded-full px-3 py-1"
                    style={{ backgroundColor: color.pink300 }}
                  >
                    <Text role="uiSemiBold" size={12} color={color.plum950}>
                      {t("pricing.popular")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text size={15.5} color={pro ? "#E2D2DC" : color.body}>
                {t(`pricing.${plan}.tagline`)}
              </Text>
              <View className="gap-1">
                {plan === "basic" ? (
                  <>
                    {/* X25: Basic is free for the first year, then 99,000 VND/month. */}
                    <Text role="display" size={30} lineHeight={34} color={color.ink}>
                      {t("pricing.basicFree")}
                    </Text>
                    <Text role="uiSemiBold" size={14.5} color={color.ink2}>
                      {t("pricing.basicThen", { price })}
                    </Text>
                    <Text size={13.5} color={color.ink2}>
                      {t("pricing.noCard")}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text role="uiSemiBold" size={22} color={pro ? "#FBF1F6" : color.ink}>
                      {t("pricing.priceSoon")}
                    </Text>
                    <Text size={13.5} color={pro ? "#BBA6B6" : color.muted}>
                      {t(period === "monthly" ? "pricing.billedMonthly" : "pricing.billedYearly")}
                    </Text>
                  </>
                )}
              </View>
              <View className="gap-3">
                {t(`pricing.${plan}.items`)
                  .split("\n")
                  .map((item) => (
                    <View key={item} className="flex-row items-start gap-3">
                      <View
                        className="mt-0.5 h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: pro ? color.pink300 : color.lilac100 }}
                      >
                        <Icon
                          name="check"
                          size={12}
                          color={pro ? color.plum950 : color.lilac700}
                          strokeWidth={2.6}
                        />
                      </View>
                      <View className="flex-1">
                        <Text size={15} lineHeight={22} color={pro ? "#F3E6EE" : color.ink2}>
                          {item}
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
              <View className="mt-auto gap-2 pt-2">
                <Button
                  label={t(plan === "basic" ? "pricing.basicCta" : "pricing.cta")}
                  onPress={nav.trial}
                  height={54}
                  fontSize={16}
                  trailingArrow
                  {...(pro
                    ? { style: { backgroundColor: color.pink300 }, labelColor: color.plum950 }
                    : {})}
                />
              </View>
            </View>
          );
        })}
      </View>
      <Text size={14.5} lineHeight={22} color={color.muted} style={{ maxWidth: 760 }}>
        {t("pricing.trial", { price })}
      </Text>
    </Container>
  );
}
