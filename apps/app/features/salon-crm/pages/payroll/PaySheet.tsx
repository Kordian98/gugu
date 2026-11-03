import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { CalmButton, Pill, Text, useCalm } from "@gugu/design-system";
import {
  BASE_PAY_TYPE_VALUES,
  type BasePayTypeValue,
  type CommissionOverride,
  type PayVersion,
  type Service,
} from "@gugu/contracts";
import { formatLocalDate, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useServices } from "../../data/catalog";
import { salonDate } from "../../data/dates";
import { useSaveStaffPay, useStaffPay } from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, MoneyInput, Segmented, Select, Sheet } from "../../ui/form";
import { DateField, PercentInput, SectionTitle } from "./parts";

type Override = {
  serviceId: string;
  variantId: string | null;
  kind: "percent" | "fixed";
  percent: number | null;
  amount: number | null;
};

const ALL = "__all__";

/** One line of the base pay summary: "9.000.000đ / tháng · hoa hồng 10%". */
export function paySummary(v: PayVersion | null, t: TFunction<"crm">, locale: "vi" | "en"): string {
  if (!v) return t("payroll.noPay");
  const base =
    v.baseType === "none"
      ? t("payroll.baseType.none")
      : `${formatVND(v.baseAmount, locale)} · ${t(`payroll.baseType.${v.baseType}`)}`;
  return t("payroll.pay.summary", { base, percent: v.commissionPercent });
}

