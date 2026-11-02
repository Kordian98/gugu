import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { HandDrawnHeart, Icon, Text, color } from "@gugu/design-system";

import { Container, SectionHead } from "./Section";

const POINTS = ["point1", "point2", "point3"] as const;

/**
 * Future-marketplace announcement (X19/X20). Wording is factual; the disclaimer is mandatory and
 * must stay visible in both languages.
 */
export function Marketplace({ stacked }: { stacked: boolean }) {
  const { t } = useTranslation("landing");
  return (
    <Container className="py-16">
      <View
        className="overflow-hidden rounded-[36px] p-8 min-[900px]:p-14"
        style={{ backgroundColor: color.plum950 }}
      >
        <View className={stacked ? "gap-8" : "flex-row gap-14"}>
          <View className="flex-1 gap-6">
            <SectionHead eyebrow={t("marketplace.eyebrow")} title={t("marketplace.title")} onDark />
            <Text size={18} lineHeight={28} color="#E2D2DC">
              {t("marketplace.body")}
            </Text>
            <View
              className="rounded-[22px] p-5"
              style={{
                backgroundColor: "rgba(246,184,204,0.14)",
                borderWidth: 1,
                borderColor: "rgba(246,184,204,0.35)",
              }}
            >
              <Text role="uiSemiBold" size={18} lineHeight={27} color="#FBF1F6">
                {t("marketplace.offer")}
              </Text>
            </View>
          </View>
          <View className="gap-4 min-[900px]:w-[380px] min-[900px]:justify-center">
            {POINTS.map((k) => (
              <View
                key={k}
                className="flex-row items-center gap-4 rounded-[20px] p-5"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
              >
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: color.pink300 }}
                >
                  <Icon name="check" size={16} color={color.plum950} strokeWidth={2.6} />
                </View>
                <View className="flex-1">
                  <Text role="uiMedium" size={16} lineHeight={23} color="#FBF1F6">
                    {t(`marketplace.${k}`)}
                  </Text>
                </View>
              </View>
            ))}
            <View className="flex-row justify-end pr-2 pt-1">
              <HandDrawnHeart size={34} color={color.pink300} />
            </View>
          </View>
        </View>
        <View
          className="mt-10 pt-5"
          style={{ borderTopWidth: 1, borderTopColor: "rgba(255,230,245,0.15)" }}
        >
          <Text size={12.5} lineHeight={19} color="#BBA6B6">
            {t("marketplace.disclaimer")}
          </Text>
        </View>
      </View>
    </Container>
  );
}
