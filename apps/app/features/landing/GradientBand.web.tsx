import type { ReactNode } from "react";
import { View } from "react-native";

/** Web: lilac → pink → peach band as in the landing references. */
export function GradientBand({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderRadius: 36, overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(110deg, #E3D4FB 0%, #F6D7E6 55%, #FBE1CF 100%)" }}>
        {children}
      </div>
    </View>
  );
}
