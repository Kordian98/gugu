import {
  Image,
  Pressable,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { color } from "../tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

type Props = {
  label: string;
  icon: ImageSourcePropType;
  active?: boolean;
  width: number;
  height: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Category tile from ref-01: icon in a CSS-drawn circle, label below; active = lilac fill + arrow. */
export function CategoryTile({
  label,
  icon,
  active = false,
  width,
  height,
  onPress,
  style,
}: Props) {
  const k = width / 207; // authored at 207×185
  const circle = 100 * k;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        return [
          {
            width,
            height,
            borderRadius: 26 * k,
            backgroundColor: active ? color.tileActiveTo : color.tile,
            borderWidth: 1,
            borderColor: active ? "transparent" : "rgba(238,230,228,0.7)",
            transform: [{ translateY: hovered ? -4 * k : 0 }, { scale: state.pressed ? 0.97 : 1 }],
          } satisfies ViewStyle,
          style,
        ];
      }}
    >
      <View
        style={{
          position: "absolute",
          left: (width - circle) / 2,
          top: 19 * k * (height / 185 / k),
          width: circle,
          height: circle,
          borderRadius: circle / 2,
          backgroundColor: active ? "#FFFFFF" : "#FAF7F3",
          borderWidth: active ? 0 : 1.5 * k,
          borderColor: "rgba(233,225,219,0.95)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image source={icon} style={{ width: circle, height: circle }} resizeMode="contain" />
      </View>
      <View
        style={{
          position: "absolute",
          left: active ? 30 * k : 0,
          right: active ? undefined : 0,
          bottom: height * 0.12,
          alignItems: active ? "flex-start" : "center",
        }}
      >
        <Text role={active ? "uiSemiBold" : "uiMedium"} size={(active ? 24 : 22) * k}>
          {label}
        </Text>
      </View>
      {active ? (
        <View
          style={{
            position: "absolute",
            right: 24 * k,
            bottom: height * 0.13,
            width: 30 * k,
            height: 30 * k,
            borderRadius: 15 * k,
            backgroundColor: color.ink,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="arrowRight" size={14 * k} color={color.white} strokeWidth={2.4} />
        </View>
      ) : null}
    </Pressable>
  );
}
