import { useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text, alpha, color, font, useCalm } from "@gugu/design-system";

import { useBreakpoint } from "../shell/useBreakpoint";

/** Label + control + hint/error (calm forms, 07 §3.11). */
export function Field({
  label,
  hint,
  error,
  children,
  flex,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  children: ReactNode;
  flex?: number | undefined;
}) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 6, flex, minWidth: flex ? 120 : undefined }}>
      <Text role="uiMedium" size={13} color={c.body}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text size={12} color={c.attention}>
          {error}
        </Text>
      ) : hint ? (
        <Text size={12} color={c.muted}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Input({
  value,
  onChangeText,
  label,
  placeholder,
  keyboardType,
  multiline,
  invalid,
  testID,
  width,
}: {
  value: string;
  onChangeText: (v: string) => void;
  label: string;
  placeholder?: string | undefined;
  keyboardType?: KeyboardTypeOptions | undefined;
  multiline?: boolean | undefined;
  invalid?: boolean | undefined;
  testID?: string | undefined;
  width?: number | undefined;
}) {
  const { c } = useCalm();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      keyboardType={keyboardType}
      multiline={multiline}
      style={{
        minHeight: multiline ? 88 : 42,
        width,
        paddingHorizontal: 12,
        paddingVertical: multiline ? 10 : 0,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: invalid ? c.attention : c.line,
        backgroundColor: c.surface,
        color: c.ink,
        fontFamily: font.ui,
        fontSize: 15,
        textAlignVertical: multiline ? "top" : "center",
      }}
    />
  );
}

/** VND amount: digits only in the field, integer out (đồng has no minor unit). */
export function MoneyInput({
  value,
  onChange,
  label,
  testID,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  testID?: string | undefined;
}) {
  return (
    <Input
      testID={testID}
      label={label}
      value={value === null ? "" : String(value)}
      keyboardType="number-pad"
      onChangeText={(s) => {
        const digits = s.replace(/\D/g, "").slice(0, 10);
        onChange(digits === "" ? null : Number(digits));
      }}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  label,
  width = 96,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  width?: number | undefined;
}) {
  return (
    <Input
      label={label}
      width={width}
      value={value === null ? "" : String(value)}
      keyboardType="number-pad"
      onChangeText={(s) => {
        const digits = s.replace(/\D/g, "").slice(0, 5);
        onChange(digits === "" ? null : Number(digits));
      }}
    />
  );
}

export const isClock = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** "HH:MM" (24 h, salon wall clock). "9" → "09:00", "930" → "09:30" on blur-free typing. */
export function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Input
      label={label}
      width={76}
      value={value}
      invalid={value !== "" && !isClock(value)}
      placeholder="09:00"
      keyboardType="numbers-and-punctuation"
      onChangeText={(s) => {
        const d = s.replace(/[^\d:]/g, "").slice(0, 5);
        onChange(/^\d{3,4}$/.test(d) ? `${d.slice(0, -2).padStart(2, "0")}:${d.slice(-2)}` : d);
      }}
    />
  );
}

export function Toggle({
  value,
  onChange,
  label,
  testID,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        onChange(!value);
      }}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        padding: 3,
        backgroundColor: value ? c.accentBg : c.surfaceMuted,
        borderWidth: 1,
        borderColor: value ? c.accentBg : c.line,
        alignItems: value ? "flex-end" : "flex-start",
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: value ? c.onAccent : c.muted,
        }}
      />
    </Pressable>
  );
}

/** Row with a label on the left and a control on the right. */
export function SettingRow({
  title,
  body,
  children,
}: {
  title: string;
  body?: string | undefined;
  children: ReactNode;
}) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text role="uiMedium" size={14} color={c.ink}>
          {title}
        </Text>
        {body ? (
          <Text size={12} color={c.muted}>
            {body}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { c } = useCalm();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              onChange(o.id);
            }}
            style={{
              height: 36,
              paddingHorizontal: 12,
              borderRadius: 10,
              justifyContent: "center",
              borderWidth: 1,
              borderColor: on ? c.accentBg : c.line,
              backgroundColor: on ? c.accentSoft : c.surface,
            }}
          >
            <Text role={on ? "uiSemiBold" : "ui"} size={13} color={on ? c.accent : c.ink}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Minimal select: a field that opens a list sheet. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder,
  testID,
}: {
  value: T | null;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  placeholder: string;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          setOpen(true);
        }}
        style={{
          height: 42,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.surface,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text size={15} color={current ? c.ink : c.muted} numberOfLines={1} style={{ flex: 1 }}>
          {current?.label ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={16} color={c.body} />
      </Pressable>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={label}
      >
        {options.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: o.id === value }}
            onPress={() => {
              onChange(o.id);
              setOpen(false);
            }}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: o.id === value ? c.accentSoft : "transparent",
            }}
          >
            <Text size={15} color={c.ink}>
              {o.label}
            </Text>
            {o.id === value ? <Icon name="check" size={16} color={c.accent} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

/**
 * Editor container: right side panel on tablet/desktop, bottom sheet on phones. One sheet at a time
 * (no modal stacking, 07 §3.11); the footer holds the actions.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string | undefined;
}) {
  const { c } = useCalm();
  const bp = useBreakpoint();
  const insets = useSafeAreaInsets();
  const mobile = bp === "mobile";
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel ?? title}
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: alpha(color.plum950, 0.45),
          }}
        />
        <View
          style={{
            backgroundColor: c.canvas,
            width: mobile ? "100%" : 520,
            maxWidth: "100%",
            marginTop: mobile ? 48 : 0,
            alignSelf: mobile ? "flex-end" : "stretch",
            height: mobile ? "92%" : "100%",
            borderTopLeftRadius: mobile ? 24 : 0,
            borderTopRightRadius: mobile ? 24 : 0,
            borderLeftWidth: mobile ? 0 : 1,
            borderColor: c.line,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: mobile ? 16 : 22 + insets.top,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <Text role="uiSemiBold" size={18} color={c.ink} style={{ flex: 1 }}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel ?? title}
              onPress={onClose}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="close" size={20} color={c.body} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                padding: 16,
                paddingBottom: 16 + insets.bottom,
                borderTopWidth: 1,
                borderTopColor: c.line,
                backgroundColor: c.surface,
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** Inline error banner for failed saves (problem+json code → translated text). */
export function ErrorBanner({ text }: { text: string | null }) {
  const { c } = useCalm();
  if (!text) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 12,
        borderRadius: 12,
        backgroundColor: c.down.bg,
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      <Text size={13} color={c.down.text}>
        {text}
      </Text>
    </View>
  );
}
