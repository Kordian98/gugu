import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { usePathname } from "expo-router";

import { useCalm } from "@gugu/design-system";

import { useViewport } from "@/services/viewport/useViewport";

import { useWorkspace } from "../data/useWorkspace";
import { BottomTabs, MobileHeader, MoreSheet, useMoreSheet } from "./MobileChrome";
import { Sidebar } from "./Sidebar";
import { useBreakpoint } from "./useBreakpoint";
import { AssistantDock } from "../../assistant/AssistantDock";

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
  const pathname = usePathname();
  // The first-run stepper is a focused screen without workspace chrome.
  const focused = /\/business\/setup$/.test(pathname);

  // Web SSR knows neither the viewport nor the theme: paint the canvas, render after hydration.
  if (Platform.OS === "web" && !mounted)
    return <View style={{ flex: 1, backgroundColor: c.canvas }} />;

  if (focused) return <View style={{ flex: 1, backgroundColor: c.canvas }}>{children}</View>;

  if (bp === "mobile") {
    return (
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <MobileHeader onMenu={more.show} />
        <View style={{ flex: 1 }}>{children}</View>
        <BottomTabs onMore={more.show} />
        <MoreSheet open={more.open} onClose={more.hide} />
        <AssistantSlot bottom={88} mobile />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.canvas }}>
      <Sidebar workspace={workspace} collapsed={bp === "tablet"} />
      <View style={{ flex: 1 }}>{children}</View>
      <AssistantSlot bottom={24} mobile={false} />
    </View>
  );
}

/**
 * Reserved bottom-right corner for the AI assistant bubble (topic 08 mounts it here). Nothing else
 * in the workspace may place controls in this corner; the mobile "+ New" lives in the tab bar centre.
 */
function AssistantSlot({ bottom, mobile }: { bottom: number; mobile: boolean }) {
  return (
    <View
      testID="crm-assistant-slot"
      nativeID="crm-assistant-slot"
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <AssistantDock mobile={mobile} bubbleBottom={bottom} />
    </View>
  );
}
