import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Icon, Pill, Text, useCalm, type PillTone } from "@gugu/design-system";
import type { BookingMessage, BookingMessageStatus } from "@gugu/contracts";
import { formatDateTimeShort } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useBookingMessages } from "./data";

const TONE: Record<BookingMessageStatus, PillTone> = {
  queued: "brand",
  sent: "accent",
  failed: "down",
  rejected: "down",
};

/**
 * "Messages sent" timeline in the booking drawer (topic 11): the Zalo messages the salon's OA sent
 * to the customer about this booking — the only channel to customers, GuGu never emails them
 * (X26) — with status and the reason when Zalo did not deliver. When the OA cannot reach the
 * customer, a line says so, so staff know to call. No addresses or message content (the API does
 * not return them).
 */
export function BookingMessages({ bookingId, tz }: { bookingId: string; tz: string }) {
  const { c } = useCalm();
  const { t, i18n } = useTranslation("notifications");
  const locale = useLocale();
  const q = useBookingMessages(bookingId);
  const kindLabel = (m: BookingMessage) => {
    const k = `notifications:panel.messages.kinds.${m.kind}`;
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
      {q.data && q.data.items.length === 0 && q.data.zaloReach === "reachable" ? (
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
            <Icon name="chat" size={16} color={c.body} />
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
            </View>
            <Text size={12} color={c.muted}>
              {m.sentAt
                ? t("panel.messages.sentAt", { when: at(m.sentAt) })
                : t("panel.messages.createdAt", { when: at(m.createdAt) })}
              {m.reason ? ` · ${reasonLabel(m.reason)}` : ""}
            </Text>
          </View>
        </View>
      ))}
      {q.data && q.data.zaloReach !== "reachable" ? (
        <Text testID="crm-booking-messages-unreachable" size={12} color={c.muted}>
          {t(`panel.messages.reach.${q.data.zaloReach}`)}
        </Text>
      ) : null}
    </View>
  );
}
