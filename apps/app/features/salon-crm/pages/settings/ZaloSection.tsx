import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, useCalm } from "@gugu/design-system";
import type { ZaloConnection } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { API_URL } from "@/services/auth/config";
import { useLocale } from "@/services/i18n/useLocale";

import { useZaloConnection, useZaloMutation, zaloApi } from "../../data/zalo";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, NumberInput, SettingRow, Toggle } from "../../ui/form";

type Result = "connected" | "denied" | "failed" | "oa_in_use" | "expired" | "plan";
const RESULTS: readonly string[] = [
  "connected",
  "denied",
  "failed",
  "oa_in_use",
  "expired",
  "plan",
];
/** Indicative price of one paid consultation message (server config ZALO_PRICE_CS_PAID_VND). */
const PAID_MESSAGE_VND = 55;

const openUrl = (url: string) => {
  if (Platform.OS === "web") window.location.assign(url);
  else void Linking.openURL(url);
};

/**
 * Settings → Zalo (topic 09, X24): connect the salon's own Zalo OA, switch the booking assistant
 * and reminders, paid-message policy, ZBS template ids, monthly cap, and this month's usage.
 */
export function ZaloSection({
  canManage,
  result,
}: {
  canManage: boolean;
  result?: string | undefined;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const connection = useZaloConnection();
  const data = connection.data;
  return (
    <CalmCard style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("panel.settingsTitle")}
        </Text>
        {data ? <StatusPill status={data.status} /> : null}
      </View>
      <Text size={13} color={c.body}>
        {t("panel.intro")}
      </Text>
      {result && RESULTS.includes(result) ? (
        <Text size={13} color={result === "connected" ? c.up.text : c.down.text}>
          {t(`panel.result.${result as Result}`)}
        </Text>
      ) : null}
      {data ? <ZaloSettings data={data} canManage={canManage} /> : null}
    </CalmCard>
  );
}

function StatusPill({ status }: { status: ZaloConnection["status"] }) {
  const { t } = useTranslation("zalo");
  const tone = status === "connected" ? "up" : status === "needs_reauth" ? "down" : "neutral";
  return <Pill label={t(`panel.status.${status}`)} tone={tone} />;
}

