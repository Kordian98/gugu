import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { CalmButton, checkableA11y, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { BasePayTypeValue, CommissionOverride, PayVersion, Service } from "@gugu/contracts";
import { formatLocalDate, formatPercentPoints, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useServices } from "../../data/catalog";
import { salonDate } from "../../data/dates";
import { useSaveStaffPay, useStaffPay } from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Input, Sheet } from "../../ui/form";
import {
  BigMoneyInput,
  BigPercentInput,
  BigSegmented,
  EffectiveFrom,
  UndoBar,
  useUndo,
} from "./kit";
import {
  amountLooksOff,
  BASE_TYPE_ORDER,
  EMPLOYER_KINDS,
  employerCostOf,
  exampleCommission,
  type PayDraft,
  RATE_KINDS,
  validatePay,
} from "./model";
import { SectionTitle } from "./parts";

type Override = PayDraft["overrides"][number] & { variantId: string | null };
type EmployerKind = PayDraft["employerCost"]["kind"];

const QUICK_PERCENT = [0, 5, 10, 15, 20, 30, 40];
const EXAMPLE_PRICE = 200_000;

export const serviceName = (n: { vi: string; en?: string | null }, locale: "vi" | "en") =>
  (locale === "en" && n.en) || n.vi;

/** "8.000.000đ/tháng" · "Chỉ hoa hồng" — the base part of a pay summary. */
export function baseSummary(
  v: Pick<PayVersion, "baseType" | "baseAmount">,
  t: TFunction<"crm">,
  locale: "vi" | "en",
): string {
  return v.baseType === "none"
    ? t("payroll.summary.none")
    : t(`payroll.summary.${v.baseType}`, { amount: formatVND(v.baseAmount, locale) });
}

/** One line a person's pay reads as: "8.000.000đ/tháng + 10% hoa hồng". */
export function paySummary(v: PayVersion | null, t: TFunction<"crm">, locale: "vi" | "en"): string {
  if (!v) return t("payroll.noPay");
  const percent = formatPercentPoints(v.commissionPercent, locale);
  return v.baseType === "none"
    ? t("payroll.summary.commissionOnly", { percent })
    : t("payroll.summary.withCommission", { base: baseSummary(v, t, locale), percent });
}

/**
 * Pay & commission of one person in ONE sheet (owner review 2026-11-03): base type as a segmented
 * control, a big VND amount, a big default %, a simple table of own rates per service, the
 * optional real cost, and "from when" with a one-line preview. Saving creates a version from that
 * date; earlier months keep their figures. No nested dialogs.
 */
export function PaySheet({
  staffId,
  name,
  onClose,
}: {
  staffId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("crm");
  const q = useStaffPay(staffId);
  const pay = q.data?.data ?? null;
  return pay ? (
    <PayForm
      key={staffId}
      staffId={staffId}
      name={name}
      current={pay.current}
      versions={pay.versions}
      onDone={onClose}
    />
  ) : (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("payroll.sheet.title", { name })}
    >
      <ActivityIndicator />
    </Sheet>
  );
}

