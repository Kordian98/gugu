import { TextInput, View, type TextInputProps } from "react-native";

import { Text, color, font } from "@gugu/design-system";

type Props = Omit<TextInputProps, "style"> & {
  label: string;
  hint?: string;
  error?: string | null;
};

/**
 * Labelled text input on design tokens. TODO(design-system): promote to a shared `Input` component
 * in packages/design-system (topic 02) and replace this.
 */
export function TextField({ label, hint, error, ...input }: Props) {
  return (
    <View className="gap-1.5">
      <Text role="uiSemiBold" size={14} color={color.ink}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.muted}
        style={{
          height: 52,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: error ? color.rose500 : color.line,
          backgroundColor: color.tile,
          paddingHorizontal: 16,
          fontFamily: font.ui,
          fontSize: 16,
          color: color.ink,
        }}
        {...input}
      />
      {error ? (
        <Text size={13} color={color.rose500} style={{ fontFamily: font.uiMedium }}>
          {error}
        </Text>
      ) : hint ? (
        <Text size={13} color={color.muted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
