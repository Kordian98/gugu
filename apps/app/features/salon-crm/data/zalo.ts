import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ZaloAttention,
  ZaloConnection,
  ZaloConversation,
  ZaloConversationList,
  ZaloMessageList,
  ZaloNotificationList,
  ZaloSettingsInput,
  ZaloStats,
  ZaloStartConnectionResult,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useOptionalSalon, useSalon } from "./SalonContext";

/** Zalo panel data (topic 09). Keys include the salon id (no cross-tenant cache). */
const keys = {
  all: (s: string) => ["salon", s, "zalo"] as const,
  connection: (s: string) => ["salon", s, "zalo", "connection"] as const,
  conversations: (s: string, filter: string) =>
    ["salon", s, "zalo", "conversations", filter] as const,
  messages: (s: string, id: string) => ["salon", s, "zalo", "messages", id] as const,
  notifications: (s: string) => ["salon", s, "zalo", "notifications"] as const,
  attention: (s: string) => ["salon", s, "zalo", "attention"] as const,
  conversation: (s: string, id: string) => ["salon", s, "zalo", "conversation", id] as const,
  stats: (s: string, from: string, to: string) => ["salon", s, "zalo", "stats", from, to] as const,
};

/** Live-ish inbox: customers expect quick answers, so lists refresh every few seconds. */
const POLL_MS = 5_000;

export function useZaloConnection() {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.connection(salonId),
    queryFn: () => apiFetch<ZaloConnection>(`/salons/${salonId}/zalo/connection`),
    enabled: salonId !== "",
  });
}

export type ConversationFilter = "all" | "needs_staff" | "unread";

export function useZaloConversations(filter: ConversationFilter, enabled: boolean) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.conversations(salonId, filter),
    queryFn: () =>
      apiFetch<ZaloConversationList>(
        `/salons/${salonId}/zalo/conversations?filter=${filter}&limit=50`,
      ),
    enabled: enabled && salonId !== "",
    refetchInterval: POLL_MS,
  });
}

export function useZaloMessages(conversationId: string | null) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.messages(salonId, conversationId ?? ""),
    queryFn: () =>
      apiFetch<ZaloMessageList>(
        `/salons/${salonId}/zalo/conversations/${conversationId ?? ""}/messages?limit=50`,
      ),
    enabled: salonId !== "" && conversationId !== null,
    refetchInterval: POLL_MS,
  });
}

/**
 * Customers waiting for a person. Polled everywhere it is shown (sidebar badge, Today, inbox) so a
 * hand-off is impossible to miss. Disabled for members without `zalo.inbox.use`.
 */
export function useZaloAttention() {
  const salon = useOptionalSalon();
  const salonId = salon?.salonId ?? "";
  const allowed = salon?.can("zalo.inbox.use") ?? false;
  return useQuery({
    queryKey: keys.attention(salonId),
    queryFn: () => apiFetch<ZaloAttention>(`/salons/${salonId}/zalo/attention`),
    enabled: salonId !== "" && allowed,
    refetchInterval: POLL_MS * 3,
  });
}

export function useZaloConversation(id: string | null) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.conversation(salonId, id ?? ""),
    queryFn: () => apiFetch<ZaloConversation>(`/salons/${salonId}/zalo/conversations/${id ?? ""}`),
    enabled: salonId !== "" && id !== null,
    refetchInterval: POLL_MS,
  });
}

/** Zalo statistics for a salon-local period (aggregates only). */
export function useZaloStats(from: string, to: string, enabled: boolean) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.stats(salonId, from, to),
    queryFn: () => apiFetch<ZaloStats>(`/salons/${salonId}/zalo/stats?from=${from}&to=${to}`),
    enabled: enabled && salonId !== "",
  });
}

export function useZaloNotifications(enabled: boolean) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: keys.notifications(salonId),
    queryFn: () => apiFetch<ZaloNotificationList>(`/salons/${salonId}/zalo/notifications`),
    enabled: enabled && salonId !== "",
    refetchInterval: POLL_MS * 2,
  });
}

/** Any Zalo write; refreshes every Zalo query of the salon afterwards. */
export function useZaloMutation<TVars, TResult = void>(
  request: (salonId: string, vars: TVars) => Promise<TResult>,
) {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => request(salonId, vars),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.all(salonId) });
    },
  });
}

export const zaloApi = {
  start: (s: string, locale: "vi" | "en") =>
    apiFetch<ZaloStartConnectionResult>(`/salons/${s}/zalo/connection/start`, {
      method: "POST",
      body: { locale },
    }),
  disconnect: (s: string, _v: undefined) =>
    apiFetch(`/salons/${s}/zalo/connection/disconnect`, { method: "POST" }),
  updateSettings: (s: string, body: ZaloSettingsInput) =>
    apiFetch(`/salons/${s}/zalo/settings`, { method: "PATCH", body }),
  reply: (s: string, v: { conversationId: string; text: string }) =>
    apiFetch(`/salons/${s}/zalo/conversations/${v.conversationId}/messages`, {
      method: "POST",
      body: { text: v.text },
    }),
  takeOver: (s: string, conversationId: string) =>
    apiFetch(`/salons/${s}/zalo/conversations/${conversationId}/take-over`, { method: "POST" }),
  release: (s: string, conversationId: string) =>
    apiFetch(`/salons/${s}/zalo/conversations/${conversationId}/release`, { method: "POST" }),
  markRead: (s: string, conversationId: string) =>
    apiFetch(`/salons/${s}/zalo/conversations/${conversationId}/read`, { method: "POST" }),
  notificationsRead: (s: string, _v: undefined) =>
    apiFetch(`/salons/${s}/zalo/notifications/read`, { method: "POST" }),
};
