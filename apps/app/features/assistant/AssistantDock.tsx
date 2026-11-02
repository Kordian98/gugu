import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Icon, useCalm } from "@gugu/design-system";

import { AssistantPanel } from "./AssistantPanel";
import { useAssistantStatus } from "./data";

/**
 * The AI assistant's place in the workspace (owner decision 2026-11-02): a floating bubble in the
 * reserved bottom-right corner of every page, opening a side sheet on desktop or a full-height
 * sheet above the tab bar on phones. Shown to members with `assistant.use`; on plans without the
 * assistant the panel explains the Pro upgrade instead of chatting.
 */
export function AssistantDock({ mobile, bubbleBottom }: { mobile: boolean; bubbleBottom: number }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const insets = useSafeAreaInsets();
  const status = useAssistantStatus();
  const [open, setOpen] = useState(false);
  // Only members whose role has `assistant.use`; the API enforces it again.
  if (status.data?.permitted !== true) return null;

  // Above the tab bar, clear of its raised centre "+" button.
  const panelBottom = mobile ? 84 + insets.bottom : 0;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {open ? (
        <View
          testID="assistant-panel"
          style={{
            position: "absolute",
            top: mobile ? insets.top : 0,
            bottom: panelBottom,
            right: 0,
            left: mobile ? 0 : undefined,
            width: mobile ? undefined : 420,
            backgroundColor: c.canvas,
            borderLeftWidth: mobile ? 0 : 1,
            borderColor: c.line,
            borderTopLeftRadius: mobile ? 20 : 0,
            borderTopRightRadius: mobile ? 20 : 0,
            shadowColor: c.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <AssistantPanel
            status={status.data}
            loading={status.isPending}
            onClose={() => {
              setOpen(false);
            }}
          />
        </View>
      ) : null}
      {!open ? (
        <Pressable
          testID="assistant-bubble"
          accessibilityRole="button"
          accessibilityLabel={t("assistant.open")}
          onPress={() => {
            setOpen(true);
          }}
          style={{
            position: "absolute",
            right: 20,
            bottom: bubbleBottom,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.accentBg,
            shadowColor: c.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <Icon name="sparkles" size={24} color={c.onAccent} />
        </Pressable>
      ) : null}
    </View>
  );
}
