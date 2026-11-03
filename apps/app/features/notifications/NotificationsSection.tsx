import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, checkableA11y, Pill, Text, useCalm } from "@gugu/design-system";
import {
  MAX_REMINDER_OFFSETS,
  type NotificationEventSetting,
  type NotificationSettings,
} from "@gugu/contracts";

import { useErrorText } from "@/features/salon-crm/ui/errors";
import { ErrorBanner, Field, Input, Toggle } from "@/features/salon-crm/ui/form";

import { eventKey, useNotificationSettings, useSaveNotificationSettings } from "./data";
import { OFFSET_CHOICES, offsetLabel } from "./offsets";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Settings → Notifications (topic 11): customer emails (fallback after Zalo) per event, reminder
 * offsets, reply-to address; team bell + email per event. Owner/manager edit
 * (`salon.settings.write`); everyone else sees it read-only. The API validates everything again.
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
  const [offsets, setOffsets] = useState<number[]>(initial.reminderOffsetsMinutes);
  const [replyTo, setReplyTo] = useState(initial.replyToEmail ?? "");
  const [saved, setSaved] = useState(false);
  const replyInvalid = replyTo.trim() !== "" && !EMAIL_RE.test(replyTo.trim());

  const setEvent = (event: string, patch: Partial<NotificationEventSetting>) => {
    if (!canEdit) return;
    setSaved(false);
    setEvents((list) => list.map((e) => (e.event === event ? { ...e, ...patch } : e)));
  };
  const toggleOffset = (m: number) => {
    if (!canEdit) return;
    setSaved(false);
    setOffsets((list) =>
      list.includes(m)
        ? list.filter((x) => x !== m)
        : list.length >= MAX_REMINDER_OFFSETS
          ? list
          : [...list, m].sort((a, b) => b - a),
    );
  };
  const eventLabel = (event: string): string => t(`panel.events.${eventKey(event)}` as never);
  const customers = events.filter((e) => e.audience === "customer");
  const team = events.filter((e) => e.audience === "team");
  const remindersOn = customers.find((e) => e.event === "booking.reminder")?.email ?? false;

  return (
    <CalmCard style={{ gap: 12 }}>
      <View testID="crm-notifications-settings" style={{ gap: 6 }}>
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("panel.settings.title")}
        </Text>
        <Text size={13} color={c.body}>
          {t("panel.settings.intro")}
        </Text>
        <Pill
          tone={initial.zaloConnected ? "accent" : "neutral"}
          label={
            initial.zaloConnected
              ? t("panel.settings.zaloConnected")
              : t("panel.settings.zaloNotConnected")
          }
        />
        {canEdit ? null : (
          <Text size={12} color={c.muted}>
            {t("panel.settings.readOnly")}
          </Text>
        )}
      </View>
      <ErrorBanner text={errorText(save.error)} />

      <Heading label={t("panel.settings.customers")} columns={[t("panel.settings.email")]} />
      {customers.map((e) => (
        <EventRow
          key={e.event}
          label={eventLabel(e.event)}
          toggles={[
            {
              id: `crm-notify-${eventKey(e.event)}-email`,
              label: `${eventLabel(e.event)} · ${t("panel.settings.email")}`,
              value: e.email,
              onChange: (v) => {
                setEvent(e.event, { email: v });
              },
            },
          ]}
        />
      ))}

      <View style={{ gap: 8, opacity: remindersOn ? 1 : 0.5 }}>
        <Text role="uiMedium" size={14} color={c.ink}>
          {t("panel.settings.reminders")}
        </Text>
        <Text size={12} color={c.muted}>
          {offsets.length >= MAX_REMINDER_OFFSETS
            ? t("panel.settings.remindersMax")
            : t("panel.settings.remindersHint")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {OFFSET_CHOICES.map((m) => {
            const on = offsets.includes(m);
            return (
              <Pressable
                key={m}
                testID={`crm-notify-offset-${String(m)}`}
                {...checkableA11y("checkbox", on, { disabled: !canEdit })}
                accessibilityLabel={offsetLabel(m, t)}
                onPress={() => {
                  toggleOffset(m);
                }}
                style={{
                  paddingHorizontal: 12,
                  height: 34,
                  borderRadius: 10,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: on ? c.accentBg : c.line,
                  backgroundColor: on ? c.accentSoft : c.surface,
                }}
              >
                <Text role={on ? "uiSemiBold" : "ui"} size={13} color={on ? c.accent : c.ink}>
                  {offsetLabel(m, t)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field
        label={t("panel.settings.replyTo")}
        hint={t("panel.settings.replyToHint")}
        error={replyInvalid ? t("panel.settings.replyToInvalid") : null}
      >
        <Input
          testID="crm-notify-reply-to"
          label={t("panel.settings.replyTo")}
          keyboardType="email-address"
          value={replyTo}
          invalid={replyInvalid}
          onChangeText={(v) => {
            if (!canEdit) return;
            setSaved(false);
            setReplyTo(v);
          }}
        />
      </Field>

      <Heading
        label={t("panel.settings.team")}
        columns={[t("panel.settings.inApp"), t("panel.settings.email")]}
      />
      {team.map((e) => {
        const label = eventLabel(e.event);
        return (
          <EventRow
            key={e.event}
            label={label}
            toggles={[
              {
                id: `crm-notify-${eventKey(e.event)}-inapp`,
                label: `${label} · ${t("panel.settings.inApp")}`,
                value: e.inApp ?? false,
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
              if (replyInvalid) return;
              setSaved(false);
              save.mutate(
                {
                  events: events.map((e) => ({
                    event: e.event,
                    email: e.email,
                    ...(e.inApp === null ? {} : { inApp: e.inApp }),
                  })),
                  reminderOffsetsMinutes: offsets,
                  replyToEmail: replyTo.trim() || null,
                },
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
