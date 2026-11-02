import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { color, font } from "../tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

export type ButtonVariant = "ink" | "outline";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  height: number;
  fontSize: number;
  radius?: number;
  paddingX?: number;
  width?: number;
  trailingArrow?: boolean;
  accessibilityLabel?: string;
  /** Overrides the label/arrow colour (e.g. dark text on a pink custom background). */
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** Pill button: "ink" (plum, primary) and "outline" (white, hairline border). Hover lift on web. */
export function Button({
  label,
  onPress,
  variant = "ink",
  height,
  fontSize,
  radius,
  paddingX,
  width,
  trailingArrow,
  accessibilityLabel,
  labelColor,
  style,
}: Props) {
  const ink = variant === "ink";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        return [
          {
            height,
            width,
            paddingHorizontal: paddingX ?? height * 0.42,
            borderRadius: radius ?? height / 2,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: fontSize * 0.45,
            backgroundColor: ink ? color.inkButtonBottom : color.white,
            borderWidth: ink ? 0 : 1,
            borderColor: color.line,
            shadowColor: color.ink,
            shadowOpacity: ink ? (hovered ? 0.3 : 0.22) : 0,
            shadowRadius: height * 0.35,
            shadowOffset: { width: 0, height: height * 0.15 },
            transform: [{ translateY: hovered ? -1 : 0 }, { scale: state.pressed ? 0.98 : 1 }],
          } satisfies ViewStyle,
          style,
        ];
      }}
    >
      <Text
        role={ink ? "uiMedium" : "uiSemiBold"}
        size={fontSize}
        lineHeight={fontSize * 1.3}
        color={labelColor ?? (ink ? color.white : color.ink)}
        style={{ fontFamily: ink ? font.uiMedium : font.uiSemiBold }}
      >
        {label}
      </Text>
      {trailingArrow ? (
        <View>
          <Icon
            name="arrowRight"
            size={fontSize * 0.9}
            color={labelColor ?? (ink ? color.white : color.ink)}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
