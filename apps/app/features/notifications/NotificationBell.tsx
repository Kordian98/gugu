import { useState } from "react";
import { Modal, Pressable, ScrollView, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Icon, MIN_TOUCH, Text, alpha, color, useCalm } from "@gugu/design-system";
import type { InboxItem } from "@gugu/contracts";
import { formatDateTimeShort } from "@gugu/localization";

import { useOptionalSalon } from "@/features/salon-crm/data/SalonContext";
import { salonDate } from "@/features/salon-crm/data/dates";
import { useCrmNav } from "@/features/salon-crm/shell/useCrmNav";
import { Toggle } from "@/features/salon-crm/ui/form";
import { useLocale } from "@/services/i18n/useLocale";

import {
  eventKey,
  useInbox,
  useMarkRead,
  useMyNotificationPrefs,
  useSaveMyNotificationPrefs,
} from "./data";

/**
 * The team member's bell (topic 11): bookings created, moved or cancelled by someone else and Zalo
 * customers waiting for a person, newest first, with an unread badge and the member's own
 * "also email me" switch. Tapping an item opens the calendar day or the Zalo conversation.
 * Desktop: dropdown under the bell. Mobile (`sheet`): full-width panel in a modal.
 */
export function NotificationBell({
  align = "right",
  iconColor,
  sheet = false,
}: {
  align?: "left" | "right";
  /** On the dark mobile header the icon uses the sidebar text colour. */
  iconColor?: string | undefined;
  /** Mobile: open as a full-width sheet in a modal (the header has no room for a dropdown). */
  sheet?: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("notifications");
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const inbox = useInbox();
  const unread = inbox.data?.unread ?? 0;
  const close = () => {
    setOpen(false);
  };
  return (
    <View>
      <Pressable
        testID="crm-bell"
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0 ? t("panel.inbox.unread", { count: unread }) : t("panel.inbox.title")
        }
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((o) => !o);
        }}
        style={{
          width: MIN_TOUCH,
          height: MIN_TOUCH,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="bell" size={20} color={iconColor ?? c.ink} />
        {unread > 0 ? (
          <View
            testID="crm-bell-badge"
            style={{
              position: "absolute",
              top: 4,
              right: 2,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 4,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.attention,
            }}
          >
            <Text role="uiSemiBold" size={11} color={c.onAccent}>
              {unread > 99 ? "99+" : String(unread)}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {open && sheet ? (
        <Modal transparent animationType="fade" onRequestClose={close}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("panel.inbox.close")}
            onPress={close}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: alpha(color.plum950, 0.45),
            }}
          />
          <Panel onClose={close} style={{ marginTop: insets.top + 56, marginHorizontal: 12 }} />
        </Modal>
      ) : null}
      {open && !sheet ? (
        <Panel onClose={close} style={{ position: "absolute", top: 46, [align]: 0, width: 320 }} />
      ) : null}
    </View>
  );
}

function Panel({ onClose, style }: { onClose: () => void; style: ViewStyle }) {
  const { c } = useCalm();
  const { t } = useTranslation("notifications");
  const inbox = useInbox();
  const markRead = useMarkRead();
  const unread = inbox.data?.unread ?? 0;
  return (
    <View
      testID="crm-bell-panel"
      style={[
        {
          maxHeight: 460,
          borderRadius: 14,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.line,
          shadowColor: c.shadow,
          shadowOpacity: 0.12,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          overflow: "hidden",
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
        }}
      >
        <Text role="uiSemiBold" size={14} color={c.ink}>
          {t("panel.inbox.title")}
        </Text>
        {unread > 0 ? (
          <Pressable
            testID="crm-bell-read-all"
            accessibilityRole="button"
            onPress={() => {
              markRead.mutate(undefined);
            }}
          >
            <Text size={13} color={c.accent}>
              {t("panel.inbox.markAllRead")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={{ maxHeight: 340 }}>
        {inbox.data?.items.length ? (
          inbox.data.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              onOpen={() => {
                onClose();
                if (!item.readAt) markRead.mutate([item.id]);
              }}
            />
          ))
        ) : (
          <Text size={13} color={c.body} style={{ padding: 14 }}>
            {t("panel.inbox.empty")}
          </Text>
        )}
      </ScrollView>
      <EmailMe />
    </View>
  );
}

function Item({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("notifications");
  const locale = useLocale();
  const tz = useOptionalSalon()?.summary?.timezone;
  const { go } = useCrmNav();
  const b = item.booking;
  const title = t(`panel.inbox.items.${eventKey(item.event)}` as never, {
    code: b?.referenceCode ?? "",
  });
  const service = b?.service ? (locale === "en" && b.service.en) || b.service.vi : null;
  const customer = b?.customerAnonymised ? t("panel.inbox.deletedCustomer") : b?.customerName;
  const detail = b
    ? [formatDateTimeShort(new Date(b.startsAt), locale, tz), service, customer, b.staffName]
        .filter(Boolean)
        .join(" · ")
    : (item.conversation?.displayName ?? "");
  return (
    <Pressable
      testID="crm-bell-item"
      accessibilityRole="button"
      onPress={() => {
        onOpen();
        if (item.conversation) go(`/business/zalo?c=${item.conversation.id}`);
        else if (b) go(`/business/calendar?date=${salonDate(new Date(b.startsAt), tz)}`);
      }}
      style={{
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
        backgroundColor: item.readAt ? c.surface : c.accentSoft,
      }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name={item.conversation ? "chat" : "calendar"} size={16} color={c.body} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text role={item.readAt ? "ui" : "uiSemiBold"} size={13} color={c.ink}>
          {title}
        </Text>
        {detail ? (
          <Text size={12} color={c.body} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
        <Text size={11} color={c.muted}>
          {formatDateTimeShort(new Date(item.createdAt), locale, tz)}
        </Text>
      </View>
    </Pressable>
  );
}

function EmailMe() {
  const { c } = useCalm();
  const { t } = useTranslation("notifications");
  const prefs = useMyNotificationPrefs();
  const save = useSaveMyNotificationPrefs();
  if (!prefs.data) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      <Text size={13} color={c.body}>
        {t("panel.inbox.emailMe")}
      </Text>
      <Toggle
        testID="crm-bell-email-me"
        label={t("panel.inbox.emailMe")}
        value={prefs.data.emailEnabled}
        onChange={(v) => {
          save.mutate({ emailEnabled: v });
        }}
      />
    </View>
  );
}
