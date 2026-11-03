import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ClientEraseResult,
  ClientExportResult,
  SalonExport,
  SalonExportDownload,
  SalonExportList,
} from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";

import { useOptionalSalon, useSalon } from "./SalonContext";

/**
 * Privacy tools (topic 05 step 8). Owner-only on the API (`customers.export`, `customers.erase`);
 * the UI hides them for others. Export content is handed to the user (download/share) and never
 * cached beyond the mutation result.
 */

export function useExportClient() {
  const { salonId } = useSalon();
  return useMutation({
    mutationFn: (v: { id: string; locale: "vi" | "en" }) =>
      apiFetch<ClientExportResult>(
        `/salons/${salonId}/customers/${v.id}/export?locale=${v.locale}`,
      ),
    gcTime: 0,
  });
}

export function useEraseClient() {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ClientEraseResult>(`/salons/${salonId}/customers/${id}/erase`, {
        method: "POST",
        body: { confirm: true },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["salon", salonId] });
    },
  });
}

const exportsKey = (salonId: string) => ["salon", salonId, "privacy", "exports"] as const;

export function useSalonExports(enabled: boolean) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: exportsKey(salonId),
    queryFn: () => apiFetch<SalonExportList>(`/salons/${salonId}/privacy/exports`),
    enabled: enabled && salonId !== "",
    // Poll while an export is being built by the worker.
    refetchInterval: (q) =>
      q.state.data?.items.some((e) => e.status === "queued" || e.status === "running")
        ? 3000
        : false,
  });
}

export function useRequestSalonExport() {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SalonExport>(`/salons/${salonId}/privacy/exports`, { method: "POST", body: {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: exportsKey(salonId) });
    },
  });
}

export function useDownloadSalonExport() {
  const { salonId } = useSalon();
  return useMutation({
    mutationFn: (v: { id: string; format: "json" | "csv" }) =>
      apiFetch<SalonExportDownload>(
        `/salons/${salonId}/privacy/exports/${v.id}/download?format=${v.format}`,
      ),
    gcTime: 0,
  });
}
