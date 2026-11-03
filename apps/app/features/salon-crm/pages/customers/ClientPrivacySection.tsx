import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Text, useCalm } from "@gugu/design-system";

import { saveTextFile } from "@/services/files/share";
import { useLocale } from "@/services/i18n/useLocale";

import { useEraseClient, useExportClient } from "../../data/privacy";
import { useErrorText } from "../../ui/errors";
import { ConfirmDialog, ErrorBanner } from "../../ui/form";

/**
 * Client card, owner only (topic 05 step 8, q80): export this client's data (JSON + readable text)
 * or delete it on the client's request. Both are audited by the API.
 */
export function ClientPrivacySection({ id, onErased }: { id: string; onErased: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("privacy");
  const { t: tc } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const exp = useExportClient();
  const erase = useEraseClient();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const data = exp.data;

  return (
    <View testID="crm-client-privacy" style={{ gap: 8 }}>
      <Text
        role="uiSemiBold"
        size={12}
        color={c.ink}
        style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
      >
        {t("client.section")}
      </Text>
      <Text size={12} color={c.muted}>
        {t("client.hint")}
      </Text>
      <ErrorBanner text={errorText(exp.error ?? erase.error)} />
      {done ? (
        <Text size={13} color={c.up.text}>
          {done}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {data ? (
          <>
            <CalmButton
              testID="crm-client-export-json"
              size="sm"
              variant="secondary"
              label={t("client.exportJson")}
              onPress={() => {
                void saveTextFile(
                  `${data.fileBaseName}.json`,
                  "application/json",
                  JSON.stringify(data.json, null, 2),
                );
              }}
            />
            <CalmButton
              testID="crm-client-export-text"
              size="sm"
              variant="secondary"
              label={t("client.exportText")}
              onPress={() => {
                void saveTextFile(`${data.fileBaseName}.txt`, "text/plain", data.text);
              }}
            />
          </>
        ) : (
          <CalmButton
            testID="crm-client-export"
            size="sm"
            variant="secondary"
            icon="upload"
            label={t("client.export")}
            onPress={() => {
              exp.mutate({ id, locale });
            }}
          />
        )}
        <CalmButton
          testID="crm-client-erase"
          size="sm"
          variant="secondary"
          icon="trash"
          label={t("client.erase")}
          onPress={() => {
            setConfirm(true);
          }}
        />
      </View>
      {data ? (
        <Text size={12} color={c.muted}>
          {t("client.exportReady")}
        </Text>
      ) : null}
      <ConfirmDialog
        testID="crm-client-erase-confirm"
        open={confirm}
        title={t("client.eraseTitle")}
        body={`${t("client.eraseBody")}\n\n${t("client.eraseHint")}`}
        confirmLabel={t("client.eraseConfirm")}
        cancelLabel={tc("common.cancel")}
        busy={erase.isPending}
        onCancel={() => {
          setConfirm(false);
        }}
        onConfirm={() => {
          erase.mutate(id, {
            onSuccess: (r) => {
              setConfirm(false);
              setDone(
                t("client.erased", {
                  bookings: r.anonymisedBookings,
                  cancelled: r.cancelledBookings,
                }),
              );
              onErased();
            },
            onError: () => {
              setConfirm(false);
            },
          });
        }}
      />
    </View>
  );
}
