import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { color } from "@gugu/design-system";

import { Diorama } from "@/features/hero/Diorama";

import { BEATS, type Beat } from "./beats";
import { BeatVisual } from "./BeatVisual";
import { StoryText } from "./StoryText";

const N = BEATS.length;
const SEG = 1 / N;
/** Focus point of the dive: the reception desk in the ref-01 diorama (fractions of the image). */
const FOCUS = { x: 0.62, y: 0.66 };
const clamp = (v: number, a: number, b: number) => {
  "worklet";
  return Math.min(b, Math.max(a, v));
};

/**
 * Apple-style scroll story: the section is N+1 viewports tall, its stage is pinned (translateY) while
 * scroll progress scrubs the dive into the diorama and crossfades the chapters.
 */
export function StoryScroll({
  scrollY,
  top,
  width,
  height,
  desktop,
}: {
  scrollY: SharedValue<number>;
  top: SharedValue<number>;
  width: number;
  height: number;
  desktop: boolean;
}) {
  const storyH = height * (N + 1);
  const progress = useDerivedValue(() =>
    clamp((scrollY.value - top.value) / (storyH - height), 0, 1),
  );
  const pin = useAnimatedStyle(() => ({
    transform: [{ translateY: clamp(scrollY.value - top.value, 0, storyH - height) }],
  }));
  const dW = Math.max(width, (height * 1388) / 980) * 1.04;
  const dH = (dW * 980) / 1388;
  const dive = useAnimatedStyle(() => {
    const k = clamp(progress.value / SEG, 0, 1);
    const e = k * k * (3 - 2 * k);
    const s = 1 + e * 1.5;
    const dx = (FOCUS.x - 0.5) * dW;
    const dy = (FOCUS.y - 0.5) * dH;
    return { transform: [{ translateX: -s * dx * e }, { translateY: -s * dy * e }, { scale: s }] };
  });
  const dim = useAnimatedStyle(() => ({
    opacity: clamp((progress.value - SEG * 0.75) / (SEG * 0.35), 0, 1) * (desktop ? 0.86 : 0.92),
  }));
  const visualW = desktop ? Math.min(width * 0.48, 780) : width - 32;
  const visualH = desktop ? height * 0.72 : height * 0.5;
  return (
    <View style={{ height: storyH }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height,
            overflow: "hidden",
            backgroundColor: color.canvas,
          },
          pin,
        ]}
      >
        <Animated.View
          style={[
            {
              position: "absolute",
              left: (width - dW) / 2,
              top: (height - dH) / 2,
              width: dW,
              height: dH,
            },
            dive,
          ]}
        >
          <Diorama width={dW} fadeEdges={false} showProps={false} />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: color.canvas,
            },
            dim,
          ]}
        />
        {BEATS.map((b, i) => (
          <Chapter
            key={b}
            beat={b}
            index={i}
            progress={progress}
            width={width}
            height={height}
            desktop={desktop}
            visualW={visualW}
            visualH={visualH}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function Chapter({
  beat,
  index,
  progress,
  width,
  height,
  desktop,
  visualW,
  visualH,
}: {
  beat: Beat;
  index: number;
  progress: SharedValue<number>;
  width: number;
  height: number;
  desktop: boolean;
  visualW: number;
  visualH: number;
}) {
  const local = useDerivedValue(() => (progress.value - index * SEG) / SEG);
  const a = useAnimatedStyle(() => {
    const l = local.value;
    const fadeIn = index === 0 ? 1 : clamp((l + 0.05) / 0.15, 0, 1);
    const fadeOut = index === N - 1 ? 1 : clamp((1 - l) / 0.15, 0, 1);
    const o = Math.min(fadeIn, fadeOut);
    return { opacity: o, transform: [{ translateY: (1 - fadeIn) * 30 }] };
  });
  const dive = beat === "dive";
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{ position: "absolute", left: 0, right: 0, top: 0, height }, a]}
    >
      {desktop ? (
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: Math.max(40, (width - 1320) / 2),
            gap: 56,
          }}
        >
          <View
            style={{
              width: dive ? 520 : Math.min(460, width * 0.34),
              padding: dive ? 32 : 0,
              borderRadius: 28,
              backgroundColor: dive ? "rgba(255,255,255,0.86)" : "transparent",
            }}
          >
            <StoryText beat={beat} compact={false} />
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <BeatVisual beat={beat} width={visualW} maxH={visualH} local={local} />
          </View>
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            paddingTop: 72,
            paddingHorizontal: 16,
            paddingBottom: 24,
            justifyContent: dive ? "flex-end" : "space-between",
          }}
        >
          {dive ? null : (
            <View style={{ height: visualH, alignItems: "center", justifyContent: "center" }}>
              <BeatVisual beat={beat} width={visualW} maxH={visualH} local={local} />
            </View>
          )}
          <View
            style={{
              padding: dive ? 20 : 0,
              borderRadius: 24,
              backgroundColor: dive ? "rgba(255,255,255,0.9)" : "transparent",
            }}
          >
            <StoryText beat={beat} compact />
          </View>
        </View>
      )}
    </Animated.View>
  );
}
