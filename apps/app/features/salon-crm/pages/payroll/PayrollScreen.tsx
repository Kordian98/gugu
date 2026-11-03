import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { PayrollMonth, PayrollRow } from "@gugu/contracts";
import { formatLocalDate, formatMonth, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";
import { saveBase64File, saveTextFile } from "@/services/files/share";

import { salonDate } from "../../data/dates";
import { useCloseMonth, useExportPayroll, usePayroll, useReopenMonth } from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { useWorkspace } from "../../data/useWorkspace";
import { PageHeader } from "../../shell/PageHeader";
import { useBreakpoint } from "../../shell/useBreakpoint";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import { ConfirmDialog, ErrorBanner, Field, Input, Sheet } from "../../ui/form";
import { BigNumber, StatusChip, Tabs } from "./kit";
import { monthStatus, monthSummary } from "./model";
import { baseDetail, MonthSwitcher, Note, RetryError, signedVnd, SkeletonRows } from "./parts";
import { PaySheet } from "./PaySheet";
import { RatesTab } from "./RatesTab";
import { StaffPayrollSheet } from "./StaffPayrollSheet";

type Tab = "month" | "rates";
type Open =
  | { kind: "row"; staffId: string }
  | { kind: "pay"; staffId: string; name: string }
  | { kind: "close" }
  | { kind: "reopen" }
  | null;

/**
 * "Lương & hoa hồng" (owner; managers only with the owner's grant), redesigned after the owner's
 * review 2026-11-03: two tabs — the month (one clean table, totals in the footer, cards on a
 * phone) and the rates (everyone's pay and commission, bulk changes). One primary action per
 * state, explained in one line. Bookkeeping only: estimates before tax and insurance.
 */
export function PayrollScreen() {
  const { t } = useTranslation("crm");
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const mobile = bp === "mobile";
  const tab: Tab = params.tab === "rates" ? "rates" : "month";
  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 16 }}>
      <PageHeader
        title={t("pages.payroll.title")}
        subtitle={t("payroll.subtitle")}
        workspace={ws}
      />
      <Tabs<Tab>
        testID="crm-payroll-tab"
        value={tab}
        onChange={(v) => {
          router.setParams({ tab: v === "month" ? undefined : v });
        }}
        options={[
          { id: "month", label: t("payroll.tabs.month") },
          { id: "rates", label: t("payroll.tabs.rates") },
        ]}
      />
      {tab === "month" ? <MonthTab mobile={mobile} /> : <RatesTab mobile={mobile} />}
    </ScrollView>
  );
}

