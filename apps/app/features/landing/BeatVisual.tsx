import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { Icon, Text, color } from "@gugu/design-system";

import { BeforeCollage } from "./BeforeCollage";
import type { Beat } from "./beats";
import { Bubble, PhoneFrame, PriceListCard, ScreenFrame, Tag } from "./Mockups";

const FINALE_STEPS = ["step1", "step2", "step3", "step4"] as const;

/** Reveals children once the chapter's local progress passes `at` (0..1). Always visible when `local` is null. */
function Reveal({
  local,
  at,
  children,
}: {
  local: SharedValue<number> | null;
  at: number;
  children: ReactNode;
}) {
  const a = useAnimatedStyle(() => {
    if (local === null) return { opacity: 1, transform: [{ translateY: 0 }] };
    const v = Math.min(1, Math.max(0, (local.value - at) / 0.12));
    return { opacity: v, transform: [{ translateY: (1 - v) * 14 }] };
  });
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** Visual for one story chapter: REAL CRM captures, or illustrative message mockups. */
export function BeatVisual({
  beat,
  width,
  maxH,
  local,
}: {
  beat: Beat;
  width: number;
  maxH: number;
  local: SharedValue<number> | null;
}) {
  const { t } = useTranslation("landing");
  const phoneW = Math.min(width * 0.62, 300, maxH * 0.52);
  switch (beat) {
    case "dive":
      return null;
    case "before":
      return <BeforeCollage width={Math.min(width, maxH / 0.8)} />;
    case "calendar":
      return <ScreenFrame name="timeline" width={Math.min(width, (maxH - 30) * 1.46)} />;
    case "clients":
      return (
        <View style={{ alignItems: "center" }}>
          <ScreenFrame name="upcoming" width={Math.min(width * 0.6, 340, (maxH - 30) * 0.7)} />
        </View>
      );
    case "reminders":
      return (
        <View style={{ alignItems: "center" }}>
          <PhoneFrame width={phoneW}>
            <Bubble side="out" size={13} text={t("story.reminders.msg")} />
            <View style={{ alignSelf: "flex-end" }}>
              <Tag label={t("story.reminders.sent")} tone="green" />
            </View>
          </PhoneFrame>
        </View>
      );
    case "ai":
      return (
        <View style={{ width, alignItems: "center", gap: 18 }}>
          <PriceListCard width={Math.min(width * 0.62, 340)} />
          <Icon name="chevronDown" size={26} color={color.lilac700} strokeWidth={2.4} />
          <ScreenFrame name="aiSetup" width={width} />
        </View>
      );
    case "insights":
      return <ScreenFrame name="kpis" width={width} />;
    case "assistant":
      return (
        <View
          style={{
            width,
            gap: 12,
            padding: 20,
            borderRadius: 24,
            backgroundColor: color.white,
            borderWidth: 1,
            borderColor: color.lineSoft,
            shadowColor: color.ink,
            shadowOpacity: 0.1,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 16 },
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={18} color={color.lilac700} />
            <Text role="uiSemiBold" size={15}>
              {t("features.assistant.title")}
            </Text>
            <Tag label={t("features.assistant.badge")} tone="ink" />
          </View>
          <Reveal local={local} at={0.1}>
            <Bubble side="out" size={14} text={t("story.assistant.q")} />
          </Reveal>
          <Reveal local={local} at={0.3}>
            <Bubble side="in" size={14} tone="ai" text={t("story.assistant.a")} />
          </Reveal>
          <Reveal local={local} at={0.5}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                alignSelf: "flex-start",
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 99,
                backgroundColor: color.ink,
              }}
            >
              <Icon name="sparkles" size={14} color={color.white} />
              <Text role="uiSemiBold" size={13} color={color.white}>
                {t("story.assistant.draft")}
              </Text>
            </View>
          </Reveal>
          <Text size={12} lineHeight={17} color={color.muted}>
            {t("story.assistant.privacy")}
          </Text>
        </View>
      );
    case "finale":
      return (
        <View
          style={{
            width,
            flexDirection: width > 560 ? "row" : "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <PhoneFrame width={phoneW}>
            <Reveal local={local} at={0.05}>
              <Bubble side="in" size={12.5} text={t("story.finale.ask")} />
            </Reveal>
            <Reveal local={local} at={0.3}>
              <Bubble side="out" size={12.5} text={t("story.finale.offer")} />
            </Reveal>
            <Reveal local={local} at={0.5}>
              <Bubble side="in" size={12.5} text={t("story.finale.reply")} />
            </Reveal>
            <Reveal local={local} at={0.7}>
              <Bubble side="out" size={12.5} text={t("story.finale.confirm")} />
            </Reveal>
          </PhoneFrame>
          {width > 560 ? (
            <View style={{ gap: 10, flex: 1 }}>
              {FINALE_STEPS.map((k, i) => (
                <Reveal key={k} local={local} at={0.05 + i * 0.22}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 16,
                      backgroundColor: color.white,
                      borderWidth: 1,
                      borderColor: color.lineSoft,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: i === 3 ? color.ink : color.lilac100,
                      }}
                    >
                      {i === 3 ? (
                        <Icon name="check" size={14} color={color.white} strokeWidth={2.6} />
                      ) : (
                        <Text role="uiSemiBold" size={12} color={color.lilac700}>
                          {String(i + 1)}
                        </Text>
                      )}
                    </View>
                    <Text role="uiMedium" size={14}>
                      {t(`story.finale.${k}`)}
                    </Text>
                  </View>
                </Reveal>
              ))}
            </View>
          ) : null}
        </View>
      );
  }
}
