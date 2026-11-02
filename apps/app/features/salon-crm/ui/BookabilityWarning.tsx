import { Pressable, View } from "react-native";

import { Icon, Text, useCalm } from "@gugu/design-system";

/**
 * "Not bookable" notice (services without staff, staff without services or hours, empty
 * availability). Uses the calm `down` tone; optional action label links to the fix.
 */
export function BookabilityWarning({
  text,
  action,
  onPress,
  testID,
}: {
  text: string;
  action?: string | undefined;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: c.down.bg,
      }}
    >
      <Icon name="alert" size={14} color={c.down.text} />
      <Text size={13} color={c.down.text} style={{ flex: 1 }}>
        {text}
      </Text>
      {action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
          <Text
            role="uiSemiBold"
            size={13}
            color={c.down.text}
            style={{ textDecorationLine: "underline" }}
          >
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
