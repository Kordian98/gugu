import { Image, View } from "react-native";

import { HERO_IMG } from "@/features/hero/assets";

import { BEATS } from "./beats";
import { BeatVisual } from "./BeatVisual";
import { Container } from "./Section";
import { StoryText } from "./StoryText";

/** Reduced-motion story: the same chapters as static, stacked sections (no pinning, no scrubbing). */
export function StoryStatic({ width, desktop }: { width: number; desktop: boolean }) {
  const visualW = desktop ? Math.min(width * 0.46, 720) : width - 32;
  return (
    <View>
      <Image
        source={HERO_IMG.diorama}
        style={{ width, height: (width * 980) / 1388 }}
        resizeMode="cover"
      />
      {BEATS.map((b) => (
        <Container key={b} className={`gap-8 py-14 ${desktop ? "flex-row items-center" : ""}`}>
          <View style={{ flex: desktop ? 1 : undefined }}>
            <StoryText beat={b} compact={!desktop} />
          </View>
          {b === "dive" ? null : (
            <BeatVisual beat={b} width={visualW} maxH={desktop ? 640 : 520} local={null} />
          )}
        </Container>
      ))}
    </View>
  );
}
