import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, Text, useCalm } from "@gugu/design-system";
import type { CommissionBulkInput, PayrollSettings, Service } from "@gugu/contracts";
import { formatPercentPoints, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { usePayrollSettings } from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { BigPercentInput } from "../payroll/kit";
import { effectiveRate, type Rate, SOURCE_DEFAULT, SOURCE_SERVICE } from "../payroll/model";
import { SectionTitle } from "../payroll/parts";
import { serviceName } from "../payroll/PaySheet";
import { RateEditor } from "../payroll/RatesTab";

/** Staged per person: a rate of their own, or `null` = back to their default %. */
export type CommissionDrafts = Map<string, Rate | null>;

/**
 * Bulk requests that apply the staged commission changes of one service (from `today`), one per
 * distinct rate so people with the same new rate are saved together.
 */
export function commissionRequests(
  serviceId: string,
  drafts: CommissionDrafts,
  today: string,
): CommissionBulkInput[] {
  const byRate = new Map<string, { rate: Rate | null; staffIds: string[] }>();
  for (const [staffId, rate] of drafts) {
    const k = rate === null ? "none" : JSON.stringify(rate);
    const g = byRate.get(k) ?? { rate, staffIds: [] };
    g.staffIds.push(staffId);
    byRate.set(k, g);
  }
  return [...byRate.values()].map((g) => ({
    effectiveFrom: today,
    staffIds: g.staffIds,
    change: { target: "override", services: [{ serviceId, variantId: null }], rate: g.rate },
  }));
}

/**
 * "Hoa hồng cho dịch vụ này" in the service editor (owner review 2026-11-03): each person who does
 * the service with what they earn on it (their default % or this service's own rate), changeable
 * inline, plus "same % for everyone". Changes are staged and saved with the service, from today.
 * Owner/managers with payroll access only; hidden otherwise.
 */
export function ServiceCommission({
  service,
  staffIds,
  drafts,
  onChange,
}: {
  service: Service;
  staffIds: string[];
  drafts: CommissionDrafts;
  onChange: (d: CommissionDrafts) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { can } = useSalon();
  const canRead = can("payroll.read");
  const canManage = can("payroll.manage");
  const q = usePayrollSettings(canRead);
  const s: PayrollSettings | null = q.data?.data ?? null;
  const [editing, setEditing] = useState<string | null>(null);
  const [all, setAll] = useState<number | null>(null);
  if (!canRead || !s) return null;
  const people = s.staff.filter(
    (p) =>
      staffIds.includes(p.staffId) || p.current?.overrides.some((o) => o.serviceId === service.id),
  );
  const vnd = (n: number) => formatVND(n, locale);
  const rateText = (r: Rate) =>
    r.kind === "percent"
      ? formatPercentPoints(r.percent, locale)
      : t("payroll.lines.rateFixed", { amount: vnd(r.amount) });
  const set = (id: string, r: Rate | null | undefined) => {
    const n = new Map(drafts);
    if (r === undefined) n.delete(id);
    else n.set(id, r);
    onChange(n);
  };
  return (
    <View testID="crm-service-commission" style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <SectionTitle text={t("services.commission.title")} />
        <Text size={13} color={c.muted}>
          {t("services.commission.hint")}
        </Text>
      </View>
      {people.length === 0 ? (
        <Text size={14} color={c.muted}>
          {t("services.commission.nobody")}
        </Text>
      ) : (
        people.map((p) => {
          const now = effectiveRate(p.current, service.id);
          const staged = drafts.get(p.staffId);
          const shown: Rate =
            staged === undefined
              ? now.rate
              : staged === null
                ? { kind: "percent", percent: p.current?.commissionPercent ?? 0 }
                : staged;
          const source =
            staged === undefined ? now.source : staged === null ? SOURCE_DEFAULT : SOURCE_SERVICE;
          const variants = (p.current?.overrides ?? []).filter(
            (o) => o.serviceId === service.id && o.variantId !== null,
          );
          return (
            <View
              key={p.staffId}
              testID={`crm-service-commission-${p.staffId}`}
              style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: c.line }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar name={p.displayName} size={32} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text role="uiSemiBold" size={15} color={c.ink}>
                    {p.displayName}
                  </Text>
                  <Text size={13} color={c.body}>
                    {source === "none"
                      ? t("payroll.noPay")
                      : t(`services.commission.source.${source}`)}
                    {staged !== undefined ? ` · ${t("services.commission.unsaved")}` : ""}
                  </Text>
                </View>
                {editing === p.staffId ? null : (
                  <Pressable
                    testID={`crm-service-commission-edit-${p.staffId}`}
                    accessibilityRole="button"
                    accessibilityLabel={t("services.commission.change", { name: p.displayName })}
                    disabled={!canManage}
                    onPress={() => {
                      setEditing(p.staffId);
                    }}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: canManage ? 1 : 0,
                      borderColor: c.line,
                      justifyContent: "center",
                    }}
                  >
                    <Text role="uiSemiBold" size={17} color={c.ink}>
                      {rateText(shown)}
                    </Text>
                  </Pressable>
                )}
              </View>
              {variants.map((o) => {
                const v = service.variants.find((x) => x.id === o.variantId);
                return v ? (
                  <Text key={o.variantId} size={13} color={c.muted} style={{ paddingLeft: 42 }}>
                    {t("services.commission.variant", {
                      name: serviceName(v.name, locale),
                      rate: rateText(
                        o.kind === "percent"
                          ? { kind: "percent", percent: o.percent ?? 0 }
                          : { kind: "fixed", amount: o.amount ?? 0 },
                      ),
                    })}
                  </Text>
                ) : null;
              })}
              {editing === p.staffId ? (
                <View style={{ gap: 8, paddingLeft: 42 }}>
                  <RateEditor
                    testID={`crm-service-commission-rate-${p.staffId}`}
                    value={shown}
                    onChange={(r) => {
                      set(p.staffId, r);
                    }}
                  />
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <CalmButton
                      label={t("common.done")}
                      onPress={() => {
                        setEditing(null);
                      }}
                    />
                    {now.source === "service" || (staged !== undefined && staged !== null) ? (
                      <CalmButton
                        variant="ghost"
                        label={t("services.commission.backToDefault", {
                          percent: formatPercentPoints(p.current?.commissionPercent ?? 0, locale),
                        })}
                        onPress={() => {
                          set(p.staffId, now.source === "service" ? null : undefined);
                          setEditing(null);
                        }}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })
      )}
      {canManage && people.length > 1 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            flexWrap: "wrap",
            padding: 12,
            borderRadius: 14,
            backgroundColor: c.surfaceMuted,
          }}
        >
          <Text size={14} color={c.body} style={{ flexBasis: "100%" }}>
            {t("services.commission.sameForAll")}
          </Text>
          <BigPercentInput
            testID="crm-service-commission-all"
            size="md"
            label={t("services.commission.sameForAll")}
            value={all}
            onChange={setAll}
          />
          <CalmButton
            testID="crm-service-commission-all-apply"
            variant="secondary"
            label={t("services.commission.applyAll", { count: people.length })}
            onPress={() => {
              if (all === null) return;
              const n = new Map(drafts);
              for (const p of people) n.set(p.staffId, { kind: "percent", percent: all });
              onChange(n);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