function PayForm({
  staffId,
  name,
  current,
  versions,
  onDone,
}: {
  staffId: string;
  name: string;
  current: PayVersion | null;
  versions: PayVersion[];
  onDone: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const { summary } = useSalon();
  const today = salonDate(new Date(), summary?.timezone);
  const services = (useServices().data?.items ?? []).filter((s) => s.isActive);
  const save = useSaveStaffPay();
  const undo = useUndo();
  const [baseType, setBaseType] = useState<BasePayTypeValue>(current?.baseType ?? "monthly");
  const [amount, setAmount] = useState<number | null>(current?.baseAmount || null);
  const [percent, setPercent] = useState<number | null>(current?.commissionPercent ?? 10);
  // First setup: from the 1st of this month (the usual case); a change: from today.
  const [from, setFrom] = useState(current ? today : `${today.slice(0, 8)}01`);
  const [overrides, setOverrides] = useState<Override[]>(current?.overrides ?? []);
  const [employer, setEmployer] = useState<PayDraft["employerCost"]>(() => {
    const e = current?.employerCost ?? null;
    return e === null
      ? { kind: "none", percent: null, amount: null }
      : e.kind === "percent"
        ? { kind: "percent", percent: e.percent, amount: null }
        : { kind: "fixed", percent: null, amount: e.amount };
  });
  const [touched, setTouched] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const draft: PayDraft = { baseType, amount, percent, overrides, employerCost: employer };
  const errors = validatePay(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const off = amountLooksOff(baseType, amount);
  const vnd = (n: number) => formatVND(n, locale);
  const nextScheduled = [...versions].reverse().find((v) => v.effectiveFrom > today) ?? null;

  const submit = () => {
    setTouched(true);
    if (hasErrors) return;
    save.mutate(
      {
        staffId,
        body: {
          effectiveFrom: from,
          baseType,
          baseAmount: baseType === "none" ? 0 : (amount ?? 0),
          commissionPercent: percent ?? 0,
          overrides: overrides.map((o): CommissionOverride => ({
            serviceId: o.serviceId,
            variantId: o.variantId,
            kind: o.kind,
            percent: o.kind === "percent" ? o.percent : null,
            amount: o.kind === "fixed" ? o.amount : null,
          })),
          employerCost: employerCostOf(employer),
        },
      },
      { onSuccess: onDone },
    );
  };
  const err = (k: keyof ReturnType<typeof validatePay>) => {
    const code = errors[k];
    return touched && code ? t(`payroll.validation.${code}`) : null;
  };

  return (
    <Sheet
      open
      onClose={onDone}
      closeLabel={t("common.close")}
      title={t("payroll.sheet.title", { name })}
      footer={
        <>
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onDone} />
          <CalmButton
            testID="crm-pay-save"
            label={save.isPending ? t("common.saving") : t("payroll.sheet.save")}
            onPress={submit}
          />
        </>
      }
    >
      <ErrorBanner text={errorText(save.error)} />
      {touched && hasErrors ? <ErrorBanner text={t("payroll.validation.fixBelow")} /> : null}
      <View
        testID="crm-pay-current"
        style={{ gap: 4, padding: 14, borderRadius: 14, backgroundColor: c.accentSoft }}
      >
        <Text size={13} color={c.body}>
          {t("payroll.sheet.now")}
        </Text>
        <Text role="uiSemiBold" size={17} color={c.ink}>
          {paySummary(current, t, locale)}
        </Text>
        {nextScheduled ? (
          <Text size={13} color={c.body}>
            {t("payroll.sheet.scheduled", {
              date: formatLocalDate(nextScheduled.effectiveFrom, locale),
              summary: paySummary(nextScheduled, t, locale),
            })}
          </Text>
        ) : null}
      </View>

      <Block title={t("payroll.sheet.base")}>
        <BigSegmented<BasePayTypeValue>
          testID="crm-pay-type"
          label={t("payroll.sheet.base")}
          value={baseType}
          onChange={setBaseType}
          options={BASE_TYPE_ORDER.map((id) => ({ id, label: t(`payroll.baseType.${id}`) }))}
        />
        {baseType !== "none" ? (
          <View style={{ gap: 6 }}>
            <Text role="uiMedium" size={15} color={c.ink}>
              {t(`payroll.pay.amount.${baseType}`)}
            </Text>
            <BigMoneyInput
              testID="crm-pay-amount"
              label={t(`payroll.pay.amount.${baseType}`)}
              value={amount}
              onChange={setAmount}
              invalid={err("amount") !== null}
            />
            <Hint
              error={err("amount")}
              warn={off ? t(`payroll.validation.amount_${off}`) : null}
              text={t(`payroll.pay.amountHint.${baseType}`)}
            />
          </View>
        ) : (
          <Text size={14} color={c.body}>
            {t("payroll.sheet.noneHint")}
          </Text>
        )}
      </Block>

      <Block title={t("payroll.sheet.commission")}>
        <BigPercentInput
          testID="crm-pay-percent"
          label={t("payroll.sheet.commission")}
          value={percent}
          onChange={setPercent}
          quick={QUICK_PERCENT}
          invalid={err("percent") !== null}
        />
        <Hint
          error={err("percent")}
          text={t("payroll.sheet.example", {
            price: vnd(EXAMPLE_PRICE),
            amount: vnd(
              exampleCommission({ kind: "percent", percent: percent ?? 0 }, EXAMPLE_PRICE),
            ),
          })}
        />
      </Block>

      <Block title={t("payroll.sheet.overrides")} hint={t("payroll.sheet.overridesHint")}>
        <OverridesTable
          rows={overrides}
          services={services}
          touched={touched}
          errors={errors}
          onChange={setOverrides}
          onRemoved={(row, index) => {
            undo.show(
              t("payroll.undo.overrideRemoved", { name: labelOf(services, row, locale) }),
              () => {
                setOverrides((now) => [...now.slice(0, index), row, ...now.slice(index)]);
              },
            );
          }}
          defaultPercent={percent ?? 0}
        />
        <UndoBar state={undo.state} onDismiss={undo.dismiss} />
      </Block>

      <Block title={t("payroll.employer.title")} hint={t("payroll.employer.hint")}>
        <BigSegmented<EmployerKind>
          testID="crm-pay-employer"
          label={t("payroll.employer.title")}
          value={employer.kind}
          onChange={(kind) => {
            setEmployer((e) => ({ ...e, kind }));
          }}
          options={EMPLOYER_KINDS.map((id) => ({
            id,
            label: t(`payroll.employer.kind.${id}`),
          }))}
        />
        {employer.kind === "percent" ? (
          <BigPercentInput
            testID="crm-pay-employer-percent-input"
            label={t("payroll.employer.kind.percent")}
            value={employer.percent}
            onChange={(p) => {
              setEmployer((e) => ({ ...e, percent: p }));
            }}
            invalid={err("employer") !== null}
            size="md"
          />
        ) : employer.kind === "fixed" ? (
          <BigMoneyInput
            testID="crm-pay-employer-amount-input"
            label={t("payroll.employer.kind.fixed")}
            value={employer.amount}
            onChange={(a) => {
              setEmployer((e) => ({ ...e, amount: a }));
            }}
            invalid={err("employer") !== null}
            size="md"
          />
        ) : null}
        <Hint
          error={err("employer")}
          text={
            employer.kind === "none"
              ? t("payroll.employer.noneHint")
              : baseType === "monthly" && amount && employer.kind === "percent"
                ? t("payroll.employer.example", {
                    gross: vnd(amount),
                    real: vnd(amount + Math.round((amount * (employer.percent ?? 0)) / 100)),
                  })
                : t("payroll.employer.accountant")
          }
        />
      </Block>

      <Block title={t("payroll.sheet.from")}>
        <EffectiveFrom testID="crm-pay-from" value={from} onChange={setFrom} today={today} />
      </Block>

      {versions.length ? (
        <View style={{ gap: 6 }}>
          <Pressable
            testID="crm-pay-history-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: showHistory }}
            onPress={() => {
              setShowHistory((s) => !s);
            }}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon name={showHistory ? "chevronUp" : "chevronDown"} size={16} color={c.body} />
            <Text role="uiMedium" size={14} color={c.body}>
              {t("payroll.sheet.history", { count: versions.length })}
            </Text>
          </Pressable>
          {showHistory
            ? versions.map((v) => (
                <View
                  key={v.id}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderColor: c.line,
                    flexWrap: "wrap",
                  }}
                >
                  <Text role="uiMedium" size={14} color={c.ink} style={{ minWidth: 110 }}>
                    {t("payroll.pay.historyItem", {
                      date: formatLocalDate(v.effectiveFrom, locale),
                    })}
                  </Text>
                  <Text size={14} color={c.body} style={{ flex: 1 }}>
                    {paySummary(v, t, locale)}
                  </Text>
                  {v.id === current?.id ? (
                    <Pill size={11} tone="accent" label={t("payroll.pay.current")} />
                  ) : v.effectiveFrom > today ? (
                    <Pill size={11} label={t("payroll.sheet.upcoming")} />
                  ) : null}
                </View>
              ))
            : null}
        </View>
      ) : null}
    </Sheet>
  );
}

