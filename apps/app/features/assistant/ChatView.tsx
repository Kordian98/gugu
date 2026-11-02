import { type ComponentRef, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";

import { font, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import { ASSISTANT_MAX_INPUT_CHARS } from "@gugu/contracts";

import { type ChatMessage, type ChatSource, useAssistantChat } from "./data";

const SUGGESTIONS = ["today", "revenue", "busy", "tomorrow"] as const;

/** The conversation: starter suggestions, messages with mask preview and source chips, composer. */
export function ChatView({ salonId, locale }: { salonId: string; locale: "vi" | "en" }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const chat = useAssistantChat(salonId, locale);
  const [draft, setDraft] = useState("");
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [chat.messages]);

  const submit = (text: string) => {
    if (!text.trim() || chat.busy) return;
    setDraft("");
    void chat.send(text);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {chat.messages.length === 0 ? (
          <View style={{ gap: 10 }}>
            <Text role="uiMedium" size={13} color={c.muted}>
              {t("assistant.suggestionsTitle")}
            </Text>
            {SUGGESTIONS.map((key) => (
              <Pressable
                key={key}
                testID={`assistant-suggestion-${key}`}
                accessibilityRole="button"
                onPress={() => {
                  submit(t(`assistant.suggestions.${key}`));
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.line,
                  backgroundColor: c.surface,
                }}
              >
                <Text size={14} color={c.ink}>
                  {t(`assistant.suggestions.${key}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          chat.messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </ScrollView>
      <View
        style={{
          gap: 6,
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: c.line,
          backgroundColor: c.surface,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <TextInput
            testID="assistant-input"
            value={draft}
            onChangeText={setDraft}
            placeholder={t("assistant.placeholder")}
            placeholderTextColor={c.muted}
            accessibilityLabel={t("assistant.placeholder")}
            maxLength={ASSISTANT_MAX_INPUT_CHARS}
            multiline
            onSubmitEditing={() => {
              submit(draft);
            }}
            submitBehavior="blurAndSubmit"
            style={{
              flex: 1,
              minHeight: 42,
              maxHeight: 120,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.line,
              backgroundColor: c.canvas,
              color: c.ink,
              fontFamily: font.ui,
              fontSize: 15,
            }}
          />
          <Pressable
            testID="assistant-send"
            accessibilityRole="button"
            accessibilityLabel={chat.busy ? t("assistant.stop") : t("assistant.send")}
            onPress={() => {
              if (chat.busy) chat.stop();
              else submit(draft);
            }}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.accentBg,
            }}
          >
            <Icon name={chat.busy ? "close" : "arrowUp"} size={18} color={c.onAccent} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text size={11} color={c.muted} style={{ flex: 1 }}>
            {t("assistant.privacy")}
          </Text>
          {chat.messages.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={chat.reset} hitSlop={8}>
              <Text role="uiMedium" size={12} color={c.accent}>
                {t("assistant.newChat")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const { c } = useCalm();
  const { t, i18n } = useTranslation("crm");
  const mine = message.role === "user";
  const errorKey = message.error ? `assistant.errors.${message.error.replace(/\./g, "_")}` : null;
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 4 }}>
      <View
        testID={mine ? "assistant-msg-user" : "assistant-msg-assistant"}
        style={{
          maxWidth: "88%",
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 16,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          backgroundColor: mine ? c.accentSoft : c.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: c.line,
          gap: 6,
        }}
      >
        {message.text ? (
          <Text size={14} color={c.ink}>
            {message.text}
          </Text>
        ) : message.pending ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
          >
            <ActivityIndicator size="small" color={c.accent} />
            <Text size={13} color={c.muted}>
              {t("assistant.thinking")}
            </Text>
          </View>
        ) : null}
        {errorKey ? (
          <View accessibilityRole="alert">
            <Text size={13} color={c.down.text}>
              {i18n.exists(`crm:${errorKey}`)
                ? t(errorKey as never)
                : t("assistant.errors.generic")}
            </Text>
          </View>
        ) : null}
      </View>
      {mine && message.masked ? (
        <Text size={11} color={c.muted} style={{ maxWidth: "88%" }}>
          {t("assistant.masked", { text: message.masked })}
        </Text>
      ) : null}
      {!mine && message.sources.length > 0 ? <Sources sources={message.sources} /> : null}
    </View>
  );
}

function Sources({ sources }: { sources: ChatSource[] }) {
  const { t } = useTranslation("crm");
  const shown = sources.filter((s) => s.tool !== "resolve_period");
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, maxWidth: "88%" }}>
      {shown.map((s, i) => (
        <Pill
          key={`${s.tool}-${String(i)}`}
          size={11}
          label={`${String(t(`assistant.sources.${s.tool}` as never))}${
            s.from && s.to
              ? ` · ${s.from === s.to ? fmt(s.from) : `${fmt(s.from)}–${fmt(s.to)}`}`
              : ""
          }`}
        />
      ))}
    </View>
  );
}
