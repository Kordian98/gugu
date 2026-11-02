import type { ReactNode } from "react";
import { View } from "react-native";

import { useCalm } from "../../calm";
import { Text } from "../Text";
import { CalmCard } from "./CalmCard";

/** Placeholder glyph for a metric with no data yet (not a translatable string). */
const EMPTY_VALUE = "—";

/**
 * KPI card (ref crm-01 top row): caps label, big value, a caption row and an optional visual
 * (sparkline / progress / avatars). `value === null` renders the designed empty state.
 */
export function StatCard({
  label,
  value,
  caption,
  badge,
  visual,
  emptyCaption,
  testID,
}: {
  label: string;
  value: string | null;
  caption?: ReactNode | undefined;
  badge?: ReactNode | undefined;
  visual?: ReactNode | undefined;
  emptyCaption: string;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <CalmCard testID={testID} style={{ flex: 1, minWidth: 200, gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          role="uiSemiBold"
          size={12}
          color={c.ink}
          style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
        >
          {label}
        </Text>
      </View>
      {value === null ? (
        <>
          <Text role="uiSemiBold" size={26} lineHeight={32} color={c.muted}>
            {EMPTY_VALUE}
          </Text>
          <Text size={13} color={c.muted}>
            {emptyCaption}
          </Text>
        </>
      ) : (
        <>
          <Text role="uiSemiBold" size={26} lineHeight={32} color={c.ink} numberOfLines={1}>
            {value}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                flexShrink: 1,
              }}
            >
              {badge}
              {caption !== undefined ? (
                typeof caption === "string" ? (
                  <Text size={13} color={c.body}>
                    {caption}
                  </Text>
                ) : (
                  caption
                )
              ) : null}
            </View>
            {visual !== undefined ? <View>{visual}</View> : null}
          </View>
        </>
      )}
    </CalmCard>
  );
}
