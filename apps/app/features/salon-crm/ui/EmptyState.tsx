import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon, Text, useCalm, type IconName } from "@gugu/design-system";

/** Actionable empty state: soft lilac icon, short title, one sentence, optional action (07 §3.9). */
export function EmptyState({
  icon,
  title,
  body,
  action,
  compact,
  testID,
}: {
  icon: IconName;
  title: string;
  body?: string | undefined;
  action?: ReactNode | undefined;
  compact?: boolean | undefined;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <View
      testID={testID}
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingVertical: compact ? 18 : 40,
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          width: compact ? 40 : 56,
          height: compact ? 40 : 56,
          borderRadius: 999,
          backgroundColor: c.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={compact ? 18 : 24} color={c.accent} />
      </View>
      <Text
        role="uiSemiBold"
        size={compact ? 14 : 16}
        color={c.ink}
        style={{ textAlign: "center" }}
      >
        {title}
      </Text>
      {body ? (
        <Text size={13} color={c.body} style={{ textAlign: "center", maxWidth: 380 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}
