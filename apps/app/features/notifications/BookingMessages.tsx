import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon, Pill, Text, useCalm, type IconName, type PillTone } from "@gugu/design-system";
import type { BookingMessage, BookingMessageStatus } from "@gugu/contracts";
import { formatDateTimeShort } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { eventKey, useBookingMessages } from "./data";
import { offsetLabel } from "./offsets";

const TONE: Record<BookingMessageStatus, PillTone> = {
  scheduled: "neutral",
  queued: "brand",
  sent: "accent",
  delivered: "accent",
  failed: "down",
  skipped: "neutral",
  rejected: "down",
};

const ICON: Record<BookingMessage["channel"], IconName> = {
  email: "mail",
  zalo_template: "chat",
  zalo_chat: "chat",
};

/**
 * "Messages sent" timeline in the booking drawer (topic 11): every Zalo and email message to the
 * customer about this booking, with status and the reason when something was not sent. No
 * addresses or message content (the API does not return them).
 */
export function BookingMessages({ bookingId, tz }: { bookingId: string; tz: string }) {
  const { c } = useCalm();
  const { t, i18n } = useTranslation("notifications");
  const locale = useLocale();
  const q = useBookingMessages(bookingId);
  const kindLabel = (m: BookingMessage) => {
    if (m.kind === "booking.reminder" && m.offsetMinutes !== null) {
      return t("panel.messages.reminder", { offset: offsetLabel(m.offsetMinutes, t) });
    }
    const k = `notifications:panel.messages.kinds.${eventKey(m.kind)}`;
    return i18n.exists(k) ? t(k as never) : t("panel.messages.kinds.other");
  };
  const reasonLabel = (r: string) => {
    const k = `notifications:panel.messages.reasons.${r}`;
    return i18n.exists(k) ? t(k as never) : t("panel.messages.reasons.other");
  };
  const at = (iso: string) => formatDateTimeShort(new Date(iso), locale, tz);

  return (
    <View testID="crm-booking-messages" style={{ gap: 8 }}>
      <Text role="uiSemiBold" size={14} color={c.ink}>
        {t("panel.messages.title")}
      </Text>
      {q.isPending ? <ActivityIndicator color={c.accent} /> : null}
      {q.data && q.data.items.length === 0 ? (
        <Text size={13} color={c.muted}>
          {t("panel.messages.empty")}
        </Text>
      ) : null}
      {q.data?.items.map((m) => (
        <View
          key={m.id}
          testID="crm-booking-message"
          style={{
            flexDirection: "row",
            gap: 10,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          <View style={{ paddingTop: 2 }}>
            <Icon name={ICON[m.channel]} size={16} color={c.body} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <Text role="uiMedium" size={14} color={c.ink}>
                {kindLabel(m)}
              </Text>
              <Pill size={11} label={t(`panel.messages.channels.${m.channel}`)} />
              <Pill
                size={11}
                tone={TONE[m.status]}
                label={t(`panel.messages.status.${m.status}`)}
              />
              {m.fallback ? (
                <Pill size={11} tone="brand" label={t("panel.messages.fallback")} />
              ) : null}
            </View>
            <Text size={12} color={c.muted}>
              {m.sentAt
                ? t("panel.messages.sentAt", { when: at(m.sentAt) })
                : m.scheduledFor && (m.status === "scheduled" || m.status === "queued")
                  ? t("panel.messages.scheduledFor", { when: at(m.scheduledFor) })
                  : t("panel.messages.createdAt", { when: at(m.createdAt) })}
              {m.reason ? ` · ${reasonLabel(m.reason)}` : ""}
            </Text>
          </View>
        </View>
      ))}
      {q.data && !q.data.hasEmail ? (
        <Text size={12} color={c.muted}>
          {t("panel.messages.noEmail")}
        </Text>
      ) : null}
    </View>
  );
}
