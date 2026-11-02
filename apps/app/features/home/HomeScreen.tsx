import { Platform, ScrollView, View } from "react-native";

import { breakpoint, color } from "@gugu/design-system";

import { DesktopHome } from "./desktop/DesktopHome";
import { MobileHome } from "./mobile/MobileHome";
import { useHomeNav } from "./useHomeNav";
import { useViewport } from "./useViewport";

/** Homepage (topic 02 design, topic 10 IA). Web ≥ 900 px = ref-01 desktop artboard; phones = mobile layout. */
export function HomeScreen() {
  const { mounted, width, height } = useViewport();
  const nav = useHomeNav();
  if (Platform.OS === "web" && !mounted) {
    // SSR + first client render: both layouts at reference sizes, chosen by a CSS media query (no hydration
    // mismatch, content is in the HTML for SEO); after mount the matching layout re-renders at the real size.
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }}>
        <View className="hidden min-[900px]:flex">
          <DesktopHome width={1440} nav={nav} />
        </View>
        <View className="flex min-[900px]:hidden">
          <MobileHome width={390} height={844} nav={nav} />
        </View>
      </ScrollView>
    );
  }
  const desktop = Platform.OS === "web" && width >= breakpoint.desktop;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {desktop ? (
        <DesktopHome width={width} nav={nav} />
      ) : (
        <MobileHome width={width} height={height} nav={nav} />
      )}
    </ScrollView>
  );
}
