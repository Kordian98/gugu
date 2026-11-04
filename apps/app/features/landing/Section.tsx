import type { ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";

import { GradientText, Text, color, font, gradient } from "@gugu/design-system";

import type { LandingAnchor } from "./useLandingNav";

/** Centered content column (max 1240 px) with responsive gutters. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={`mx-auto w-full max-w-[1240px] px-4 min-[900px]:px-10 ${className ?? ""}`}>
      {children}
    </View>
  );
}

/** Section heading: tracked eyebrow + editorial serif title. */
export function SectionHead({
  eyebrow,
  title,
  center = false,
  onDark = false,
  glow,
}: {
  eyebrow: string;
  title: string;
  center?: boolean;
  onDark?: boolean;
  /** Up to two words of the title in the brand gradient (rendered after `title`), plus trailing text. */
  glow?: { words: string; after?: string; colors?: readonly string[] };
}) {
  return (
    <View className={`gap-3 ${center ? "items-center" : ""}`}>
      <Text role="eyebrow" size={13} color={onDark ? color.pink300 : color.eyebrow}>
        {eyebrow}
      </Text>
      <View accessibilityRole="header">
        <Text
          role="display"
          size={48}
          lineHeight={56}
          color={onDark ? "#FBF1F6" : color.ink}
          style={center ? { textAlign: "center" } : undefined}
        >
          {title}
          {glow ? (
            <GradientText
              colors={glow.colors ?? gradient.glowHere}
              style={{ fontFamily: font.display, fontSize: 48, lineHeight: 56 }}
            >
              {glow.words}
            </GradientText>
          ) : null}
          {glow?.after}
        </Text>
      </View>
    </View>
  );
}

/** Anchor target: reports its y offset so the nav can scroll to it. */
export function Anchor({
  id,
  onY,
  children,
}: {
  id: LandingAnchor;
  onY: (id: LandingAnchor, y: number) => void;
  children: ReactNode;
}) {
  return (
    <View
      nativeID={id}
      onLayout={(e: LayoutChangeEvent) => {
        onY(id, e.nativeEvent.layout.y);
      }}
    >
      {children}
    </View>
  );
}
