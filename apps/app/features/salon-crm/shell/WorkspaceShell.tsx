import type { ReactNode } from "react";
import { Platform, View } from "react-native";

import { useCalm } from "@gugu/design-system";

import { useViewport } from "@/features/home/useViewport";

import { useWorkspace } from "../data/useWorkspace";
import { BottomTabs, MobileHeader, MoreSheet, useMoreSheet } from "./MobileChrome";
import { Sidebar } from "./Sidebar";
import { useBreakpoint } from "./useBreakpoint";

/**
 * Salon workspace frame (07 §3.1): sidebar on tablet+ (icon rail below 1024 px), mobile header + bottom
 * tabs on phones. Operational screens render client-side; the API enforces auth and tenancy (05).
 */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { c } = useCalm();
  const { mounted } = useViewport();
  const bp = useBreakpoint();
  const workspace = useWorkspace();
  const more = useMoreSheet();

  // Web SSR knows neither the viewport nor the theme: paint the canvas, render after hydration.
  if (Platform.OS === "web" && !mounted)
    return <View style={{ flex: 1, backgroundColor: c.canvas }} />;

  if (bp === "mobile") {
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <MobileHeader onMenu={more.show} />
        <View style={{ flex: 1 }}>{children}</View>
        <BottomTabs onMore={more.show} />
        <MoreSheet open={more.open} onClose={more.hide} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.canvas }}>
      <Sidebar workspace={workspace} collapsed={bp === "tablet"} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