function ZaloSettings({ data, canManage }: { data: ZaloConnection; canManage: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  const errorText = useErrorText();
  const start = useZaloMutation(zaloApi.start);
  const disconnect = useZaloMutation(zaloApi.disconnect);
  const save = useZaloMutation(zaloApi.updateSettings);
  const [confirming, setConfirming] = useState(false);
  type Form = {
    botEnabled: boolean;
    reminder24h: boolean;
    reminder2h: boolean;
    allowPaidMessages: boolean;
    monthlyTemplateCap: number | null;
    templateIds: ZaloConnection["templateIds"];
  };
  const [form, setForm] = useState<Form>({
    botEnabled: data.botEnabled,
    reminder24h: data.reminder24h,
    reminder2h: data.reminder2h,
    allowPaidMessages: data.allowPaidMessages,
    monthlyTemplateCap: data.monthlyTemplateCap,
    templateIds: data.templateIds,
  });
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<Form>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...p }));
  };
  const live = data.status === "connected" || data.status === "needs_reauth";
  const connect = () => {
    start.mutate(locale, {
      onSuccess: (r) => {
        openUrl(r.authorizeUrl);
      },
    });
  };
  const u = data.usage;
  const oaLabel = [data.oaName, data.oaId].filter(Boolean).join(" · ");
  return (
    <View style={{ gap: 10 }}>
      {data.mode !== "http" ? (
        <Text size={12} color={c.muted}>
          {data.mode === "emulated" ? t("panel.modeEmulated") : t("panel.modeDisabled")}
        </Text>
      ) : null}
      <ErrorBanner text={errorText(start.error ?? disconnect.error ?? save.error)} />
      {live ? (
        <Text role="uiMedium" size={14} color={c.ink}>
          {oaLabel}
        </Text>
      ) : null}
      {canManage ? (
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {data.status !== "connected" ? (
            <CalmButton
              testID="zalo-connect"
              icon="link"
              label={data.status === "needs_reauth" ? t("panel.reconnect") : t("panel.connect")}
              onPress={connect}
            />
          ) : null}
          {live ? (
            <CalmButton
              testID="zalo-disconnect"
              variant="secondary"
              label={t("panel.disconnect")}
              onPress={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setConfirming(false);
                disconnect.mutate(undefined);
              }}
            />
          ) : null}
          {data.mode === "emulated" ? (
            <CalmButton
              variant="ghost"
              label={t("panel.openEmulator")}
              onPress={() => {
                openUrl(
                  `${API_URL}/api/v1/dev/zalo-emulator?oa=${encodeURIComponent(data.oaId ?? "")}`,
                );
              }}
            />
          ) : null}
        </View>
      ) : (
        <Text size={12} color={c.muted}>
          {t("panel.ownerOnly")}
        </Text>
      )}
      {confirming ? (
        <Text size={12} color={c.attention}>
          {t("panel.disconnectConfirm")}
        </Text>
      ) : null}

      {live ? (
        <>
          <SettingRow title={t("panel.bot")} body={t("panel.botHint")}>
            <Toggle
              testID="zalo-bot-toggle"
              value={form.botEnabled}
              label={t("panel.bot")}
              onChange={(v) => {
                if (canManage) set({ botEnabled: v });
              }}
            />
          </SettingRow>
          <SettingRow title={t("panel.reminder24h")}>
            <Toggle
              value={form.reminder24h}
              label={t("panel.reminder24h")}
              onChange={(v) => {
                if (canManage) set({ reminder24h: v });
              }}
            />
          </SettingRow>
          <SettingRow title={t("panel.reminder2h")}>
            <Toggle
              value={form.reminder2h}
              label={t("panel.reminder2h")}
              onChange={(v) => {
                if (canManage) set({ reminder2h: v });
              }}
            />
          </SettingRow>
          <SettingRow
            title={t("panel.paid")}
            body={t("panel.paidHint", { price: formatVND(PAID_MESSAGE_VND, locale) })}
          >
            <Toggle
              value={form.allowPaidMessages}
              label={t("panel.paid")}
              onChange={(v) => {
                if (canManage) set({ allowPaidMessages: v });
              }}
            />
          </SettingRow>
          <Text role="uiMedium" size={14} color={c.ink}>
            {t("panel.templates")}
          </Text>
          <Text size={12} color={c.muted}>
            {t("panel.templatesHint")}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <Field label={t("panel.templateConfirmation")} flex={1}>
              <Input
                label={t("panel.templateConfirmation")}
                value={form.templateIds.booking_confirmation ?? ""}
                onChangeText={(v) => {
                  set({
                    templateIds: {
                      ...form.templateIds,
                      booking_confirmation: v.trim() || undefined,
                    },
                  });
                }}
              />
            </Field>
            <Field label={t("panel.templateReminder")} flex={1}>
              <Input
                label={t("panel.templateReminder")}
                value={form.templateIds.booking_reminder ?? ""}
                onChangeText={(v) => {
                  set({
                    templateIds: { ...form.templateIds, booking_reminder: v.trim() || undefined },
                  });
                }}
              />
            </Field>
          </View>
          <SettingRow
            title={t("panel.cap")}
            body={t("panel.capHint", {
              limit: u.templateLimit === null ? t("panel.unlimited") : String(u.templateLimit),
            })}
          >
            <NumberInput
              label={t("panel.cap")}
              value={form.monthlyTemplateCap}
              onChange={(v) => {
                set({ monthlyTemplateCap: v });
              }}
            />
          </SettingRow>
          {canManage ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <CalmButton
                testID="zalo-save"
                label={t("panel.save")}
                onPress={() => {
                  save.mutate(form, {
                    onSuccess: () => {
                      setSaved(true);
                    },
                  });
                }}
              />
              {saved ? (
                <Text size={13} color={c.up.text}>
                  {t("panel.saved")}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: 6, paddingTop: 6 }}>
            <Text role="uiMedium" size={14} color={c.ink}>
              {t("panel.usage", { month: u.month })}
            </Text>
            <View style={{ flexDirection: "row", gap: 18, flexWrap: "wrap" }}>
              <Stat label={t("panel.usageTemplates")} value={String(u.templatesSent)} />
              <Stat label={t("panel.usagePaid")} value={String(u.paidMessagesSent)} />
              <Stat label={t("panel.usageFree")} value={String(u.freeMessagesSent)} />
              <Stat label={t("panel.usageRejected")} value={String(u.rejected)} />
              <Stat label={t("panel.usageCost")} value={formatVND(u.costEstimateVnd, locale)} />
            </View>
            <Text size={12} color={c.muted}>
              {t("panel.costNote")}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 2 }}>
      <Text size={12} color={c.muted}>
        {label}
      </Text>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {value}
      </Text>
    </View>
  );
}