function MonthTab({ mobile }: { mobile: boolean }) {
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { summary, can } = useSalon();
  const [month, setMonth] = useState(salonDate(new Date(), summary?.timezone).slice(0, 7));
  const q = usePayroll(month);
  const p = q.data?.data ?? null;
  const canManage = can("payroll.manage");
  const [open, setOpen] = useState<Open>(null);
  const [exporting, setExporting] = useState(false);
  const close = useCloseMonth();
  const exp = useExportPayroll();
  const errorText = useErrorText();
  const opened =
    open?.kind === "row" ? (p?.rows.find((r) => r.staffId === open.staffId) ?? null) : null;
  const status = p ? monthStatus(p) : null;
  const sum = p ? monthSummary(p) : null;
  const vnd = (n: number) => formatVND(n, locale);

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
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <MonthSwitcher testID="crm-payroll-month" month={month} onChange={setMonth} />
        {status ? <StatusChip testID="crm-payroll-status" status={status} /> : null}
        <View style={{ flex: 1 }} />
        {p && p.rows.length ? (
          exporting ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <CalmButton
                variant="secondary"
                label={t("payroll.exportCsv")}
                onPress={() => {
                  download("csv");
                }}
              />
              <CalmButton
                variant="secondary"
                label={t("payroll.exportXlsx")}
                onPress={() => {
                  download("xlsx");
                }}
              />
            </View>
          ) : (
            <CalmButton
              testID="crm-payroll-export"
              variant="ghost"
              icon="upload"
              label={t("payroll.month.export")}
              onPress={() => {
                setExporting(true);
              }}
            />
          )
        ) : null}
      </View>

      {p && status && !q.data?.forbidden ? (
        <StatusLine
          p={p}
          status={status}
          canManage={canManage}
          onClose={() => {
            setOpen({ kind: "close" });
          }}
          onReopen={() => {
            setOpen({ kind: "reopen" });
          }}
        />
      ) : null}
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
        <>
          {sum ? (
            <CalmCard testID="crm-payroll-summary" style={{ gap: 16 }}>
              <View style={{ flexDirection: "row", gap: 28, flexWrap: "wrap" }}>
                <BigNumber
                  testID="crm-payroll-summary-earned"
                  label={t("payroll.month.earned")}
                  value={vnd(sum.earned)}
                  note={t("payroll.month.earnedNote", { count: p.rows.length })}
                />
                {sum.projected > 0 ? (
                  <BigNumber
                    testID="crm-payroll-summary-projected"
                    label={t("payroll.month.projected")}
                    value={`+${vnd(sum.projected)}`}
                    tone="muted"
                    size={24}
                    note={t("payroll.month.projectedNote", { amount: vnd(sum.estimate) })}
                  />
                ) : null}
                <BigNumber
                  testID="crm-payroll-summary-real"
                  label={t("payroll.month.realCost")}
                  value={vnd(sum.realCost)}
                  tone="muted"
                  size={24}
                  note={
                    sum.employerCostSet
                      ? t("payroll.month.realCostNote")
                      : t("payroll.month.realCostNotSet")
                  }
                />
              </View>
            </CalmCard>
          ) : null}
          {mobile ? (
            <PayrollCards
              p={p}
              onOpen={(staffId) => {
                setOpen({ kind: "row", staffId });
              }}
            />
          ) : (
            <PayrollTable
              p={p}
              onOpen={(staffId) => {
                setOpen({ kind: "row", staffId });
              }}
            />
          )}
        </>
      )}
      <Note testID="crm-payroll-note" text={t("payroll.estimateNote")} />

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
    </View>
  );
}

/** One line that says what the month's state means, next to its one action. */
function StatusLine({
  p,
  status,
  canManage,
  onClose,
  onReopen,
}: {
  p: PayrollMonth;
  status: ReturnType<typeof monthStatus>;
  canManage: boolean;
  onClose: () => void;
  onReopen: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { summary } = useSalon();
  const closedDate = p.closedAt
    ? formatLocalDate(salonDate(new Date(p.closedAt), summary?.timezone), locale)
    : "";
  return (
    <View
      testID="crm-payroll-status-line"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.line,
        backgroundColor: c.surface,
      }}
    >
      <Text size={15} color={c.body} style={{ flex: 1, minWidth: 220 }}>
        {t(`payroll.month.explain.${status}`, {
          date: closedDate,
          count: p.rows.filter((r) => r.paidOn !== null).length,
        })}
      </Text>
      {canManage && p.status === "open" && p.phase !== "future" ? (
        <CalmButton
          testID="crm-payroll-close"
          icon="check"
          label={t("payroll.close")}
          onPress={onClose}
        />
      ) : null}
      {canManage && p.status === "closed" ? (
        <CalmButton
          testID="crm-payroll-reopen"
          variant="secondary"
          label={t("payroll.reopen")}
          onPress={onReopen}
        />
      ) : null}
    </View>
  );
}

const adjOf = (r: Pick<PayrollRow, "bonus" | "deduction">) => r.bonus - r.deduction;

