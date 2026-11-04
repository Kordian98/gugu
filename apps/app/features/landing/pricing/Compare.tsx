import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PLAN_MONTHLY_PRICE_VND, PUBLIC_PLANS, type PublicPlanCode } from "@gugu/contracts";
import { Icon, MIN_TOUCH, Text, color, radius } from "@gugu/design-system";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

/** "So sánh gói": all three plans with their real entitlements (plan catalogue) and list price. */
export function Compare({
  shown,
  onPick,
}: {
  shown: PublicPlanCode;
  onPick: (p: PublicPlanCode) => void;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  return (
    <View style={{ gap: 12 }} testID="pricing-compare">
      {PUBLIC_PLANS.map((plan) => {
        const on = plan === shown;
        const price = formatVND(PLAN_MONTHLY_PRICE_VND[plan], locale);
        return (
          <View
            key={plan}
            style={{
              gap: 10,
              padding: 16,
              borderRadius: radius.lg,
              backgroundColor: color.white,
              borderWidth: on ? 2 : 1,
              borderColor: on ? color.ink : color.lineSoft,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text role="display" size={26} lineHeight={30} color={color.ink}>
                  {t(`pricing.plan.${plan}.name`)}
                </Text>
                <Text role="uiSemiBold" size={14} color={color.ink2}>
                  {t(`pricing.plan.${plan}.price`, { price })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  on
                    ? t("pricing.compare.picked")
                    : t("pricing.compare.pick", { plan: t(`pricing.plan.${plan}.name`) })
                }
                onPress={() => {
                  onPick(plan);
                }}
                style={(state) => ({
                  minHeight: MIN_TOUCH,
                  paddingHorizontal: 16,
                  borderRadius: radius.pill,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: on ? color.lilac100 : color.white,
                  borderWidth: 1,
                  borderColor: (state as { hovered?: boolean }).hovered
                    ? color.lilac500
                    : color.line,
                })}
              >
                {on ? (
                  <Icon name="check" size={14} color={color.lilac700} strokeWidth={2.6} />
                ) : null}
                <Text role="uiSemiBold" size={13.5} color={color.ink}>
                  {on
                    ? t("pricing.compare.picked")
                    : t("pricing.compare.pick", { plan: t(`pricing.plan.${plan}.name`) })}
                </Text>
              </Pressable>
            </View>
            <View style={{ gap: 7 }}>
              {t(`pricing.plan.${plan}.items`)
                .split("\n")
                .map((item) =>
                  item.endsWith(":") ? (
                    <Text key={item} role="uiSemiBold" size={13.5} color={color.ink}>
                      {item}
                    </Text>
                  ) : (
                    <View key={item} style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ paddingTop: 3 }}>
                        <Icon name="check" size={13} color={color.lilac700} strokeWidth={2.6} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text size={14} lineHeight={20} color={color.ink2}>
                          {item}
                        </Text>
                      </View>
                    </View>
                  ),
                )}
            </View>
          </View>
        );
      })}
      <Text size={13} lineHeight={19} color={color.body}>
        {t("pricing.compare.everyPlan")}
      </Text>
    </View>
  );
}
