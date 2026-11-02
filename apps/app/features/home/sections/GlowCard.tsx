import { Image, Pressable, View } from "react-native";

import { color } from "@gugu/design-system";

import { GLOW_IMG } from "../assets";
import { AccentText } from "../hero/AccentText";

const OVERLAY = [
  { x: 0.073, y: 0.13, rot: -10 },
  { x: 0.117, y: 0.37, rot: -18 },
  { x: 0.044, y: 0.26, rot: -14 },
] as const;

/** Glow-up editorial image with its handwritten caption (live text, both languages). */
export function GlowCard({
  index,
  width,
  height,
  caption,
  size,
  onPress,
}: {
  index: 0 | 1 | 2;
  width: number;
  height: number;
  caption: string;
  size: number;
  onPress: () => void;
}) {
  const o = OVERLAY[index];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={caption.replace(/\n|♡/g, " ").trim()}
      onPress={onPress}
      style={{ width, height, borderRadius: 16, overflow: "hidden" }}
    >
      <Image
        source={GLOW_IMG[index]}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
      />
      <View
        style={{
          position: "absolute",
          left: width * o.x,
          top: height * o.y,
          transformOrigin: "0 0",
          transform: [{ rotate: `${String(o.rot)}deg` }],
        }}
      >
        <AccentText
          text={caption}
          role="script"
          size={size}
          lineHeight={size * 1.1}
          color={color.plum950}
        />
      </View>
    </Pressable>
  );
}