/**
 * Pay & commission of one person (owner, payroll.manage): base pay type + amount, default
 * commission %, per-service/variant overrides, effective from a date. Saving creates a new
 * version; earlier months keep their figures (history listed below).
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
  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={`${name} · ${t("payroll.pay.title")}`}
    >
      {q.isPending || !pay ? (
        <ActivityIndicator />
      ) : (
        <PayForm
          key={pay.current?.id ?? "new"}
          staffId={staffId}
          current={pay.current}
          versions={pay.versions}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function PayForm({
  staffId,
  current,
  versions,
  onDone,
}: {
  staffId: string;
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
  const [baseType, setBaseType] = useState<BasePayTypeValue>(current?.baseType ?? "monthly");
  const [amount, setAmount] = useState<number | null>(current?.baseAmount ?? null);
  const [percent, setPercent] = useState<number | null>(current?.commissionPercent ?? 0);
  // First setup: from the 1st of this month (the usual case); a change: from today.
  const [from, setFrom] = useState(current ? today : `${today.slice(0, 8)}01`);
  const [overrides, setOverrides] = useState<Override[]>(current?.overrides ?? []);
  const [touched, setTouched] = useState(false);
  const needsAmount = baseType !== "none" && (amount === null || amount <= 0);

  const submit = () => {
    setTouched(true);
    if (needsAmount || percent === null) return;
    const body = {
      effectiveFrom: from,
      baseType,
      baseAmount: baseType === "none" ? 0 : (amount ?? 0),
      commissionPercent: percent,
      overrides: overrides
        .filter(
          (o) => o.serviceId && (o.kind === "percent" ? o.percent !== null : o.amount !== null),
        )
        .map((o): CommissionOverride => ({ ...o })),
    };
    save.mutate({ staffId, body }, { onSuccess: onDone });
  };

  return (
    <View style={{ gap: 16 }}>
      <ErrorBanner text={errorText(save.error)} />
      <Field label={t("payroll.pay.baseType")}>
        <Segmented<BasePayTypeValue>
          value={baseType}
          onChange={setBaseType}
          options={BASE_PAY_TYPE_VALUES.map((id) => ({ id, label: t(`payroll.baseType.${id}`) }))}
        />
      </Field>
      {baseType !== "none" ? (
        <Field
          label={t(`payroll.pay.amount.${baseType}`)}
          hint={t(`payroll.pay.amountHint.${baseType}`)}
          error={touched && needsAmount ? t("common.required") : null}
        >
          <MoneyInput
            testID="crm-pay-amount"
            label={t(`payroll.pay.amount.${baseType}`)}
            value={amount}
            onChange={setAmount}
          />
        </Field>
      ) : null}
      <Field label={t("payroll.pay.commission")} hint={t("payroll.pay.commissionHint")}>
        <PercentInput
          testID="crm-pay-percent"
          label={t("payroll.pay.commission")}
          value={percent}
          onChange={setPercent}
        />
      </Field>
      <Field label={t("payroll.pay.effectiveFrom")} hint={t("payroll.pay.effectiveHint")}>
        <DateField testID="crm-pay-from" value={from} onChange={setFrom} today={today} />
      </Field>

      <View style={{ gap: 10 }}>
        <SectionTitle text={t("payroll.pay.overrides")} />
        {overrides.map((o, i) => (
          <OverrideRow
            key={i}
            o={o}
            services={services}
            onChange={(n) => {
              setOverrides(overrides.map((x, j) => (j === i ? n : x)));
            }}
            onRemove={() => {
              setOverrides(overrides.filter((_, j) => j !== i));
            }}
          />
        ))}
        {services.length ? (
          <View style={{ alignSelf: "flex-start" }}>
            <CalmButton
              size="sm"
              variant="secondary"
              icon="plus"
              label={t("payroll.pay.addOverride")}
              onPress={() => {
                setOverrides([
                  ...overrides,
                  {
                    serviceId: services[0]?.id ?? "",
                    variantId: null,
                    kind: "percent",
                    percent: percent ?? 0,
                    amount: null,
                  },
                ]);
              }}
            />
          </View>
        ) : null}
      </View>

      <CalmButton
        testID="crm-pay-save"
        label={save.isPending ? t("common.saving") : t("common.save")}
        onPress={submit}
      />

      {versions.length ? (
        <View style={{ gap: 6 }}>
          <SectionTitle text={t("payroll.pay.history")} />
          {versions.map((v) => (
            <View
              key={v.id}
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                paddingVertical: 6,
                borderTopWidth: 1,
                borderColor: c.line,
                flexWrap: "wrap",
              }}
            >
              <Text role="uiMedium" size={13} color={c.ink} style={{ minWidth: 110 }}>
                {t("payroll.pay.historyItem", { date: formatLocalDate(v.effectiveFrom, locale) })}
              </Text>
              <Text size={13} color={c.body} style={{ flex: 1 }}>
                {paySummary(v, t, locale)}
              </Text>
              {v.id === current?.id ? (
                <Pill size={10} tone="accent" label={t("payroll.pay.current")} />
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text size={13} color={c.muted}>
          {t("payroll.pay.none")}
        </Text>
      )}
    </View>
  );
}

function OverrideRow({
  o,
  services,
  onChange,
  onRemove,
}: {
  o: Override;
  services: Service[];
  onChange: (o: Override) => void;
  onRemove: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const name = (n: { vi: string; en?: string | null }) => (locale === "en" && n.en) || n.vi;
  const svc = services.find((s) => s.id === o.serviceId);
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.line }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 2, minWidth: 180 }}>
          <Select<string>
            label={t("payroll.pay.service")}
            placeholder={t("payroll.pay.service")}
            value={o.serviceId}
            options={services.map((s) => ({ id: s.id, label: name(s.name) }))}
            onChange={(id) => {
              onChange({ ...o, serviceId: id, variantId: null });
            }}
          />
        </View>
        {svc?.variants.length ? (
          <View style={{ flex: 1, minWidth: 140 }}>
            <Select<string>
              label={t("payroll.pay.variant")}
              placeholder={t("payroll.pay.allVariants")}
              value={o.variantId ?? ALL}
              options={[
                { id: ALL, label: t("payroll.pay.allVariants") },
                ...svc.variants.map((v) => ({ id: v.id, label: name(v.name) })),
              ]}
              onChange={(id) => {
                onChange({ ...o, variantId: id === ALL ? null : id });
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Segmented<"percent" | "fixed">
          value={o.kind}
          onChange={(kind) => {
            onChange({ ...o, kind });
          }}
          options={(["percent", "fixed"] as const).map((id) => ({
            id,
            label: t(`payroll.pay.rateKind.${id}`),
          }))}
        />
        {o.kind === "percent" ? (
          <PercentInput
            label={t("payroll.pay.rateKind.percent")}
            value={o.percent}
            onChange={(percent) => {
              onChange({ ...o, percent });
            }}
          />
        ) : (
          <View style={{ width: 140 }}>
            <MoneyInput
              label={t("payroll.pay.rateKind.fixed")}
              value={o.amount}
              onChange={(amount) => {
                onChange({ ...o, amount });
              }}
            />
          </View>
        )}
        <CalmButton
          size="sm"
          variant="ghost"
          icon="trash"
          label={t("payroll.pay.removeOverride")}
          onPress={onRemove}
        />
      </View>
    </View>
  );
}
