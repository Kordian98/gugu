import { Image, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Button, Icon, PressableCard, Text, color } from "@gugu/design-system";
import { formatRating, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { SALON_IMG } from "../assets";
import type { DemoSalon } from "../data";

const W = 357; // authored at 357 × 356 (ref-01)

/** "Spots everyone is saving" card. Data is demo until the search API exists (badge shown). */
export function SalonCard({
  salon,
  width,
  saved,
  onToggleSave,
  onOpen,
}: {
  salon: DemoSalon;
  width: number;
  saved: boolean;
  onToggleSave: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation("marketing");
  const { t: ta } = useTranslation("a11y");
  const locale = useLocale();
  const k = width / W;
  const p = (v: number) => v * k;
  return (
    <PressableCard
      radius={p(20)}
      onPress={onOpen}
      accessibilityLabel={salon.name}
      style={{ width, height: p(356) }}
    >
      <Image
        source={SALON_IMG[salon.image]}
        style={{ width: "100%", height: p(215) }}
        resizeMode="cover"
      />
      <View
        style={{
          position: "absolute",
          left: p(12),
          top: p(14),
          paddingHorizontal: p(9),
          paddingVertical: p(3),
          borderRadius: 99,
          backgroundColor: "rgba(42,20,38,0.62)",
        }}
      >
        <Text
          role="uiSemiBold"
          size={p(11)}
          color={color.white}
          style={{ letterSpacing: p(0.8), textTransform: "uppercase" }}
        >
          {t("home.spots.demo")}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={
          saved ? ta("unsave", { name: salon.name }) : ta("save", { name: salon.name })
        }
        onPress={onToggleSave}
        hitSlop={8}
        style={(s) => ({
          position: "absolute",
          right: p(14),
          top: p(16),
          width: p(40),
          height: p(40),
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: s.pressed ? 1.25 : 1 }],
        })}
      >
        <Icon
          name="heart"
          size={p(30)}
          color={saved ? color.rose500 : color.white}
          filled={saved}
          strokeWidth={1.7}
        />
      </Pressable>
      <View
        style={{
          position: "absolute",
          left: p(23),
          right: p(24),
          top: p(232),
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text role="uiMedium" size={p(18)} numberOfLines={1}>
          {salon.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: p(5) }}>
          <Icon name="star" size={p(17)} color={color.star} />
          <Text role="uiSemiBold" size={p(16.5)}>
            {formatRating(salon.rating, locale)}
          </Text>
          <Text size={p(15.5)} color={color.muted}>
            {`(${String(salon.reviews)})`}
          </Text>
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          left: p(23),
          top: p(271),
          flexDirection: "row",
          alignItems: "center",
          gap: p(7),
        }}
      >
        <Icon name="pin" size={p(15)} color="#5A4A66" />
        <Text size={p(13.5)} color="#5A4A66">
          {salon.area[locale]}
        </Text>
      </View>
      <View style={{ position: "absolute", left: p(23), top: p(304) }}>
        <Text size={p(16)} color="#3A1F45">
          {t("home.spots.from", { price: formatVND(salon.priceFrom, locale) })}
        </Text>
      </View>
      <Button
        label={t("home.spots.book")}
        onPress={onOpen}
        height={p(42)}
        fontSize={p(14.5)}
        width={p(120)}
        radius={p(14)}
        style={{ position: "absolute", left: p(219), top: p(293) }}
      />
    </PressableCard>
  );
}
