import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AdjustmentInput,
  CommissionBulkInput,
  CommissionLines,
  CommissionPolicyInput,
  MyCommissionLines,
  MyEarnings,
  PayrollAdjustment,
  PayrollExport,
  PayrollMonth,
  PayrollSettings,
  PayVersionInput,
  Profit,
  SalonCost,
  SalonCostInput,
  SalonCostList,
  SalonCostUpdate,
  StaffPay,
} from "@gugu/contracts";

import { ApiError, apiFetch } from "@/services/auth/api";

import { useOptionalSalon, useSalon } from "./SalonContext";

/**
 * Payroll, pay settings, fixed costs and the profit view (ADR-0016). Query keys include the
 * salonId; `forbidden` is a state (permission-denied screen), not an error.
 */

const key = (salonId: string) => ["salon", salonId, "payroll"] as const;

type Gated<T> = { data: T | null; forbidden: boolean };
async function gated<T>(path: string): Promise<Gated<T>> {
  try {
    return { data: await apiFetch<T>(path), forbidden: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return { data: null, forbidden: true };
    throw e;
  }
}

function useGated<T>(sub: readonly unknown[], path: (salonId: string) => string, enabled = true) {
  const salonId = useOptionalSalon()?.salonId ?? "";
  return useQuery({
    queryKey: [...key(salonId), ...sub],
    queryFn: () => gated<T>(path(salonId)),
    enabled: salonId !== "" && enabled,
    placeholderData: keepPreviousData,
  });
}

export const usePayroll = (month: string) =>
  useGated<PayrollMonth>(["month", month], (s) => `/salons/${s}/payroll?month=${month}`);

export const usePayrollSettings = (enabled = true) =>
  useGated<PayrollSettings>(["settings"], (s) => `/salons/${s}/payroll/settings`, enabled);

export const useStaffPay = (staffId: string | null) =>
  useGated<StaffPay>(
    ["pay", staffId],
    (s) => `/salons/${s}/payroll/staff/${staffId ?? ""}/pay`,
    staffId !== null,
  );

export const useCommissionLines = (staffId: string | null, month: string) =>
  useGated<CommissionLines>(
    ["lines", staffId, month],
    (s) => `/salons/${s}/payroll/staff/${staffId ?? ""}/lines?month=${month}`,
    staffId !== null,
  );

/** The member's own commission lines (payroll.self.read); only when they have a staff profile. */
export const useMyLines = (month: string, enabled = true) =>
  useGated<MyCommissionLines>(
    ["me", "lines", month],
    (s) => `/salons/${s}/payroll/me/lines?month=${month}`,
    enabled,
  );

export const useMyEarnings = (month: string, enabled = true) =>
  useGated<MyEarnings>(["me", month], (s) => `/salons/${s}/payroll/me?month=${month}`, enabled);

export const useProfit = (month: string, enabled = true) =>
  useGated<Profit>(
    ["profit", month],
    (s) => `/salons/${s}/insights/profit?month=${month}`,
    enabled,
  );

export const useCosts = (month: string) =>
  useGated<SalonCostList>(["costs", month], (s) => `/salons/${s}/costs?month=${month}`);

/** Every payroll write refreshes the payroll family (month, settings, profit, own pay, costs). */
function usePayrollMutation<V, R = unknown>(fn: (salonId: string, v: V) => Promise<R>) {
  const { salonId } = useSalon();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => fn(salonId, v),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(salonId) });
    },
  });
}

export const useSaveStaffPay = () =>
  usePayrollMutation((s, v: { staffId: string; body: PayVersionInput }) =>
    apiFetch<StaffPay>(`/salons/${s}/payroll/staff/${v.staffId}/pay`, {
      method: "PUT",
      body: v.body,
    }),
  );
/** Same default % or own service rate for several people from a date (one atomic request). */
export const useBulkCommission = () =>
  usePayrollMutation((s, body: CommissionBulkInput) =>
    apiFetch<PayrollSettings>(`/salons/${s}/payroll/commission/bulk`, { method: "POST", body }),
  );

export const useSaveCommissionBase = () =>
  usePayrollMutation((s, body: CommissionPolicyInput) =>
    apiFetch<PayrollSettings>(`/salons/${s}/payroll/settings/commission-base`, {
      method: "PUT",
      body,
    }),
  );
export const useManagerAccess = () =>
  usePayrollMutation((s, v: { memberId: string; granted: boolean }) =>
    apiFetch<PayrollSettings>(`/salons/${s}/members/${v.memberId}/payroll-access`, {
      method: "PUT",
      body: { granted: v.granted },
    }),
  );
export const useAddAdjustment = () =>
  usePayrollMutation((s, body: AdjustmentInput) =>
    apiFetch<PayrollAdjustment>(`/salons/${s}/payroll/adjustments`, { method: "POST", body }),
  );
export const useRemoveAdjustment = () =>
  usePayrollMutation((s, id: string) =>
    apiFetch(`/salons/${s}/payroll/adjustments/${id}`, { method: "DELETE" }),
  );
export const useCloseMonth = () =>
  usePayrollMutation((s, month: string) =>
    apiFetch<PayrollMonth>(`/salons/${s}/payroll/months/${month}/close`, { method: "POST" }),
  );
export const useReopenMonth = () =>
  usePayrollMutation((s, v: { month: string; reason: string }) =>
    apiFetch<PayrollMonth>(`/salons/${s}/payroll/months/${v.month}/reopen`, {
      method: "POST",
      body: { reason: v.reason },
    }),
  );
export const useMarkPaid = () =>
  usePayrollMutation((s, v: { month: string; staffId: string; paidOn: string | null }) =>
    apiFetch<PayrollMonth>(`/salons/${s}/payroll/months/${v.month}/staff/${v.staffId}/paid`, {
      method: v.paidOn ? "PUT" : "DELETE",
      ...(v.paidOn ? { body: { paidOn: v.paidOn } } : {}),
    }),
  );
export const useCreateCost = () =>
  usePayrollMutation((s, body: SalonCostInput) =>
    apiFetch<SalonCost>(`/salons/${s}/costs`, { method: "POST", body }),
  );
export const useUpdateCost = () =>
  usePayrollMutation((s, v: { id: string; body: SalonCostUpdate }) =>
    apiFetch<SalonCost>(`/salons/${s}/costs/${v.id}`, { method: "PATCH", body: v.body }),
  );
export const useRemoveCost = () =>
  usePayrollMutation((s, v: { id: string; month: string }) =>
    apiFetch(`/salons/${s}/costs/${v.id}?month=${v.month}`, { method: "DELETE" }),
  );

/** Export file content is handed to the user right away and never cached. */
export function useExportPayroll() {
  const { salonId } = useSalon();
  return useMutation({
    mutationFn: (v: { month: string; format: "csv" | "xlsx"; locale: "vi" | "en" }) =>
      apiFetch<PayrollExport>(
        `/salons/${salonId}/payroll/export?month=${v.month}&format=${v.format}&locale=${v.locale}`,
      ),
    gcTime: 0,
  });
}

/** "2026-11" ± n months. */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy)}-${String(mm + 1).padStart(2, "0")}`;
}
