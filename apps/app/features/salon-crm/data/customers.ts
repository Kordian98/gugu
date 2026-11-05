import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CustomerDetail,
  CustomerInput,
  CustomerList,
  CustomerUpdate,
  Insights,
} from "@gugu/contracts";

import { ApiError, apiFetch } from "@/services/auth/api";

import { useOptionalSalon, useSalon } from "./SalonContext";

const key = (s: string) => ["salon", s, "customers"] as const;

export type CustomerFilter = {
  q: string;
  segment: "all" | "new" | "returning" | "at_risk" | "no_shows";
  tag: string | null;
};

export function useCustomers(f: CustomerFilter) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  const qs = new URLSearchParams({
    q: f.q,
    segment: f.segment,
    ...(f.tag ? { tag: f.tag } : {}),
  }).toString();
  return useInfiniteQuery({
    queryKey: [...key(salonId), "directory", qs],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch<CustomerList>(
        `/salons/${salonId}/customers?${qs}&limit=50&offset=${String(pageParam)}`,
      ),
    getNextPageParam: (last, pages) => {
      const shown = pages.reduce((n, page) => n + page.items.length, 0);
      return last.items.length > 0 && shown < last.total ? shown : undefined;
    },
    enabled: salonId !== "",
  });
}

export function useCustomer(id: string | null) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: [...key(salonId), "detail", id],
    queryFn: () => apiFetch<CustomerDetail>(`/salons/${salonId}/customers/${id ?? ""}`),
    enabled: salonId !== "" && id !== null,
  });
}

function useCustomerMutation<V, R = void>(fn: (salonId: string, v: V) => Promise<R>) {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => fn(salonId, v),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(salonId) });
    },
  });
}

export const useCreateCustomer = () =>
  useCustomerMutation((s, body: CustomerInput) =>
    apiFetch<{ id: string }>(`/salons/${s}/customers`, { method: "POST", body }),
  );
export const useUpdateCustomer = () =>
  useCustomerMutation((s, v: { id: string; body: CustomerUpdate }) =>
    apiFetch(`/salons/${s}/customers/${v.id}`, { method: "PATCH", body: v.body }),
  );
export const useAddNote = () =>
  useCustomerMutation((s, v: { id: string; body: string }) =>
    apiFetch(`/salons/${s}/customers/${v.id}/notes`, { method: "POST", body: { body: v.body } }),
  );
export const useDeleteNote = () =>
  useCustomerMutation((s, v: { id: string; noteId: string }) =>
    apiFetch(`/salons/${s}/customers/${v.id}/notes/${v.noteId}`, { method: "DELETE" }),
  );

/** Insights for a period; `forbidden` when the member has no analytics permission. */
export function useInsights(from: string, to: string) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: ["salon", salonId, "insights", from, to],
    queryFn: async () => {
      try {
        return {
          data: await apiFetch<Insights>(`/salons/${salonId}/insights?from=${from}&to=${to}`),
          forbidden: false,
        };
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) return { data: null, forbidden: true };
        throw e;
      }
    },
    enabled: salonId !== "",
    placeholderData: keepPreviousData,
  });
}
