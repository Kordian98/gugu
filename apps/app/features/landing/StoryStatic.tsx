import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text, color } from "@gugu/design-system";

import { Bubble, PhoneFrame, PriceListCard, ScreenFrame, Tag } from "./Mockups";
import { Container } from "./Section";
import { CHAPTERS, ILLUSTRATIVE, type Chapter } from "./story/chapters";
import { SHOTS, shotInfo } from "./story/shots";

const NOTES = ["note1", "note2", "note3"] as const;
const ROWS = ["1", "2", "3", "4"] as const;

/** Static story: native apps and reduced motion. Same chapters, stacked, no scrubbing. */
export function StoryStatic({ width, desktop }: { width: number; desktop: boolean }) {
  const { t } = useTranslation("landing");
  const visualW = desktop ? Math.min(width * 0.46, 720) : width - 32;
  const phoneW = Math.min(visualW * 0.6, 260);
  const visual = (c: Chapter) => {
    switch (c) {
      case "dive": {
        const s = shotInfo("entrance");
        return (
          <Image
            source={SHOTS.entrance}
            style={{ width: visualW, height: (visualW * s.h) / s.w, borderRadius: 24 }}
          />
        );
      }
      case "pain1":
        return (
          <PhoneFrame width={phoneW}>
            <Tag label={t("story.pain1.unread")} tone="red" />
            <Bubble side="in" size={12} text={t("story.pain1.chat1")} />
            <Bubble side="in" size={12} text={t("story.pain1.chat2")} />
            <Bubble side="in" size={12} text={t("story.pain1.chat4")} />
          </PhoneFrame>
        );
      case "pain2":
        return (
          <View
            style={{
              width: Math.min(visualW, 420),
              padding: 20,
              gap: 8,
              borderRadius: 10,
              backgroundColor: "#FFFBEF",
              borderWidth: 1,
              borderColor: "#EADFC2",
            }}
          >
            {NOTES.map((k, i) => (
              <Text
                key={k}
                role="script"
                size={22}
                lineHeight={30}
                color={i === 1 ? "#B23A48" : "#3B2A45"}
                style={i === 1 ? { textDecorationLine: "line-through" } : undefined}
              >
                {t(`story.pain2.${k}`)}
              </Text>
            ))}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Tag label={t("story.pain2.double")} tone="red" />
              <Tag label={t("story.pain2.noShow")} tone="red" />
              <Tag label={t("story.pain2.forgot")} tone="red" />
            </View>
          </View>
        );
      case "calendar":
        return <ScreenFrame name="timeline" width={visualW} />;
      case "reminders":
        return (
          <PhoneFrame width={phoneW}>
            <Bubble side="out" size={12.5} text={t("story.reminders.msg")} />
            <Tag label={t("story.reminders.sent")} tone="green" />
          </PhoneFrame>
        );
      case "assistant":
        return (
          <PhoneFrame width={phoneW}>
            <Tag label={t("story.pro")} tone="ink" />
            <Bubble side="out" size={12.5} text={t("story.assistant.q")} />
            <Bubble side="in" size={12.5} tone="ai" text={t("story.assistant.a")} />
          </PhoneFrame>
        );
      case "finale":
        return (
          <PhoneFrame width={phoneW}>
            <Bubble side="in" size={12} text={t("story.finale.ask")} />
            <Bubble side="out" size={12} text={t("story.finale.offer")} />
            <Bubble side="in" size={12} text={t("story.finale.reply")} />
            <Bubble side="out" size={12} text={t("story.finale.confirm")} />
          </PhoneFrame>
        );
      case "calm":
        return <ScreenFrame name="overview" width={visualW} />;
      case "switch":
        return (
          <View style={{ gap: 14, width: Math.min(visualW, 460) }}>
            <PriceListCard width={Math.min(visualW * 0.7, 320)} />
            {ROWS.map((r) => (
              <View
                key={r}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: color.lineSoft,
                  backgroundColor: color.white,
                }}
              >
                <Text role="uiMedium" size={14}>
                  {t(`story.switch.s${r}`)}
                </Text>
                <Text size={13} color={color.muted}>
                  {`${t(`story.switch.d${r}`)} · ${t(`story.switch.p${r}`)}`}
                </Text>
              </View>
            ))}
          </View>
        );
    }
  };
  return (
    <View>
      {CHAPTERS.map((c) => (
        <Container key={c} className={`gap-8 py-14 ${desktop ? "flex-row items-center" : ""}`}>
          <View style={{ flex: desktop ? 1 : undefined, gap: 10 }}>
            <Text role="eyebrow" size={12}>
              {t(`story.${c}.eyebrow`)}
            </Text>
            <View accessibilityRole="header">
              <Text role="display" size={desktop ? 52 : 34} lineHeight={desktop ? 58 : 38}>
                {t(`story.${c}.title`)}
              </Text>
            </View>
            <Text size={desktop ? 18 : 15} lineHeight={desktop ? 27 : 22} color={color.ink2}>
              {t(`story.${c}.sub`)}
            </Text>
            {ILLUSTRATIVE.includes(c) ? (
              <Text size={11.5} color={color.muted}>
                {t("story.illustrative")}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: "center" }}>{visual(c)}</View>
        </Container>
      ))}
    </View>
  );
}
