import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { ADMIN_STEP_UP_MINUTES } from "@gugu/contracts";
import { CalmButton, Text, useCalm } from "@gugu/design-system";

import { ErrorBanner, Input } from "../salon-crm/ui/form";
import { useStepUp } from "./data";
import { useAdminErrorText } from "./ui";

/**
 * Inline step-up (ADR-0011): asks for the authenticator code (or a recovery code), elevates this
 * session on the API for ADMIN_STEP_UP_MINUTES, then calls `onDone` so the caller retries.
 */
export function StepUpPrompt({
  onDone,
  testID,
}: {
  onDone: () => void;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const errorText = useAdminErrorText();
  const stepUp = useStepUp();
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const code = value.replace(/\s/g, "");
  const valid = recovery ? code.length >= 10 : /^\d{6}$/.test(code);
  const submit = () => {
    if (!valid || stepUp.isPending) return;
    stepUp.mutate(recovery ? { recoveryCode: value.trim() } : { code }, {
      onSuccess: () => {
        setValue("");
        onDone();
      },
    });
  };
  return (
    <View
      testID={testID}
      style={{
        gap: 10,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <Text role="uiSemiBold" size={14} color={c.ink}>
        {t("actions.stepUpTitle")}
      </Text>
      <Text size={13} color={c.body}>
        {t("actions.stepUpBody", { minutes: ADMIN_STEP_UP_MINUTES })}
      </Text>
      <Input
        testID={testID ? `${testID}-code` : undefined}
        label={recovery ? t("security.recoveryLabel") : t("security.codeLabel")}
        value={value}
        onChangeText={setValue}
        keyboardType={recovery ? "default" : "number-pad"}
      />
      <ErrorBanner text={errorText(stepUp.error)} />
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <CalmButton
          testID={testID ? `${testID}-submit` : undefined}
          size="sm"
          label={t("actions.stepUpAction")}
          variant={valid ? "primary" : "secondary"}
          onPress={submit}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setRecovery(!recovery);
            setValue("");
          }}
        >
          <Text size={13} color={c.accent}>
            {recovery ? t("security.useTotp") : t("security.useRecovery")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