function PayrollTable({ p, onOpen }: { p: PayrollMonth; onOpen: (id: string) => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const vnd = (n: number) => formatVND(n, locale);
  const open = p.status === "open";
  const head = (label: string, flex = 1, align: "left" | "right" = "right") => (
    <Text
      role="uiMedium"
      size={13}
      color={c.body}
      style={{ flex, textAlign: align }}
      numberOfLines={2}
    >
      {label}
    </Text>
  );
  const cell = (
    value: string,
    opts: { strong?: boolean; muted?: boolean; size?: number; testID?: string } = {},
  ) => (
    <Text
      testID={opts.testID}
      role={opts.strong ? "uiSemiBold" : "ui"}
      size={opts.size ?? 15}
      color={opts.muted ? c.muted : c.ink}
      style={{ flex: 1, textAlign: "right" }}
    >
      {value}
    </Text>
  );
  return (
    <CalmCard testID="crm-payroll-table" style={{ gap: 0, paddingVertical: 8 }}>
      <View style={{ flexDirection: "row", gap: 12, paddingVertical: 10, alignItems: "flex-end" }}>
        {head(t("payroll.columns.person"), 1.8, "left")}
        {head(t("payroll.columns.base"))}
        {head(t("payroll.table.commission"))}
        {head(t("payroll.table.adjustments"))}
        {head(t("payroll.table.gross"))}
        {head(t("payroll.table.realCost"))}
        {head(t("payroll.columns.total"))}
        <View style={{ width: 18 }} />
      </View>
      {p.rows.map((r) => (
        <Pressable
          key={r.staffId}
          testID={`crm-payroll-row-${r.staffId}`}
          accessibilityRole="button"
          accessibilityLabel={t("payroll.table.openPerson", { name: r.displayName })}
          onPress={() => {
            onOpen(r.staffId);
          }}
          style={(state) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 64,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderColor: c.line,
            backgroundColor: (state as { hovered?: boolean }).hovered
              ? c.surfaceMuted
              : "transparent",
          })}
        >
          <View style={{ flex: 1.8, gap: 3 }}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Text role="uiSemiBold" size={16} color={c.ink}>
                {r.displayName}
              </Text>
              {r.removed ? <Pill size={11} label={t("payroll.removed")} /> : null}
              {r.paidOn ? (
                <Pill
                  size={11}
                  tone="up"
                  label={t("payroll.paidOn", { date: formatLocalDate(r.paidOn, locale) })}
                />
              ) : null}
              {r.baseType === null ? (
                <Pill size={11} tone="down" label={t("payroll.noPay")} />
              ) : null}
            </View>
            <Text size={13} color={c.muted}>
              {baseDetail(r, p.month, t)}
            </Text>
          </View>
          {cell(vnd(r.base))}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text size={15} color={c.ink}>
              {vnd(r.commission)}
            </Text>
            <Text size={12} color={c.muted}>
              {open && r.projectedCommission > 0
                ? t("payroll.table.projected", { amount: vnd(r.projectedCommission) })
                : t("payroll.services", { count: r.commissionLines })}
            </Text>
          </View>
          {cell(signedVnd(adjOf(r), locale), { muted: adjOf(r) === 0 })}
          {cell(vnd(r.gross))}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text size={15} color={r.employerCostSet ? c.ink : c.muted}>
              {vnd(r.realCost)}
            </Text>
            <Text size={12} color={c.muted}>
              {r.employerCostSet
                ? t("payroll.table.employerPart", { amount: vnd(r.employerCost) })
                : t("payroll.table.notSet")}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text role="uiSemiBold" size={17} color={c.ink}>
              {vnd(r.total)}
            </Text>
            {r.advance > 0 ? (
              <Text size={12} color={c.muted}>
                {t("payroll.table.advance", { amount: vnd(r.advance) })}
              </Text>
            ) : null}
          </View>
          <Icon name="chevronRight" size={18} color={c.muted} />
        </Pressable>
      ))}
      <View
        testID="crm-payroll-totals"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 14,
          borderTopWidth: 2,
          borderColor: c.line,
        }}
      >
        <Text role="uiSemiBold" size={16} color={c.ink} style={{ flex: 1.8 }}>
          {t("payroll.totals")}
        </Text>
        {cell(vnd(p.totals.base), { strong: true })}
        {cell(vnd(p.totals.commission), { strong: true })}
        {cell(signedVnd(adjOf(p.totals), locale), { strong: true })}
        {cell(vnd(p.totals.gross), { strong: true })}
        <Text
          testID="crm-payroll-totals-real"
          role="uiSemiBold"
          size={15}
          color={c.ink}
          style={{ flex: 1, textAlign: "right" }}
        >
          {vnd(p.totals.realCost)}
        </Text>
        {cell(vnd(p.totals.total), { strong: true, size: 18 })}
        <View style={{ width: 18 }} />
      </View>
    </CalmCard>
  );
}

