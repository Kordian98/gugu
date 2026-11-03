import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Text, checkableA11y, useCalm } from "@gugu/design-system";

/** One wizard step: a short title, one sentence, a time estimate, the content and the actions. */
export function StepFrame({
  title,
  body,
  eta,
  children,
  footer,
}: {
  title: string;
  body: string;
  eta?: string | undefined;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Text role="uiSemiBold" size={26} lineHeight={32} color={c.ink} testID="crm-setup-title">
          {title}
        </Text>
        <Text size={16} lineHeight={22} color={c.body}>
          {body}
        </Text>
        {eta ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="clock" size={14} color={c.muted} />
            <Text size={13} color={c.muted}>
              {eta}
            </Text>
          </View>
        ) : null}
      </View>
      {children}
      {footer}
    </View>
  );
}

/**
 * Step actions: one primary button (full width on phones) and a quiet "Skip". Every step is optional,
 * so skipping is always one tap and never a dead end.
 */
export function StepFooter({
  label,
  onPress,
  busy,
  disabled,
  onSkip,
  onBack,
  testID = "crm-setup-next",
  hint,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean | undefined;
  disabled?: boolean | undefined;
  onSkip?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
  testID?: string | undefined;
  hint?: string | null | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const inactive = Boolean(disabled) || Boolean(busy);
  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      {hint ? (
        <Text size={13} color={c.muted} style={{ textAlign: "center" }}>
          {hint}
        </Text>
      ) : null}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive, busy: Boolean(busy) }}
        disabled={inactive}
        onPress={onPress}
        style={{
          minHeight: 52,
          borderRadius: 16,
          backgroundColor: inactive ? c.surfaceMuted : c.accentBg,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 20,
        }}
      >
        {busy ? <ActivityIndicator color={c.onAccent} /> : null}
        <Text role="uiSemiBold" size={16} color={inactive ? c.muted : c.onAccent}>
          {busy ? t("setupWizard.saving") : label}
        </Text>
        {busy ? null : <Icon name="arrowRight" size={18} color={inactive ? c.muted : c.onAccent} />}
      </Pressable>
      <View style={{ flexDirection: "row", justifyContent: "space-between", minHeight: 44 }}>
        {onBack ? (
          <CalmButton
            testID="crm-setup-back"
            variant="ghost"
            icon="chevronLeft"
            label={t("setupWizard.back")}
            onPress={onBack}
          />
        ) : (
          <View />
        )}
        {onSkip ? (
          <CalmButton
            testID="crm-setup-skip"
            variant="ghost"
            label={t("setupWizard.skip")}
            onPress={onSkip}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Big friendly choice tile (business type, "just me" / "I have a team"). */
export function ChoiceTile({
  label,
  body,
  selected,
  onPress,
  art,
  testID,
  minWidth = 140,
}: {
  label: string;
  body?: string | undefined;
  selected: boolean;
  onPress: () => void;
  art?: ReactNode;
  testID?: string | undefined;
  minWidth?: number;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      {...checkableA11y("radio", selected)}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexGrow: 1,
        flexBasis: minWidth,
        minWidth,
        minHeight: 64,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.accentBg : c.line,
        backgroundColor: selected ? c.accentSoft : c.surface,
        padding: 14,
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {art}
      <Text role="uiSemiBold" size={15} color={c.ink} style={{ textAlign: "center" }}>
        {label}
      </Text>
      {body ? (
        <Text size={13} color={c.body} style={{ textAlign: "center" }}>
          {body}
        </Text>
      ) : null}
      {selected ? (
        <View style={{ position: "absolute", top: 8, right: 8 }}>
          <Icon name="check" size={16} color={c.accent} strokeWidth={2.6} />
        </View>
      ) : null}
    </Pressable>
  );
}
