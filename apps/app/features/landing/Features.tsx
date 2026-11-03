import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text, color } from "@gugu/design-system";

import { FeatureIcon, type FeatureIconName } from "./FeatureIcon";
import { Container, SectionHead } from "./Section";

const FEATURES: {
  key: "calendar" | "clients" | "reminders" | "aiSetup" | "insights" | "assistant";
  icon: FeatureIconName;
  highlight?: boolean;
}[] = [
  { key: "calendar", icon: "calendar" },
  { key: "clients", icon: "users" },
  { key: "reminders", icon: "bell" },
  { key: "aiSetup", icon: "sparkles", highlight: true },
  { key: "insights", icon: "chart" },
  { key: "assistant", icon: "chat" },
];

/** Feature grid — only GuGu Studio scope (X22/X23): no payments, no SMS marketing, no booking page. */
export function Features({ columns }: { columns: 1 | 2 | 3 }) {
  const { t } = useTranslation("landing");
  const basis = columns === 3 ? "31.8%" : columns === 2 ? "48.6%" : "100%";
  return (
    <Container className="gap-10 py-20">
      <SectionHead eyebrow={t("features.eyebrow")} title={t("features.title")} />
      <View className="flex-row flex-wrap justify-between gap-y-5">
        {FEATURES.map((f) => (
          <View
            key={f.key}
            className="gap-4 rounded-[28px] p-7"
            style={{
              flexBasis: basis,
              backgroundColor: f.highlight === true ? color.tileActiveTo : color.white,
              borderWidth: 1,
              borderColor: f.highlight === true ? "transparent" : color.lineSoft,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: f.highlight === true ? color.white : color.lilac100 }}
              >
                <FeatureIcon name={f.icon} />
              </View>
              {f.key === "assistant" ? (
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: color.ink }}>
                  <Text role="uiSemiBold" size={12} color={color.white}>
                    {t("features.assistant.badge")}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text role="uiSemiBold" size={20} lineHeight={27}>
              {t(`features.${f.key}.title`)}
            </Text>
            <Text size={15.5} lineHeight={24} color={color.body}>
              {t(`features.${f.key}.body`)}
            </Text>
          </View>
        ))}
      </View>
    </Container>
  );
}
