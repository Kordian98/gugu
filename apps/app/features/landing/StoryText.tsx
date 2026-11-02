import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text, color } from "@gugu/design-system";

import { ILLUSTRATIVE, type Beat } from "./beats";

/** Eyebrow + title + body for one chapter. */
export function StoryText({ beat, compact }: { beat: Beat; compact: boolean }) {
  const { t } = useTranslation("landing");
  return (
    <View style={{ gap: compact ? 8 : 14 }}>
      <Text role="eyebrow" size={compact ? 11 : 13}>
        {t(`story.${beat}.eyebrow`)}
      </Text>
      <View accessibilityRole="header">
        <Text role="display" size={compact ? 32 : 52} lineHeight={compact ? 36 : 58}>
          {t(`story.${beat}.title`)}
        </Text>
      </View>
      <Text size={compact ? 14.5 : 18} lineHeight={compact ? 21 : 28} color={color.ink2}>
        {t(`story.${beat}.body`)}
      </Text>
      {ILLUSTRATIVE.includes(beat) ? (
        <Text size={11.5} color={color.muted}>
          {t("story.illustrative")}
        </Text>
      ) : null}
    </View>
  );
}
