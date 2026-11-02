import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon, Text, color } from "@gugu/design-system";

import { Container, SectionHead } from "./Section";

const QUESTIONS = ["1", "2", "3", "4", "5"] as const;

/** Short FAQ accordion (one item open at a time). */
export function Faq() {
  const { t } = useTranslation("landing");
  const [open, setOpen] = useState<string | null>("1");
  return (
    <Container className="gap-10 py-20 min-[900px]:flex-row min-[900px]:gap-16">
      <View className="min-[900px]:w-[360px]">
        <SectionHead eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
      </View>
      <View className="flex-1 gap-3">
        {QUESTIONS.map((n) => {
          const expanded = open === n;
          return (
            <View
              key={n}
              className="rounded-[22px] bg-white"
              style={{ borderWidth: 1, borderColor: expanded ? color.lilac300 : color.lineSoft }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => {
                  setOpen(expanded ? null : n);
                }}
                className="flex-row items-center gap-4 px-6 py-5"
              >
                <View className="flex-1">
                  <Text role="uiSemiBold" size={17} lineHeight={24}>
                    {t(`faq.q${n}`)}
                  </Text>
                </View>
                <Icon name={expanded ? "chevronUp" : "chevronDown"} size={20} />
              </Pressable>
              {expanded ? (
                <View className="px-6 pb-6">
                  <Text size={15.5} lineHeight={24} color={color.body}>
                    {t(`faq.a${n}`)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Container>
  );
}
