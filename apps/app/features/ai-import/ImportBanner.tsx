import { ActivityIndicator, View } from "react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";
import type { AiImportStatus } from "@gugu/contracts";

import { useBreakpoint } from "../salon-crm/shell/useBreakpoint";
import { ErrorBanner } from "../salon-crm/ui/form";

/** Entry banner: invites the upload, explains why it is unavailable, or confirms what was added. */
export function ImportBanner({
  status,
  loading,
  highlight,
  created,
  pickFailed,
  onPick,
}: {
  status: AiImportStatus | undefined;
  loading: boolean;
  highlight: boolean;
  created: number | null;
  pickFailed: boolean;
  onPick: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const mobile = useBreakpoint() === "mobile";
  const available = status?.configured === true && status.entitled;
  const emphasis = highlight && available;
  const body = loading ? null : bodyText(status, created, t);
  return (
    <View
      testID="crm-ai-import"
      style={{
        flexDirection: mobile ? "column" : "row",
        alignItems: mobile ? "flex-start" : "center",
        gap: 14,
        padding: 16,
        borderRadius: 16,
        borderWidth: emphasis ? 1.5 : 1,
        borderStyle: emphasis ? "dashed" : "solid",
        borderColor: emphasis ? c.accentBg : c.line,
        backgroundColor: c.accentSoft,
      }}
    >
      <Icon name={created !== null ? "check" : "sparkles"} size={22} color={c.accent} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text role="uiSemiBold" size={15} color={c.ink}>
          {t("setup.title")}
        </Text>
        {body ? (
          <Text size={13} color={c.body}>
            {body}
          </Text>
        ) : (
          <ActivityIndicator color={c.accent} style={{ alignSelf: "flex-start" }} />
        )}
        {available ? (
          <Text size={12} color={c.muted}>
            {t("setup.privacy")}
          </Text>
        ) : null}
        <ErrorBanner text={pickFailed ? t("aiImport.pickFailed") : null} />
      </View>
      {available ? (
        <CalmButton
          testID="ai-import-pick"
          icon="upload"
          label={t("aiImport.cta")}
          onPress={onPick}
        />
      ) : null}
    </View>
  );
}

function bodyText(
  status: AiImportStatus | undefined,
  created: number | null,
  t: TFunction<"crm">,
): string {
  if (status?.configured === false) return t("aiImport.notConfigured");
  if (status?.entitled === false) return t("aiImport.notEntitled");
  if (created !== null) return t("aiImport.done", { count: String(created) });
  return t("setup.body");
}
