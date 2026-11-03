import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, useCalm } from "@gugu/design-system";
import type { NotificationEventSetting, NotificationSettings } from "@gugu/contracts";

import { useErrorText } from "@/features/salon-crm/ui/errors";
import { ErrorBanner, Toggle } from "@/features/salon-crm/ui/form";

import { eventKey, useNotificationSettings, useSaveNotificationSettings } from "./data";

/**
 * Settings → Notifications (topic 11). Only what is real:
 * - customers: read-only summary of what the salon's Zalo OA sends (module `zalo`; reminders are
 *   switched in Settings → Zalo). GuGu never emails customers (X26), so there is nothing to set;
 * - team: bell + email copy per event. Owner/manager edit (`salon.settings.write`); everyone else
 *   sees it read-only. The API validates everything again.
 */
export function NotificationsSection({ canEdit }: { canEdit: boolean }) {
  const { c } = useCalm();
  const settings = useNotificationSettings();
  if (!settings.data) {
    return settings.isPending ? <ActivityIndicator color={c.accent} /> : null;
  }
  return <Editor key={settings.dataUpdatedAt} initial={settings.data} canEdit={canEdit} />;
}

function Editor({ initial, canEdit }: { initial: NotificationSettings; canEdit: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("notifications");
  const { t: tc } = useTranslation("crm");
  const errorText = useErrorText();
  const save = useSaveNotificationSettings();
  const [events, setEvents] = useState<NotificationEventSetting[]>(initial.events);
  const [saved, setSaved] = useState(false);
  const zalo = initial.zalo;

  const setEvent = (event: string, patch: Partial<NotificationEventSetting>) => {
    if (!canEdit) return;
    setSaved(false);
    setEvents((list) => list.map((e) => (e.event === event ? { ...e, ...patch } : e)));
  };
  const eventLabel = (event: string): string => t(`panel.events.${eventKey(event)}` as never);

  return (
    <CalmCard style={{ gap: 12 }}>
      <View testID="crm-notifications-settings" style={{ gap: 6 }}>
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("panel.settings.title")}
        </Text>
        <Text size={13} color={c.body}>
          {t("panel.settings.intro")}
        </Text>
        {canEdit ? null : (
          <Text size={12} color={c.muted}>
            {t("panel.settings.readOnly")}
          </Text>
        )}
      </View>
      <ErrorBanner text={errorText(save.error)} />

      <View testID="crm-notify-customers" style={{ gap: 8 }}>
        <Text role="uiSemiBold" size={14} color={c.ink} style={{ marginTop: 8 }}>
          {t("panel.settings.customers")}
        </Text>
        <Text size={13} color={c.body}>
          {zalo.connected
            ? t("panel.settings.zaloConnected")
            : t("panel.settings.zaloNotConnected")}
        </Text>
        {zalo.connected ? (
          <>
            <ZaloRow label={t("panel.settings.reminder24h")} on={zalo.reminder24h} />
            <ZaloRow label={t("panel.settings.reminder2h")} on={zalo.reminder2h} />
            <Text size={12} color={c.muted}>
              {t("panel.settings.zaloHint")}
            </Text>
          </>
        ) : null}
      </View>

      <Heading
        label={t("panel.settings.team")}
        columns={[t("panel.settings.inApp"), t("panel.settings.email")]}
      />
      {events.map((e) => {
        const label = eventLabel(e.event);
        return (
          <EventRow
            key={e.event}
            label={label}
            toggles={[
              {
                id: `crm-notify-${eventKey(e.event)}-inapp`,
                label: `${label} · ${t("panel.settings.inApp")}`,
                value: e.inApp,
                onChange: (v) => {
                  setEvent(e.event, { inApp: v });
                },
              },
              {
                id: `crm-notify-${eventKey(e.event)}-email`,
                label: `${label} · ${t("panel.settings.email")}`,
                value: e.email,
                onChange: (v) => {
                  setEvent(e.event, { email: v });
                },
              },
            ]}
          />
        );
      })}

      {canEdit ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 8,
          }}
        >
          {saved ? (
            <Text size={13} color={c.accent}>
              {tc("common.saved")}
            </Text>
          ) : null}
          <CalmButton
            testID="crm-notify-save"
            label={save.isPending ? tc("common.saving") : tc("common.save")}
            onPress={() => {
              setSaved(false);
              save.mutate(
                { events: events.map((e) => ({ event: e.event, email: e.email, inApp: e.inApp })) },
                {
                  onSuccess: () => {
                    setSaved(true);
                  },
                },
              );
            }}
          />
        </View>
      ) : null}
    </CalmCard>
  );
}

/** Read-only state of one Zalo reminder (edited in Settings → Zalo). */
function ZaloRow({ label, on }: { label: string; on: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("notifications");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      <Text size={14} color={c.ink} style={{ flex: 1 }}>
        {label}
      </Text>
      <Pill
        tone={on ? "accent" : "neutral"}
        label={on ? t("panel.settings.on") : t("panel.settings.off")}
      />
    </View>
  );
}

const COLUMN = 64;

function Heading({ label, columns }: { label: string; columns: string[] }) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
      <Text role="uiSemiBold" size={14} color={c.ink} style={{ flex: 1 }}>
        {label}
      </Text>
      {columns.map((col) => (
        <Text
          key={col}
          role="uiMedium"
          size={12}
          color={c.muted}
          style={{ width: COLUMN, textAlign: "center" }}
        >
          {col}
        </Text>
      ))}
    </View>
  );
}

function EventRow({
  label,
  toggles,
}: {
  label: string;
  toggles: { id: string; label: string; value: boolean; onChange: (v: boolean) => void }[];
}) {
  const { c } = useCalm();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      <Text size={14} color={c.ink} style={{ flex: 1 }}>
        {label}
      </Text>
      {toggles.map((tg) => (
        <View key={tg.id} style={{ width: COLUMN, alignItems: "center" }}>
          <Toggle testID={tg.id} label={tg.label} value={tg.value} onChange={tg.onChange} />
        </View>
      ))}
    </View>
  );
}
