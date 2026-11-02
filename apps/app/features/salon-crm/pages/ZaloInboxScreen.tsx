import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, font, useCalm } from "@gugu/design-system";
import type { ZaloConversation, ZaloMessage } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import {
  type ConversationFilter,
  useZaloConnection,
  useZaloConversations,
  useZaloMessages,
  useZaloMutation,
  useZaloNotifications,
  zaloApi,
} from "../data/zalo";
import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { useCrmNav } from "../shell/useCrmNav";
import { EmptyState } from "../ui/EmptyState";
import { useErrorText } from "../ui/errors";
import { ErrorBanner } from "../ui/form";

const FILTERS: ConversationFilter[] = ["all", "needs_staff", "unread"];
const KINDS = [
  "button",
  "follow",
  "unfollow",
  "user_info",
  "sticker",
  "image",
  "file",
  "template",
] as const;
type Kind = (typeof KINDS)[number] | "other";
const kindOf = (k: string): Kind =>
  (KINDS as readonly string[]).includes(k) ? (k as Kind) : "other";

/**
 * Zalo inbox (topic 09, X24): conversations of the salon's OA, the assistant's and staff replies,
 * take over / hand back, and what needs attention. Desktop: list + chat side by side; mobile: one.
 */
export function ZaloInboxScreen() {
  const { c } = useCalm();
  const { t } = useTranslation(["crm", "zalo"]);
  const ws = useWorkspace();
  const bp = useBreakpoint();
  const { go } = useCrmNav();
  const connection = useZaloConnection();
  const connected =
    connection.data?.status === "connected" || connection.data?.status === "needs_reauth";
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useZaloConversations(filter, connected);
  const wide = bp !== "mobile";
  const current = list.data?.items.find((x) => x.id === selected) ?? null;

  return (
    <ScrollView contentContainerStyle={{ padding: bp === "mobile" ? 16 : 28, gap: 20 }}>
      <PageHeader title={t("crm:pages.zalo.title")} workspace={ws} />
      {connection.isPending ? <ActivityIndicator color={c.accent} /> : null}
      {connection.data && !connected ? (
        <CalmCard>
          <EmptyState
            testID="zalo-inbox-not-connected"
            icon="chat"
            title={t("zalo:panel.status.not_connected")}
            body={t("zalo:panel.inbox.notConnected")}
            action={
              <CalmButton
                label={t("zalo:panel.inbox.goSettings")}
                icon="settings"
                onPress={() => {
                  go("/business/settings?section=zalo");
                }}
              />
            }
          />
        </CalmCard>
      ) : null}
      {connected ? (
        <>
          <Attention />
          <View
            style={{ flexDirection: wide ? "row" : "column", gap: 16, alignItems: "flex-start" }}
          >
            {wide || !current ? (
              <CalmCard style={{ gap: 10, width: wide ? 340 : "100%", padding: 12 }}>
                <View
                  accessibilityRole="tablist"
                  style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                >
                  {FILTERS.map((f) => (
                    <FilterChip
                      key={f}
                      label={t(
                        `zalo:panel.inbox.${f === "all" ? "filterAll" : f === "needs_staff" ? "filterNeedsStaff" : "filterUnread"}`,
                      )}
                      selected={filter === f}
                      onPress={() => {
                        setFilter(f);
                      }}
                    />
                  ))}
                </View>
                {list.data?.items.length === 0 ? (
                  <EmptyState compact icon="chat" title={t("zalo:panel.inbox.empty")} />
                ) : null}
                {list.data?.items.map((conv) => (
                  <ConversationRow
                    key={conv.id}
                    conv={conv}
                    selected={conv.id === selected}
                    onPress={() => {
                      setSelected(conv.id);
                    }}
                  />
                ))}
              </CalmCard>
            ) : null}
            {current ? (
              <Chat
                conv={current}
                onBack={
                  wide
                    ? undefined
                    : () => {
                        setSelected(null);
                      }
                }
              />
            ) : wide ? (
              <CalmCard style={{ flex: 1 }}>
                <EmptyState compact icon="chat" title={t("zalo:panel.inbox.select")} />
              </CalmCard>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        height: 32,
        borderRadius: 999,
        justifyContent: "center",
        backgroundColor: selected ? c.accentSoft : c.surfaceMuted,
      }}
    >
      <Text role="uiMedium" size={13} color={selected ? c.accent : c.body}>
        {label}
      </Text>
    </Pressable>
  );
}

function WindowPill({ window }: { window: ZaloConversation["window"] }) {
  const { t } = useTranslation("zalo");
  return (
    <Pill
      label={t(`panel.inbox.window.${window}`)}
      tone={window === "free" ? "up" : window === "paid" ? "accent" : "down"}
    />
  );
}

function ConversationRow({
  conv,
  selected,
  onPress,
}: {
  conv: ZaloConversation;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  return (
    <Pressable
      testID={`zalo-conversation-${conv.id}`}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        padding: 10,
        borderRadius: 12,
        gap: 4,
        backgroundColor: selected ? c.accentSoft : "transparent",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text role="uiSemiBold" size={14} color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
          {conv.displayName ?? t("panel.inbox.unknownCustomer")}
        </Text>
        {conv.unreadCount > 0 ? <Pill label={String(conv.unreadCount)} tone="brand" /> : null}
      </View>
      <Text size={13} color={c.body} numberOfLines={1}>
        {conv.lastMessagePreview ?? t("panel.inbox.kind.other")}
      </Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Pill
          label={conv.mode === "staff" ? t("panel.inbox.staffMode") : t("panel.inbox.botMode")}
          tone={conv.mode === "staff" ? "accent" : "neutral"}
        />
        {!conv.followed ? <Pill label={t("panel.inbox.unfollowed")} /> : null}
      </View>
    </Pressable>
  );
}

function Chat({ conv, onBack }: { conv: ZaloConversation; onBack?: (() => void) | undefined }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const errorText = useErrorText();
  const messages = useZaloMessages(conv.id);
  const reply = useZaloMutation(zaloApi.reply);
  const takeOver = useZaloMutation(zaloApi.takeOver);
  const release = useZaloMutation(zaloApi.release);
  const markRead = useZaloMutation(zaloApi.markRead);
  const [text, setText] = useState("");
  const unread = conv.unreadCount;
  const { mutate: read } = markRead;
  useEffect(() => {
    if (unread > 0) read(conv.id);
  }, [conv.id, unread, read]);
  const send = () => {
    const body = text.trim();
    if (!body) return;
    reply.mutate(
      { conversationId: conv.id, text: body },
      {
        onSuccess: () => {
          setText("");
        },
      },
    );
  };
  return (
    <CalmCard style={{ flex: 1, gap: 12, width: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {onBack ? (
          <CalmButton
            variant="ghost"
            size="sm"
            icon="chevronLeft"
            label={t("panel.inbox.back")}
            onPress={onBack}
          />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="uiSemiBold" size={16} color={c.ink}>
            {conv.displayName ?? t("panel.inbox.unknownCustomer")}
          </Text>
          {conv.phone ? (
            <Text size={12} color={c.muted}>
              {conv.phone}
            </Text>
          ) : null}
        </View>
        <WindowPill window={conv.window} />
        {conv.mode === "bot" ? (
          <CalmButton
            testID="zalo-take-over"
            size="sm"
            variant="secondary"
            label={t("panel.inbox.takeOver")}
            onPress={() => {
              takeOver.mutate(conv.id);
            }}
          />
        ) : (
          <CalmButton
            testID="zalo-release"
            size="sm"
            variant="secondary"
            label={t("panel.inbox.release")}
            onPress={() => {
              release.mutate(conv.id);
            }}
          />
        )}
      </View>
      <View style={{ gap: 8, minHeight: 240 }}>
        {messages.isPending ? <ActivityIndicator color={c.accent} /> : null}
        {messages.data?.items.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
      </View>
      <ErrorBanner text={errorText(reply.error ?? takeOver.error ?? release.error)} />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          testID="zalo-reply-input"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          editable={conv.window !== "closed"}
          accessibilityLabel={t("panel.inbox.placeholder")}
          placeholder={t("panel.inbox.placeholder")}
          placeholderTextColor={c.muted}
          style={{
            flex: 1,
            height: 42,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            color: c.ink,
            fontFamily: font.ui,
            fontSize: 15,
          }}
        />
        <CalmButton testID="zalo-reply-send" label={t("panel.inbox.send")} onPress={send} />
      </View>
    </CalmCard>
  );
}

function Bubble({ m }: { m: ZaloMessage }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  const mine = m.direction === "outbound";
  const label = m.text ?? t(`panel.inbox.kind.${kindOf(m.kind)}`);
  const time = new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(m.createdAt));
  const meta = [
    t(`panel.inbox.sender.${m.sender}`),
    time,
    ...(m.status && m.status !== "sent" ? [t(`panel.inbox.messageStatus.${m.status}`)] : []),
  ].join(" · ");
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 2 }}>
      <View
        style={{
          maxWidth: "80%",
          padding: 10,
          borderRadius: 14,
          backgroundColor: mine ? c.accentSoft : c.surfaceMuted,
          gap: 6,
        }}
      >
        <Text size={14} color={c.ink}>
          {label}
        </Text>
        {m.buttons.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {m.buttons.map((b) => (
              <Pill key={b} label={b} />
            ))}
          </View>
        ) : null}
      </View>
      <Text
        size={11}
        color={m.status === "failed" || m.status === "rejected" ? c.attention : c.muted}
      >
        {meta}
      </Text>
    </View>
  );
}

/** Hand-off requests and bookings changed in Zalo, newest first. */
function Attention() {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const notifications = useZaloNotifications(true);
  const readAll = useZaloMutation(zaloApi.notificationsRead);
  const unread = notifications.data?.items.filter((n) => !n.read) ?? [];
  if (unread.length === 0) return null;
  return (
    <CalmCard style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text role="uiSemiBold" size={15} color={c.ink} style={{ flex: 1 }}>
          {t("panel.notifications.title")}
        </Text>
        <CalmButton
          size="sm"
          variant="ghost"
          label={t("panel.notifications.markAllRead")}
          onPress={() => {
            readAll.mutate(undefined);
          }}
        />
      </View>
      {unread.slice(0, 5).map((n) => (
        <Text key={n.id} size={13} color={c.body}>
          {t(`panel.notifications.kind.${n.kind}`)}
        </Text>
      ))}
    </CalmCard>
  );
}
