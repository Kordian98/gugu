import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PLAN_MONTHLY_PRICE_VND, type PublicPlanCode } from "@gugu/contracts";
import { Icon, MIN_TOUCH, Text, color, radius } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { Soon } from "./Soon";

/** Compact "other plan" row (desktop result card) and the pill links that open the sheets. */
export function OtherPlan({
  plan,
  onPick,
}: {
  plan: PublicPlanCode;
  onPick: (p: PublicPlanCode) => void;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const name = t(`pricing.plan.${plan}.name`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("pricing.compare.pick", { plan: name })}
      onPress={() => {
        onPick(plan);
      }}
      style={(state) => ({
        minHeight: MIN_TOUCH,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: (state as { hovered?: boolean }).hovered ? color.lilac700 : color.lineStrong,
        backgroundColor: color.white,
      })}
    >
      <View style={{ width: 52 }}>
        <Text role="uiSemiBold" size={15} color={color.ink}>
          {name}
        </Text>
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ flexShrink: 1 }}>
          <Text size={13} lineHeight={18} color={color.body} numberOfLines={1}>
            {t(`pricing.plan.${plan}.highlight`)}
          </Text>
        </View>
        {plan === "ultra" ? <Soon /> : null}
      </View>
      <Text role="uiSemiBold" size={13} color={color.ink2}>
        {plan === "basic"
          ? t("pricing.plan.basic.short")
          : t("pricing.cost.perMonth", { price: formatVND(PLAN_MONTHLY_PRICE_VND[plan], locale) })}
      </Text>
      <Icon name="chevronRight" size={14} color={color.ink2} />
    </Pressable>
  );
}

export function LinkChip({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        return {
          minHeight: MIN_TOUCH,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderWidth: 1,
          borderColor: hovered ? color.lilac700 : color.lineStrong,
          backgroundColor: hovered ? color.lilac100 : color.white,
        };
      }}
    >
      <Text role="uiSemiBold" size={13.5} color={color.ink}>
        {label}
      </Text>
      <Icon name="chevronUp" size={13} color={color.ink2} />
    </Pressable>
  );
}
