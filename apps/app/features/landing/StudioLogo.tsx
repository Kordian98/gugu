import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Logo, Text, color } from "@gugu/design-system";

/** Official gugu logo + "Studio" word mark (X22: no new logo). */
export function StudioLogo({ height, onDark = false }: { height: number; onDark?: boolean }) {
  const { t } = useTranslation("landing");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: height * 0.18 }}>
      <Logo height={height} variant={onDark ? "onDark" : "color"} />
      <Text
        role="uiMedium"
        size={height * 0.56}
        lineHeight={height * 0.7}
        color={onDark ? "#E2D2DC" : color.ink}
        style={{ marginTop: height * 0.08, letterSpacing: height * 0.01 }}
      >
        {t("brand.studio")}
      </Text>
    </View>
  );
}