/** Phone: one card per person, the amount to hand over big, the parts as label: value lines. */
function PayrollCards({ p, onOpen }: { p: PayrollMonth; onOpen: (id: string) => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const vnd = (n: number) => formatVND(n, locale);
  const line = (label: string, value: string, muted = false) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text size={15} color={c.body}>
        {label}
      </Text>
      <Text size={15} color={muted ? c.muted : c.ink}>
        {value}
      </Text>
    </View>
  );
  return (
    <View testID="crm-payroll-table" style={{ gap: 10 }}>
      {p.rows.map((r) => (
        <Pressable
          key={r.staffId}
          testID={`crm-payroll-row-${r.staffId}`}
          accessibilityRole="button"
          accessibilityLabel={t("payroll.table.openPerson", { name: r.displayName })}
          onPress={() => {
            onOpen(r.staffId);
          }}
          style={{
            gap: 8,
            padding: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text role="uiSemiBold" size={17} color={c.ink}>
                {r.displayName}
              </Text>
              <Text size={13} color={c.muted}>
                {baseDetail(r, p.month, t)}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={c.muted} />
          </View>
          {r.paidOn || r.baseType === null || r.removed ? (
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {r.paidOn ? (
                <Pill
                  size={12}
                  tone="up"
                  label={t("payroll.paidOn", { date: formatLocalDate(r.paidOn, locale) })}
                />
              ) : null}
              {r.baseType === null ? (
                <Pill size={12} tone="down" label={t("payroll.noPay")} />
              ) : null}
              {r.removed ? <Pill size={12} label={t("payroll.removed")} /> : null}
            </View>
          ) : null}
          <BigNumber label={t("payroll.columns.total")} value={vnd(r.total)} size={26} />
          {line(t("payroll.columns.base"), vnd(r.base))}
          {line(t("payroll.table.commission"), vnd(r.commission))}
          {p.status === "open" && r.projectedCommission > 0
            ? line(t("payroll.month.projected"), `+${vnd(r.projectedCommission)}`, true)
            : null}
          {adjOf(r) !== 0
            ? line(t("payroll.table.adjustments"), signedVnd(adjOf(r), locale))
            : null}
          {r.advance > 0
            ? line(t("payroll.adjustments.kind.advance"), signedVnd(-r.advance, locale))
            : null}
          {line(t("payroll.table.realCost"), vnd(r.realCost), !r.employerCostSet)}
        </Pressable>
      ))}
      <View
        testID="crm-payroll-totals"
        style={{ gap: 6, padding: 16, borderRadius: 18, backgroundColor: c.surfaceMuted }}
      >
        <Text role="uiSemiBold" size={16} color={c.ink}>
          {t("payroll.totals")}
        </Text>
        {line(t("payroll.table.gross"), vnd(p.totals.gross))}
        {line(t("payroll.table.realCost"), vnd(p.totals.realCost))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text role="uiSemiBold" size={16} color={c.ink}>
            {t("payroll.columns.total")}
          </Text>
          <Text role="uiSemiBold" size={18} color={c.ink}>
            {vnd(p.totals.total)}
          </Text>
        </View>
      </View>
    </View>
  );
}

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
      <Text size={15} color={c.body}>
        {t("payroll.reopenBody")}
      </Text>
      <Field
        label={t("payroll.reopenReason")}
        error={touched && !reason.trim() ? t("payroll.validation.reasonRequired") : null}
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
