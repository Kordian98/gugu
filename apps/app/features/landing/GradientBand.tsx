import type { ReactNode } from "react";
import { View } from "react-native";

/** Native: soft lilac card (no gradient dependency). Web uses GradientBand.web.tsx. */
export function GradientBand({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderRadius: 36, overflow: "hidden", backgroundColor: "#EBDDFB" }}>
      {children}
    </View>
  );
}
