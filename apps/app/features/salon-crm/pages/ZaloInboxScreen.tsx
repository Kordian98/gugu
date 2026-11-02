import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, font, useCalm } from "@gugu/design-system";
import type { ZaloAttentionItem, ZaloConversation, ZaloMessage } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import {
  type ConversationFilter,
  useZaloAttention,
  useZaloConnection,
  useZaloConversation,
  useZaloConversations,
  useZaloMessages,
  useZaloMutation,
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
  "auto_released",
] as const;
type Kind = (typeof KINDS)[number] | "other";
const kindOf = (k: string): Kind =>
  (KINDS as readonly string[]).includes(k) ? (k as Kind) : "other";
/** Indicative price of one paid consultation message (server config ZALO_PRICE_CS_PAID_VND). */
const PAID_MESSAGE_VND = 55;

const timeOf = (iso: string, locale: "vi" | "en") =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Zalo inbox (topic 09, X24). Customers waiting for a person are pinned on top; any conversation
 * opens a thread with a reply box at the bottom — replies go out from the salon's OA, no Zalo app
 * needed. Desktop: list + thread side by side; mobile: list, then the thread with a Back button.
 * `?c=<conversationId>` opens a conversation directly (Today card, links).
 */
export function ZaloInboxScreen() {
  const { c } = useCalm();
  const { t } = useTranslation(["crm", "zalo"]);
  const ws = useWorkspace();
  const bp = useBreakpoint();
  const { go } = useCrmNav();
  const params = useLocalSearchParams<{ c?: string }>();
  const connection = useZaloConnection();
  const connected =
    connection.data?.status === "connected" || connection.data?.status === "needs_reauth";
  const [filter, setFilter] = useState<ConversationFilter>("all");
  // undefined = follow the `?c=` link; null = nothing open (e.g. after Back on mobile).
  const [picked, setSelected] = useState<string | null | undefined>(undefined);
  const selected = picked === undefined ? (params.c ?? null) : picked;
  const list = useZaloConversations(filter, connected);
  const detail = useZaloConversation(selected);
  const wide = bp !== "mobile";
  const current = detail.data ?? list.data?.items.find((x) => x.id === selected) ?? null;
  const showList = wide || !selected;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: bp === "mobile" ? 16 : 28,
        // Room for the floating assistant button so the reply box is never covered.
        paddingBottom: 120,
        gap: 20,
      }}
    >
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
          {showList ? (
            <Waiting
              onOpen={(id) => {
                setSelected(id);
              }}
            />
          ) : null}
          <View
            style={{ flexDirection: wide ? "row" : "column", gap: 16, alignItems: "flex-start" }}
          >
            {showList ? (
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
                {!wide ? (
                  <Text size={12} color={c.muted}>
                    {t("zalo:panel.inbox.listHint")}
                  </Text>
                ) : null}
                {list.data?.items.length === 0 ? (
                  <EmptyState
                    compact
                    icon="chat"
                    title={t("zalo:panel.inbox.empty")}
                    body={t("zalo:panel.inbox.selectBody")}
                  />
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
                <EmptyState
                  icon="chat"
                  title={t("zalo:panel.inbox.select")}
                  body={t("zalo:panel.inbox.selectBody")}
                />
              </CalmCard>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/** Pinned: customers waiting for a person, longest first, with their last messages. */
function Waiting({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const attention = useZaloAttention();
  const takeOver = useZaloMutation(zaloApi.takeOver);
  const release = useZaloMutation(zaloApi.release);
  const items = attention.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <CalmCard style={{ gap: 12 }} testID="zalo-waiting">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text role="uiSemiBold" size={15} color={c.ink} style={{ flex: 1 }}>
          {t("panel.inbox.waitingTitle")}
        </Text>
        <Pill label={String(attention.data?.waiting ?? items.length)} tone="down" />
      </View>
      {items.map((item) => (
        <WaitingRow
          key={item.conversationId}
          item={item}
          onOpen={() => {
            onOpen(item.conversationId);
          }}
          onTakeOver={() => {
            takeOver.mutate(item.conversationId, {
              onSuccess: () => {
                onOpen(item.conversationId);
              },
            });
          }}
          onRelease={() => {
            release.mutate(item.conversationId);
          }}
        />
      ))}
    </CalmCard>
  );
}

function WaitingRow({
  item,
  onOpen,
  onTakeOver,
  onRelease,
}: {
  item: ZaloAttentionItem;
  onOpen: () => void;
  onTakeOver: () => void;
  onRelease: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  return (
    <View
      testID={`zalo-waiting-${item.conversationId}`}
      style={{ gap: 6, padding: 10, borderRadius: 12, backgroundColor: c.surfaceMuted }}
    >
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text role="uiSemiBold" size={14} color={c.ink} style={{ flex: 1 }}>
            {item.displayName ?? t("panel.inbox.unknownCustomer")}
          </Text>
          {item.since ? (
            <Text size={12} color={c.muted}>
              {t("panel.inbox.waitingSince", { time: timeOf(item.since, locale) })}
            </Text>
          ) : null}
        </View>
        {item.lastMessages.map((m) => (
          <Text key={m.createdAt} size={13} color={c.body} numberOfLines={2}>
            {m.text ?? t(`panel.inbox.kind.${kindOf(m.kind)}`)}
          </Text>
        ))}
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <CalmButton size="sm" icon="chat" label={t("panel.inbox.reply")} onPress={onOpen} />
        {!item.assigned ? (
          <CalmButton
            size="sm"
            variant="secondary"
            label={t("panel.inbox.takeOver")}
            onPress={onTakeOver}
          />
        ) : null}
        <CalmButton
          size="sm"
          variant="ghost"
          label={t("panel.inbox.release")}
          onPress={onRelease}
        />
      </View>
    </View>
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
  const takeOver = useZaloMutation(zaloApi.takeOver);
  const release = useZaloMutation(zaloApi.release);
  const markRead = useZaloMutation(zaloApi.markRead);
  const unread = conv.unreadCount;
  const { mutate: read } = markRead;
  useEffect(() => {
    if (unread > 0) read(conv.id);
  }, [conv.id, unread, read]);
  return (
    <CalmCard style={{ flex: 1, gap: 12, width: "100%" }} testID="zalo-thread">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {onBack ? (
          <CalmButton
            testID="zalo-thread-back"
            variant="secondary"
            size="sm"
            icon="chevronLeft"
            label={t("panel.inbox.back")}
            onPress={onBack}
          />
        ) : null}
        <View style={{ flex: 1, gap: 2, minWidth: 120 }}>
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
      </View>
      <View style={{ gap: 8, minHeight: 200 }}>
        {messages.isPending ? <ActivityIndicator color={c.accent} /> : null}
        {messages.data?.items.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
      </View>
      <ErrorBanner text={errorText(takeOver.error ?? release.error)} />
      <ModeBar
        conv={conv}
        onTakeOver={() => {
          takeOver.mutate(conv.id);
        }}
        onRelease={() => {
          release.mutate(conv.id);
        }}
      />
      <Composer conv={conv} />
    </CalmCard>
  );
}

/** Who is answering, with the one action that changes it — right above the reply box. */
function ModeBar({
  conv,
  onTakeOver,
  onRelease,
}: {
  conv: ZaloConversation;
  onTakeOver: () => void;
  onRelease: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const bot = conv.mode === "bot";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: 10,
        borderRadius: 12,
        backgroundColor: c.surfaceMuted,
      }}
    >
      <Text size={13} color={c.body} style={{ flex: 1, minWidth: 180 }}>
        {bot ? t("panel.inbox.botActiveNote") : t("panel.inbox.staffActiveNote")}
      </Text>
      {bot ? (
        <CalmButton
          testID="zalo-take-over"
          size="sm"
          variant="secondary"
          label={t("panel.inbox.takeOver")}
          onPress={onTakeOver}
        />
      ) : (
        <CalmButton
          testID="zalo-release"
          size="sm"
          variant="secondary"
          label={t("panel.inbox.release")}
          onPress={onRelease}
        />
      )}
    </View>
  );
}

/** Reply box, always at the bottom. Explains paid / blocked replies instead of failing silently. */
function Composer({ conv }: { conv: ZaloConversation }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  const errorText = useErrorText();
  const reply = useZaloMutation(zaloApi.reply);
  const [text, setText] = useState("");
  const blocked = conv.window === "closed";
  const send = () => {
    const body = text.trim();
    if (!body || blocked) return;
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
    <View style={{ gap: 8 }}>
      {conv.window === "paid" ? (
        <Text size={12} color={c.body}>
          {t("panel.inbox.paidNote", { price: formatVND(PAID_MESSAGE_VND, locale) })}
        </Text>
      ) : null}
      {blocked ? (
        <Text size={12} color={c.attention} testID="zalo-window-closed">
          {t("panel.inbox.closedNote")}
        </Text>
      ) : null}
      <ErrorBanner text={errorText(reply.error)} />
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          testID="zalo-reply-input"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          editable={!blocked}
          accessibilityLabel={t("panel.inbox.placeholder")}
          placeholder={t("panel.inbox.placeholder")}
          placeholderTextColor={c.muted}
          style={{
            flex: 1,
            height: 44,
            paddingHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: blocked ? c.surfaceMuted : c.surface,
            color: c.ink,
            fontFamily: font.ui,
            fontSize: 15,
          }}
        />
        <CalmButton testID="zalo-reply-send" label={t("panel.inbox.send")} onPress={send} />
      </View>
      <Text size={11} color={c.muted}>
        {t("panel.inbox.sendExplain")}
      </Text>
    </View>
  );
}

function Bubble({ m }: { m: ZaloMessage }) {
  const { c } = useCalm();
  const { t } = useTranslation("zalo");
  const locale = useLocale();
  if (m.kind === "auto_released") {
    return (
      <Text size={12} color={c.muted} style={{ textAlign: "center", paddingVertical: 4 }}>
        {t("panel.inbox.kind.auto_released")}
      </Text>
    );
  }
  const mine = m.direction === "outbound";
  const label = m.text ?? t(`panel.inbox.kind.${kindOf(m.kind)}`);
  const meta = [
    t(`panel.inbox.sender.${m.sender}`),
    timeOf(m.createdAt, locale),
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
