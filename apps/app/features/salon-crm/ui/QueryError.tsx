import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { CalmButton, space, typeScale, Text, useCalm } from "@gugu/design-system";

/** A failed read must never masquerade as an empty salon or a zero balance. */
export function QueryError({
  onRetry,
  busy = false,
  testID = "crm-query-error",
}: {
  onRetry: () => void;
  busy?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation("crm");
  const { c } = useCalm();
  return (
    <View testID={testID} accessibilityRole="alert" style={{ gap: space[3] }}>
      <Text size={typeScale.body} color={c.ink}>
        {t("errors.loadFailed")}
      </Text>
      <CalmButton variant="secondary" label={t("common.retry")} disabled={busy} onPress={onRetry} />
    </View>
  );
}
