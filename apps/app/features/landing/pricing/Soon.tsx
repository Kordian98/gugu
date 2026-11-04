import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon, Text, color, radius } from "@gugu/design-system";

/** "Sắp có" tag for plan contents that exist in the catalogue but are not built yet (q106). */
export function Soon() {
  const { t } = useTranslation("landing");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: color.lilac100,
      }}
    >
      <Icon name="clock" size={11} color={color.lilac700} />
      <Text role="uiSemiBold" size={11.5} color={color.ink2}>
        {t("pricing.soon")}
      </Text>
    </View>
  );
}
