import { useEffect, useState } from "react";
import { AccessibilityInfo, Image, StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

import { IMG, VIDEO } from "../assets";

/** Native hero: poster image + muted seamless loop (expo-video). Reduced motion → poster only. */
// Props match the web implementation; native always uses the 900 px loop without edge masks.
export function HeroMedia(_props: { fadeEdges?: boolean; small?: boolean }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const player = useVideoPlayer(VIDEO.loop900, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      setReduceMotion(on);
      if (!on) player.play();
    });
  }, [player]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={IMG.diorama} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {reduceMotion ? null : (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      )}
    </View>
  );
}
