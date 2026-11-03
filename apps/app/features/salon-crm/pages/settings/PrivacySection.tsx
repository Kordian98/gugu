import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, useCalm, type PillTone } from "@gugu/design-system";
import type { SalonExport } from "@gugu/contracts";
import { formatDateTimeShort } from "@gugu/localization";

import { saveTextFile } from "@/services/files/share";
import { useLocale } from "@/services/i18n/useLocale";

import { useDownloadSalonExport, useRequestSalonExport, useSalonExports } from "../../data/privacy";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner } from "../../ui/form";

const FORMATS = ["json", "csv"] as const;

const TONE: Record<SalonExport["status"], PillTone> = {
  queued: "neutral",
  running: "accent",
  ready: "up",
  failed: "down",
  expired: "neutral",
};

/**
 * Settings → Data and privacy, owner only (`customers.export`; topic 05 step 8): salon-wide client
 * data export built in the background and downloadable here only, for 24 hours; retention notes.
 */
export function PrivacySection() {
  const { c } = useCalm();
  const { t } = useTranslation("privacy");
  const locale = useLocale();
  const errorText = useErrorText();
  const list = useSalonExports(true);
  const request = useRequestSalonExport();
  const download = useDownloadSalonExport();
  const items = list.data?.items ?? [];
  const busy = items.some((e) => e.status === "queued" || e.status === "running");

  return (
    <CalmCard testID="crm-settings-privacy" style={{ gap: 12 }}>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {t("salon.title")}
      </Text>
      <Text size={13} color={c.body}>
        {t("salon.body")}
      </Text>
      <ErrorBanner text={errorText(request.error ?? download.error)} />
      <View style={{ flexDirection: "row" }}>
        <CalmButton
          testID="crm-privacy-export"
          size="sm"
          icon="upload"
          label={t("salon.request")}
          variant={busy ? "secondary" : "primary"}
          onPress={() => {
            if (!busy) request.mutate();
          }}
        />
      </View>
      {busy ? (
        <Text size={12} color={c.muted}>
          {t("salon.requested")}
        </Text>
      ) : null}
      {items.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("salon.empty")}
        </Text>
      ) : (
        items.map((e) => (
          <View
            key={e.id}
            testID={`crm-privacy-export-${e.status}`}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              paddingVertical: 6,
              borderTopWidth: 1,
              borderTopColor: c.line,
            }}
          >
            <Text size={13} color={c.ink} style={{ minWidth: 110 }}>
              {formatDateTimeShort(new Date(e.createdAt), locale)}
            </Text>
            <Pill label={t(`salon.status.${e.status}`)} tone={TONE[e.status]} />
            {e.clients !== null && e.bookings !== null ? (
              <Text size={12} color={c.muted}>
                {t("salon.meta", { clients: e.clients, bookings: e.bookings })}
              </Text>
            ) : null}
            {e.status === "ready" && e.expiresAt ? (
              <>
                <Text size={12} color={c.muted}>
                  {t("salon.expires", { at: formatDateTimeShort(new Date(e.expiresAt), locale) })}
                </Text>
                {FORMATS.map((format) => (
                  <CalmButton
                    key={format}
                    testID={`crm-privacy-download-${format}`}
                    size="sm"
                    variant="secondary"
                    label={t(format === "json" ? "salon.downloadJson" : "salon.downloadCsv")}
                    onPress={() => {
                      download.mutate(
                        { id: e.id, format },
                        {
                          onSuccess: (f) => {
                            void saveTextFile(f.fileName, f.mimeType, f.content);
                          },
                        },
                      );
                    }}
                  />
                ))}
              </>
            ) : null}
          </View>
        ))
      )}
      <View style={{ gap: 4, paddingTop: 4 }}>
        <Text role="uiSemiBold" size={13} color={c.ink}>
          {t("salon.retentionTitle")}
        </Text>
        <Text size={12} color={c.muted}>
          {t("salon.retention")}
        </Text>
        <Text size={12} color={c.muted}>
          {t("salon.disclaimer")}
        </Text>
      </View>
    </CalmCard>
  );
}
