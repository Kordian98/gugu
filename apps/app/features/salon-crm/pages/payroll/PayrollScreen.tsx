import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Pill, Text, useCalm } from "@gugu/design-system";
import { COMMISSION_BASE_VALUES, type PayrollMonth, type PayrollRow } from "@gugu/contracts";
import { formatDateLong, formatMonth, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";
import { saveBase64File, saveTextFile } from "@/services/files/share";

import { salonDate } from "../../data/dates";
import {
  useCloseMonth,
  useExportPayroll,
  useManagerAccess,
  usePayroll,
  usePayrollSettings,
  useReopenMonth,
  useSaveCommissionBase,
} from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import {
  ConfirmDialog,
  ErrorBanner,
  Field,
  Input,
  Segmented,
  Sheet,
  SettingRow,
  Toggle,
} from "../../ui/form";
import {
  DOT,
  MonthSwitcher,
  Note,
  RetryError,
  SectionTitle,
  signedVnd,
  SkeletonRows,
} from "./parts";
import { PaySheet } from "./PaySheet";
import { StaffPayrollSheet } from "./StaffPayrollSheet";

type Open =
  | { kind: "row"; staffId: string }
  | { kind: "pay"; staffId: string; name: string }
  | { kind: "close" }
  | { kind: "reopen" }
  | null;

/**
 * Payroll (owner; managers only with the owner's grant): one row per person, base + commission ±
 * adjustments = to pay. One primary action: close the month. Bookkeeping only, estimates before
 * tax and insurance (always stated).
 */
export function PayrollScreen() {
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { summary, can } = useSalon();
  const mobile = bp === "mobile";
  const [month, setMonth] = useState(salonDate(new Date(), summary?.timezone).slice(0, 7));
  const q = usePayroll(month);
  const p = q.data?.data ?? null;
  const canManage = can("payroll.manage");
  const [open, setOpen] = useState<Open>(null);
  const close = useCloseMonth();
  const exp = useExportPayroll();
  const errorText = useErrorText();
  const opened =
    open?.kind === "row" ? (p?.rows.find((r) => r.staffId === open.staffId) ?? null) : null;

  const download = (format: "csv" | "xlsx") => {
    exp.mutate(
      { month, format, locale },
      {
        onSuccess: (f) => {
          void (f.encoding === "base64"
            ? saveBase64File(f.fileName, f.mimeType, f.content)
            : saveTextFile(f.fileName, f.mimeType, f.content));
        },
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}>
      <PageHeader
        title={t("pages.payroll.title")}
        subtitle={t("payroll.subtitle")}
        workspace={ws}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <MonthSwitcher testID="crm-payroll-month" month={month} onChange={setMonth} />
        {p ? (
          <Pill
            tone={p.status === "closed" ? "up" : "neutral"}
            label={
              p.status === "closed" && p.closedAt
                ? t("payroll.closedOn", {
                    date: formatDateLong(new Date(p.closedAt), locale, summary?.timezone),
                  })
                : t(`payroll.status.${p.status}`)
            }
          />
        ) : null}
        <View style={{ flex: 1 }} />
        {p && p.rows.length ? (
          <>
            <CalmButton
              size="sm"
              variant="secondary"
              label={t("payroll.exportCsv")}
              onPress={() => {
                download("csv");
              }}
            />
            <CalmButton
              size="sm"
              variant="secondary"
              label={t("payroll.exportXlsx")}
              onPress={() => {
                download("xlsx");
              }}
            />
          </>
        ) : null}
        {p && canManage && p.status === "open" && p.phase !== "future" && p.rows.length ? (
          <CalmButton
            testID="crm-payroll-close"
            icon="check"
            label={t("payroll.close")}
            onPress={() => {
              setOpen({ kind: "close" });
            }}
          />
        ) : null}
        {p && canManage && p.status === "closed" ? (
          <CalmButton
            testID="crm-payroll-reopen"
            size="sm"
            variant="ghost"
            label={t("payroll.reopen")}
            onPress={() => {
              setOpen({ kind: "reopen" });
            }}
          />
        ) : null}
      </View>
      <Note testID="crm-payroll-note" text={t("payroll.estimateNote")} />
      <ErrorBanner text={errorText(close.error ?? exp.error)} />

      {q.isPending ? (
        <CalmCard>
          <SkeletonRows />
        </CalmCard>
      ) : q.isError ? (
        <CalmCard>
          <RetryError
            text={t("payroll.loadError")}
            onRetry={() => {
              void q.refetch();
            }}
          />
        </CalmCard>
      ) : q.data.forbidden ? (
        <EmptyState
          testID="crm-payroll-forbidden"
          icon="wallet"
          title={t("payroll.forbiddenTitle")}
          body={t("payroll.forbiddenBody")}
        />
      ) : !p || p.rows.length === 0 ? (
        <EmptyState
          testID="crm-payroll-empty"
          icon="team"
          title={t("payroll.emptyTitle")}
          body={t("payroll.emptyBody")}
        />
      ) : (
        <PayrollTable
          p={p}
          mobile={mobile}
          onOpen={(staffId) => {
            setOpen({ kind: "row", staffId });
          }}
        />
      )}

      {canManage && p ? <PayrollSettingsCard month={month} /> : null}

      {opened && p ? (
        <StaffPayrollSheet
          key={opened.staffId}
          month={month}
          row={opened}
          payroll={p}
          canManage={canManage}
          onSetPay={() => {
            setOpen({ kind: "pay", staffId: opened.staffId, name: opened.displayName });
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === "pay" ? (
        <PaySheet
          staffId={open.staffId}
          name={open.name}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        testID="crm-payroll-close-confirm"
        open={open?.kind === "close"}
        title={t("payroll.closeTitle", { month: formatMonth(month, locale) })}
        body={`${t("payroll.closeBody")}${p?.phase === "current" ? `\n\n${t("payroll.closeEarly")}` : ""}`}
        confirmLabel={t("payroll.close")}
        cancelLabel={t("common.cancel")}
        busy={close.isPending}
        onConfirm={() => {
          close.mutate(month, {
            onSettled: () => {
              setOpen(null);
            },
          });
        }}
        onCancel={() => {
          setOpen(null);
        }}
      />
      {open?.kind === "reopen" ? (
        <ReopenSheet
          month={month}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function PayrollTable({
  p,
  mobile,
  onOpen,
}: {
  p: PayrollMonth;
  mobile: boolean;
  onOpen: (id: string) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const vnd = (n: number) => formatVND(n, locale);
  const adj = (r: Pick<PayrollRow, "bonus" | "deduction" | "advance">) =>
    r.bonus - r.deduction - r.advance;
  const detail = (r: PayrollRow) =>
    r.baseType === null
      ? t("payroll.noPay")
      : r.baseType === "monthly"
        ? t("payroll.baseDetail.monthly", { days: r.employedDays, dim: daysIn(p.month) })
        : r.baseType === "daily"
          ? t("payroll.baseDetail.daily", { count: r.workingDays })
          : r.baseType === "hourly"
            ? t("payroll.baseDetail.hourly", { hours: Math.round(r.workMinutes / 6) / 10 })
            : t("payroll.baseDetail.none");
  const cols = [
    t("payroll.columns.base"),
    t("payroll.columns.commission"),
    t("payroll.columns.adjustments"),
    t("payroll.columns.total"),
  ];
  return (
    <CalmCard testID="crm-payroll-table" style={{ gap: 4 }}>
      {mobile ? null : (
        <View style={{ flexDirection: "row", gap: 8, paddingBottom: 6 }}>
          <Text size={12} color={c.muted} style={{ flex: 2 }}>
            {t("payroll.columns.person")}
          </Text>
          {cols.map((h) => (
            <Text key={h} size={12} color={c.muted} style={{ flex: 1, textAlign: "right" }}>
              {h}
            </Text>
          ))}
        </View>
      )}
      {p.rows.map((r) => (
        <Pressable
          key={r.staffId}
          testID={`crm-payroll-row-${r.staffId}`}
          accessibilityRole="button"
          onPress={() => {
            onOpen(r.staffId);
          }}
          style={{
            flexDirection: mobile ? "column" : "row",
            alignItems: mobile ? "stretch" : "center",
            gap: mobile ? 4 : 8,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderColor: c.line,
            minHeight: 44,
          }}
        >
          <View style={{ flex: 2, gap: 2 }}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Text role="uiSemiBold" size={15} color={c.ink}>
                {r.displayName}
              </Text>
              {r.removed ? <Pill size={10} label={t("payroll.removed")} /> : null}
              {r.paidOn ? <Pill size={10} tone="up" label={t("payroll.columns.paid")} /> : null}
              {r.baseType === null ? (
                <Pill size={10} tone="down" label={t("payroll.noPay")} />
              ) : null}
            </View>
            <Text size={12} color={c.muted}>
              {[
                r.baseType ? t(`payroll.baseType.${r.baseType}`) : null,
                detail(r),
                t("payroll.services", { count: r.commissionLines }),
              ]
                .filter(Boolean)
                .join(DOT)}
            </Text>
          </View>
          {[vnd(r.base), vnd(r.commission), signedVnd(adj(r), locale)].map((v, i) => (
            <Text
              key={i}
              size={14}
              color={c.body}
              style={{ flex: 1, textAlign: mobile ? "left" : "right" }}
            >
              {mobile ? `${cols[i] ?? ""}: ${v}` : v}
            </Text>
          ))}
          <View style={{ flex: 1, alignItems: mobile ? "flex-start" : "flex-end" }}>
            <Text role="uiSemiBold" size={16} color={c.ink}>
              {mobile ? `${cols[3] ?? ""}: ${vnd(r.total)}` : vnd(r.total)}
            </Text>
            {r.projectedCommission > 0 && p.status === "open" ? (
              <Text size={11} color={c.muted}>
                {t("payroll.projected", { amount: vnd(r.projectedCommission) })}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      <View
        testID="crm-payroll-totals"
        style={{
          flexDirection: mobile ? "column" : "row",
          gap: 8,
          paddingTop: 12,
          borderTopWidth: 2,
          borderColor: c.line,
        }}
      >
        <Text role="uiSemiBold" size={15} color={c.ink} style={{ flex: 2 }}>
          {t("payroll.totals")}
        </Text>
        {[vnd(p.totals.base), vnd(p.totals.commission), vnd(adj(p.totals))].map((v, i) => (
          <Text
            key={i}
            size={14}
            color={c.body}
            style={{ flex: 1, textAlign: mobile ? "left" : "right" }}
          >
            {mobile ? `${cols[i] ?? ""}: ${v}` : v}
          </Text>
        ))}
        <Text
          role="uiSemiBold"
          size={16}
          color={c.ink}
          style={{ flex: 1, textAlign: mobile ? "left" : "right" }}
        >
          {mobile ? `${cols[3] ?? ""}: ${vnd(p.totals.total)}` : vnd(p.totals.total)}
        </Text>
      </View>
    </CalmCard>
  );
}

const daysIn = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

function ReopenSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const reopen = useReopenMonth();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("payroll.reopenTitle", { month: formatMonth(month, locale) })}
      footer={
        <>
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID="crm-payroll-reopen-confirm"
            label={t("payroll.reopen")}
            onPress={() => {
              setTouched(true);
              if (!reason.trim()) return;
              reopen.mutate({ month, reason: reason.trim() }, { onSuccess: onClose });
            }}
          />
        </>
      }
    >
      <ErrorBanner text={errorText(reopen.error)} />
      <Text size={14} color={c.body}>
        {t("payroll.reopenBody")}
      </Text>
      <Field
        label={t("payroll.reopenReason")}
        error={touched && !reason.trim() ? t("common.required") : null}
      >
        <Input
          testID="crm-payroll-reopen-reason"
          label={t("payroll.reopenReason")}
          value={reason}
          onChangeText={setReason}
        />
      </Field>
    </Sheet>
  );
}

/** Commission base (from the viewed month) and which managers may see payroll (owner only). */
function PayrollSettingsCard({ month }: { month: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { can } = useSalon();
  const q = usePayrollSettings();
  const s = q.data?.data ?? null;
  const base = useSaveCommissionBase();
  const access = useManagerAccess();
  const errorText = useErrorText();
  if (!s) return null;
  return (
    <CalmCard testID="crm-payroll-settings" style={{ gap: 12 }}>
      <SectionTitle text={t("payroll.settings.title")} />
      <ErrorBanner text={errorText(base.error ?? access.error)} />
      <Field
        label={t("payroll.settings.commissionBase")}
        hint={`${t(`payroll.settings.basesHint.${s.commissionBase}`)} ${t("payroll.settings.baseFrom")}`}
      >
        <Segmented
          value={s.commissionBase}
          onChange={(v) => {
            base.mutate({ base: v, effectiveFrom: `${month}-01` });
          }}
          options={COMMISSION_BASE_VALUES.map((id) => ({
            id,
            label: t(`payroll.settings.bases.${id}`),
          }))}
        />
      </Field>
      {can("members.roles.write") ? (
        <View style={{ gap: 6 }}>
          <Text role="uiMedium" size={14} color={c.ink}>
            {t("payroll.settings.managerAccess")}
          </Text>
          <Text size={12} color={c.muted}>
            {t("payroll.settings.managerAccessHint")}
          </Text>
          {s.managers.length === 0 ? (
            <Text size={13} color={c.muted}>
              {t("payroll.settings.noManagers")}
            </Text>
          ) : (
            s.managers.map((m) => (
              <SettingRow key={m.memberId} title={m.displayName}>
                <Toggle
                  value={m.granted}
                  label={t("payroll.settings.managerAccess")}
                  onChange={(granted) => {
                    access.mutate({ memberId: m.memberId, granted });
                  }}
                />
              </SettingRow>
            ))
          )}
        </View>
      ) : null}
    </CalmCard>
  );
}
