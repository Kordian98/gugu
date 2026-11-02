import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, Icon, Text, useCalm } from "@gugu/design-system";

import { BookabilityWarning } from "./BookabilityWarning";

export type AssignItem = { id: string; label: string; hint?: string | undefined; avatar?: boolean };

/**
 * Prominent checkbox list for "who performs this service" / "which services this person does":
 * select all / none, per-row checkbox (avatar + name), count, and a "not bookable" warning.
 */
export function AssignList({
  title,
  items,
  selected,
  onChange,
  warning,
  empty,
  testID,
}: {
  title: string;
  items: AssignItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Shown above the list when set (e.g. nothing selected → not bookable). */
  warning?: string | null | undefined;
  empty: string;
  testID: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const on = new Set(selected);
  const count = items.filter((i) => on.has(i.id)).length;
  return (
    <View
      testID={testID}
      style={{
        gap: 10,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Text role="uiSemiBold" size={14} color={c.ink} style={{ flex: 1 }}>
          {title}
        </Text>
        {items.length ? (
          <>
            <Text size={12} color={c.muted}>
              {t("assign.count", { count, total: items.length })}
            </Text>
            <Pressable
              testID={`${testID}-all`}
              accessibilityRole="button"
              onPress={() => {
                onChange(items.map((i) => i.id));
              }}
              hitSlop={6}
            >
              <Text role="uiSemiBold" size={13} color={c.accent}>
                {t("assign.all")}
              </Text>
            </Pressable>
            <Pressable
              testID={`${testID}-none`}
              accessibilityRole="button"
              onPress={() => {
                onChange([]);
              }}
              hitSlop={6}
            >
              <Text role="uiSemiBold" size={13} color={c.accent}>
                {t("assign.none")}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {warning ? <BookabilityWarning testID={`${testID}-warning`} text={warning} /> : null}
      {items.length === 0 ? (
        <Text size={13} color={c.muted}>
          {empty}
        </Text>
      ) : (
        items.map((i) => {
          const checked = on.has(i.id);
          return (
            <Pressable
              key={i.id}
              testID={`${testID}-${i.id}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={i.label}
              onPress={() => {
                onChange(checked ? selected.filter((x) => x !== i.id) : [...selected, i.id]);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: checked ? 0 : 1.5,
                  borderColor: c.line,
                  backgroundColor: checked ? c.accentBg : c.surface,
                }}
              >
                {checked ? (
                  <Icon name="check" size={14} color={c.onAccent} strokeWidth={2.6} />
                ) : null}
              </View>
              {i.avatar ? <Avatar name={i.label} size={30} /> : null}
              <View style={{ flex: 1 }}>
                <Text size={14} color={c.ink} numberOfLines={1}>
                  {i.label}
                </Text>
                {i.hint ? (
                  <Text size={12} color={c.muted} numberOfLines={1}>
                    {i.hint}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}
