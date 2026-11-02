import type { ReactNode } from "react";
import { View } from "react-native";

import { Text, useCalm } from "@gugu/design-system";

/** Card title in caps + optional second line and right-side slot (ref crm-01 card headers). */
export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode | undefined;
}) {
  const { c } = useCalm();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text
          role="uiSemiBold"
          size={12}
          color={c.ink}
          style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text size={13} color={c.body}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
