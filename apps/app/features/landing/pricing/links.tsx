import { Pressable } from "react-native";

import { Icon, MIN_TOUCH, Text, color, radius } from "@gugu/design-system";

/** Pill link that opens a sheet ("So sánh gói", "Cách tính"). */
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
