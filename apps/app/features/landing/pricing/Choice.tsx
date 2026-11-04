import { Pressable, View, type ViewStyle } from "react-native";

import { MIN_TOUCH, Text, checkableA11y, color, radius } from "@gugu/design-system";

export type ChoiceOption<T extends string> = { value: T; label: string };

/**
 * One quick question: a short visible label and big one-tap chips (radio group). The full question
 * is the group's accessible name. `inline` puts the label on the chips' line (compact mobile).
 */
export function ChoiceRow<T extends string>({
  label,
  question,
  options,
  value,
  onChange,
  inline,
  testID,
}: {
  label: string;
  question: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  inline: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      role="radiogroup"
      aria-label={question}
      accessibilityLabel={question}
      style={{
        flexDirection: inline ? "row" : "column",
        alignItems: inline ? "center" : "stretch",
        gap: 10,
      }}
    >
      <View style={inline ? { width: 68 } : undefined}>
        <Text role="uiSemiBold" size={inline ? 13.5 : 15} color={color.ink2}>
          {label}
        </Text>
      </View>
      <View style={{ flex: inline ? 1 : undefined, flexDirection: "row", gap: 8 }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={o.value === value}
            onPress={() => {
              onChange(o.value);
            }}
            grow={inline}
            big={!inline}
          />
        ))}
      </View>
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  grow,
  big,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  grow: boolean;
  big: boolean;
}) {
  return (
    <Pressable
      {...checkableA11y("radio", selected)}
      accessibilityLabel={label}
      onPress={onPress}
      style={(state): ViewStyle => {
        const hovered = (state as { hovered?: boolean }).hovered === true;
        return {
          flexGrow: grow ? 1 : 0,
          flexBasis: grow ? 0 : "auto",
          minHeight: big ? 52 : MIN_TOUCH,
          paddingHorizontal: big ? 22 : 6,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? color.ink : hovered ? color.lilac100 : color.white,
          borderWidth: 1.5,
          borderColor: selected ? color.ink : hovered ? color.lilac500 : color.line,
          transform: [{ scale: state.pressed ? 0.96 : 1 }],
        };
      }}
    >
      <Text
        role="uiSemiBold"
        size={big ? 15.5 : 13.5}
        color={selected ? color.white : color.ink}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Small segmented control (radio pair) for the billing interval; each option is 44 px tall. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  badge,
  testID,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Optional badge per option value (e.g. "−2 tháng" on yearly). */
  badge?: Partial<Record<T, string>>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      role="radiogroup"
      aria-label={label}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        padding: 3,
        borderRadius: radius.pill,
        backgroundColor: color.tile,
        borderWidth: 1,
        borderColor: color.lineSoft,
        alignSelf: "flex-start",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        const b = badge?.[o.value];
        return (
          <Pressable
            key={o.value}
            {...checkableA11y("radio", on)}
            accessibilityLabel={b ? `${o.label}, ${b}` : o.label}
            onPress={() => {
              onChange(o.value);
            }}
            style={(state): ViewStyle => {
              return {
                minHeight: MIN_TOUCH,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: on ? color.white : "transparent",
                shadowColor: color.ink,
                shadowOpacity: on ? 0.1 : 0,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              };
            }}
          >
            <Text role="uiSemiBold" size={13.5} color={on ? color.ink : color.body}>
              {o.label}
            </Text>
            {b ? (
              <View
                style={{
                  borderRadius: radius.pill,
                  paddingHorizontal: 7,
                  paddingVertical: 1,
                  backgroundColor: color.pink300,
                }}
              >
                <Text role="uiSemiBold" size={11.5} color={color.plum950}>
                  {b}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
