import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { type AssistantEvent, assistantEventSchema, type AssistantStatus } from "@gugu/contracts";

import { ApiError, apiFetch, apiStream } from "@/services/auth/api";

import { useOptionalSalon } from "../salon-crm/data/SalonContext";

export function useAssistantStatus() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: ["salon", salonId, "assistant"],
    queryFn: () => apiFetch<AssistantStatus>(`/salons/${salonId}/assistant`),
    enabled: salonId !== "",
    staleTime: 60_000,
  });
}

export interface ChatSource {
  tool: string;
  from: string | null;
  to: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** User turns: what the model received after scrubbing, when it differs. */
  masked?: string | undefined;
  sources: ChatSource[];
  /** Error code of a failed assistant turn. */
  error?: string | undefined;
  pending?: boolean;
}

/** Chat state of one panel session: messages, the running turn and the conversation id. */
export function useAssistantChat(salonId: string, locale: "vi" | "en") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const stamp = String(Date.now());
      const userId = `u${stamp}`;
      const replyId = `a${stamp}`;
      setMessages((ms) => [
        ...ms,
        { id: userId, role: "user", text: trimmed, sources: [] },
        { id: replyId, role: "assistant", text: "", sources: [], pending: true },
      ]);
      setBusy(true);
      const controller = new AbortController();
      abort.current = controller;
      const onEvent = (event: AssistantEvent) => {
        if (event.type === "conversation") conversationId.current = event.conversationId;
        else if (event.type === "masked" && event.changed) {
          patch(userId, (m) => ({ ...m, masked: event.text }));
        } else if (event.type === "delta")
          patch(replyId, (m) => ({ ...m, text: m.text + event.text }));
        else if (event.type === "source") {
          patch(replyId, (m) => ({ ...m, sources: [...m.sources, event] }));
        } else if (event.type === "error") patch(replyId, (m) => ({ ...m, error: event.code }));
      };
      try {
        await apiStream(
          `/salons/${salonId}/assistant/turns`,
          { text: trimmed, locale, conversationId: conversationId.current },
          (data) => {
            const parsed = assistantEventSchema.safeParse(JSON.parse(data));
            if (parsed.success) onEvent(parsed.data);
          },
          { signal: controller.signal },
        );
      } catch (e) {
        if (!controller.signal.aborted) {
          patch(replyId, (m) => ({
            ...m,
            error: e instanceof ApiError ? e.code : "assistant.failed",
          }));
        }
      } finally {
        patch(replyId, (m) => ({ ...m, pending: false }));
        setBusy(false);
        abort.current = null;
      }
    },
    [busy, locale, salonId],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    conversationId.current = null;
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, reset };
}
