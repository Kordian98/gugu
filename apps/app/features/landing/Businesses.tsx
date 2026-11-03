import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text, color } from "@gugu/design-system";

import { BusinessIcon, type BusinessKind } from "./BusinessIcon";
import { Container } from "./Section";

const KINDS: BusinessKind[] = ["hair", "nails", "barber", "spa", "aesthetics"];

/** "Built for every kind of beauty business" tiles. */
export function Businesses({ columns }: { columns: 2 | 3 | 5 }) {
  const { t } = useTranslation("landing");
  const basis = columns === 5 ? "18.6%" : columns === 3 ? "31.8%" : "48.4%";
  return (
    <Container className="gap-10 py-16">
      <View accessibilityRole="header">
        <Text
          role="display"
          size={columns === 2 ? 36 : 48}
          lineHeight={columns === 2 ? 40 : 54}
          style={{ textAlign: "center" }}
        >
          {t("businesses.title")}
        </Text>
      </View>
      <View className="flex-row flex-wrap justify-between gap-y-4">
        {KINDS.map((k) => (
          <View
            key={k}
            className="items-center gap-4 rounded-[26px] px-4 py-8"
            style={{
              flexBasis: basis,
              backgroundColor: color.white,
              borderWidth: 1,
              borderColor: color.lineSoft,
            }}
          >
            <View
              className="h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: color.tile }}
            >
              <BusinessIcon kind={k} />
            </View>
            <Text role="uiSemiBold" size={16} style={{ textAlign: "center" }}>
              {t(`businesses.${k}`)}
            </Text>
          </View>
        ))}
      </View>
    </Container>
  );
}