export function labelOf(
  services: Service[],
  o: { serviceId: string; variantId: string | null },
  locale: "vi" | "en",
): string {
  const s = services.find((x) => x.id === o.serviceId);
  if (!s) return "";
  const v = o.variantId ? s.variants.find((x) => x.id === o.variantId) : null;
  return v
    ? `${serviceName(s.name, locale)} · ${serviceName(v.name, locale)}`
    : serviceName(s.name, locale);
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      <View style={{ gap: 2 }}>
        <SectionTitle text={title} />
        {hint ? (
          <Text size={13} color={c.muted}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Error (icon + text), soft warning, or the normal hint under a field. */
export function Hint({
  error,
  warn,
  text,
}: {
  error?: string | null;
  warn?: string | null;
  text?: string | null;
}) {
  const { c } = useCalm();
  if (error)
    return (
      <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
        <Icon name="alert" size={14} color={c.attention} />
        <Text size={13} color={c.attention} style={{ flex: 1 }}>
          {error}
        </Text>
      </View>
    );
  if (warn)
    return (
      <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
        <Icon name="info" size={14} color={c.body} />
        <Text size={13} color={c.body} style={{ flex: 1 }}>
          {warn}
        </Text>
      </View>
    );
  return text ? (
    <Text size={13} color={c.muted}>
      {text}
    </Text>
  ) : null;
}

/**
 * Own rates as a simple table: service → % or đ → value, inline edit, remove (with undo), and an
 * inline service picker to add one (no nested dialog).
 */
function OverridesTable({
  rows,
  services,
  touched,
  errors,
  onChange,
  onRemoved,
  defaultPercent,
}: {
  rows: Override[];
  services: Service[];
  touched: boolean;
  errors: ReturnType<typeof validatePay>;
  onChange: (rows: Override[]) => void;
  onRemoved: (row: Override, index: number) => void;
  defaultPercent: number;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [picking, setPicking] = useState(false);
  const taken = new Set(rows.map((r) => `${r.serviceId}:${r.variantId ?? ""}`));
  const update = (i: number, patch: Partial<Override>) => {
    onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  return (
    <View testID="crm-pay-overrides" style={{ gap: 8 }}>
      {rows.length === 0 ? (
        <Text size={14} color={c.body}>
          {t("payroll.sheet.noOverrides", {
            percent: formatPercentPoints(defaultPercent, locale),
          })}
        </Text>
      ) : (
        rows.map((o, i) => {
          const name = labelOf(services, o, locale) || t("payroll.sheet.unknownService");
          const bad = touched && errors[`override:${String(i)}`] !== undefined;
          return (
            <View
              key={`${o.serviceId}:${o.variantId ?? ""}`}
              testID={`crm-pay-override-${String(i)}`}
              style={{
                gap: 8,
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: bad ? c.attention : c.line,
                backgroundColor: c.surface,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text
                  role="uiSemiBold"
                  size={15}
                  color={c.ink}
                  style={{ flex: 1 }}
                  numberOfLines={2}
                >
                  {name}
                </Text>
                <Pressable
                  testID={`crm-pay-override-remove-${String(i)}`}
                  accessibilityRole="button"
                  accessibilityLabel={t("payroll.sheet.removeOverride", { name })}
                  onPress={() => {
                    onChange(rows.filter((_, j) => j !== i));
                    onRemoved(o, i);
                  }}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="trash" size={18} color={c.body} />
                </Pressable>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}
              >
                <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 4 }}>
                  {RATE_KINDS.map((k) => (
                    <KindButton
                      key={k}
                      testID={`crm-pay-override-kind-${String(i)}-${k}`}
                      label={t(`payroll.sheet.kind.${k}`)}
                      on={o.kind === k}
                      onPress={() => {
                        update(i, { kind: k });
                      }}
                    />
                  ))}
                </View>
                {o.kind === "percent" ? (
                  <BigPercentInput
                    testID={`crm-pay-override-percent-${String(i)}`}
                    size="md"
                    label={name}
                    value={o.percent}
                    onChange={(p) => {
                      update(i, { percent: p });
                    }}
                    invalid={bad}
                  />
                ) : (
                  <View style={{ width: 170 }}>
                    <BigMoneyInput
                      testID={`crm-pay-override-amount-${String(i)}`}
                      size="md"
                      label={name}
                      value={o.amount}
                      onChange={(a) => {
                        update(i, { amount: a });
                      }}
                      invalid={bad}
                    />
                  </View>
                )}
              </View>
              {bad ? (
                <Hint error={t("payroll.validation.overrideRequired")} />
              ) : o.kind === "fixed" ? (
                <Hint text={t("payroll.sheet.fixedHint")} />
              ) : null}
            </View>
          );
        })
      )}
      {picking ? (
        <ServicePicker
          services={services}
          taken={taken}
          onPick={(serviceId, variantId) => {
            onChange([
              ...rows,
              { serviceId, variantId, kind: "percent", percent: defaultPercent, amount: null },
            ]);
            setPicking(false);
          }}
          onCancel={() => {
            setPicking(false);
          }}
        />
      ) : services.length ? (
        <View style={{ alignSelf: "flex-start" }}>
          <CalmButton
            testID="crm-pay-add-override"
            variant="secondary"
            icon="plus"
            label={t("payroll.sheet.addOverride")}
            onPress={() => {
              setPicking(true);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

export function KindButton({
  label,
  on,
  onPress,
  testID,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  testID?: string | undefined;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      {...checkableA11y("radio", on)}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        minWidth: 52,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: on ? c.accentBg : c.line,
        backgroundColor: on ? c.accentSoft : c.surface,
      }}
    >
      <Text role={on ? "uiSemiBold" : "ui"} size={15} color={on ? c.accent : c.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

const plain = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");

/** Inline searchable list of services (and their variants) — replaces a nested select dialog. */
export function ServicePicker({
  services,
  taken,
  onPick,
  onCancel,
  multiple,
  picked,
}: {
  services: Service[];
  taken: Set<string>;
  onPick: (serviceId: string, variantId: string | null) => void;
  onCancel: () => void;
  multiple?: boolean;
  picked?: Set<string>;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = plain(query.trim());
    return q ? services.filter((s) => plain(serviceName(s.name, locale)).includes(q)) : services;
  }, [query, services, locale]);
  const row = (serviceId: string, variantId: string | null, label: string, sub: boolean) => {
    const k = `${serviceId}:${variantId ?? ""}`;
    const isTaken = taken.has(k);
    const on = picked?.has(k) ?? false;
    return (
      <Pressable
        key={k}
        testID={`crm-pick-service-${serviceId}${variantId ? `-${variantId}` : ""}`}
        accessibilityRole={multiple ? "checkbox" : "button"}
        {...(multiple ? checkableA11y("checkbox", on) : {})}
        accessibilityLabel={label}
        disabled={isTaken}
        onPress={() => {
          onPick(serviceId, variantId);
        }}
        style={{
          minHeight: 44,
          paddingLeft: sub ? 28 : 12,
          paddingRight: 12,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: on ? c.accentSoft : "transparent",
          opacity: isTaken ? 0.5 : 1,
        }}
      >
        {multiple ? (
          <Icon name={on ? "check" : "plus"} size={14} color={on ? c.accent : c.body} />
        ) : null}
        <Text size={15} color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {isTaken ? (
          <Text size={12} color={c.muted}>
            {t("payroll.sheet.alreadyAdded")}
          </Text>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View
      testID="crm-service-picker"
      style={{ gap: 6, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: c.accentBg }}
    >
      <Input
        testID="crm-service-picker-search"
        label={t("payroll.sheet.searchService")}
        placeholder={t("payroll.sheet.searchService")}
        value={query}
        onChangeText={setQuery}
      />
      <View>
        {shown.length === 0 ? (
          <Text size={14} color={c.muted} style={{ padding: 12 }}>
            {t("payroll.sheet.noServiceMatch")}
          </Text>
        ) : (
          shown.map((s) => (
            <View key={s.id}>
              {row(s.id, null, serviceName(s.name, locale), false)}
              {s.variants.map((v) =>
                row(
                  s.id,
                  v.id,
                  t("payroll.sheet.variantOnly", { name: serviceName(v.name, locale) }),
                  true,
                ),
              )}
            </View>
          ))
        )}
      </View>
      <View style={{ alignSelf: "flex-end" }}>
        <CalmButton
          variant="ghost"
          label={multiple ? t("payroll.sheet.donePicking") : t("common.cancel")}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}
