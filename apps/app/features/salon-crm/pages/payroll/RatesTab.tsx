import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  Avatar,
  CalmButton,
  CalmCard,
  checkableA11y,
  Icon,
  Text,
  useCalm,
} from "@gugu/design-system";
import {
  COMMISSION_BASE_VALUES,
  type CommissionBulkInput,
  type PayrollSettings,
} from "@gugu/contracts";
import { formatLocalDate, formatPercentPoints, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useServices } from "../../data/catalog";
import { salonDate } from "../../data/dates";
import {
  useBulkCommission,
  useManagerAccess,
  usePayrollSettings,
  useSaveCommissionBase,
} from "../../data/payroll";
import { useSalon } from "../../data/SalonContext";
import { EmptyState } from "../../ui/EmptyState";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Segmented, SettingRow, Toggle } from "../../ui/form";
import { BigMoneyInput, BigPercentInput, Chip, EffectiveFrom, UndoBar, useUndo } from "./kit";
import { groupOverrides, type OverrideGroup, type Rate } from "./model";
import { RetryError, SectionTitle, SkeletonRows } from "./parts";
import { baseSummary, Hint, KindButton, labelOf, PaySheet, ServicePicker } from "./PaySheet";

type Staff = PayrollSettings["staff"][number];

/**
 * Payroll → "Mức lương & hoa hồng": everyone's pay at a glance, the same default % for several
 * people at once, every own rate as one table (service → % or đ → people) with inline edit and
 * remove (undo), and the salon-wide settings. Every change applies from one date shown on top.
 */
export function RatesTab({ mobile }: { mobile: boolean }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { summary, can } = useSalon();
  const today = salonDate(new Date(), summary?.timezone);
  const q = usePayrollSettings();
  const s = q.data?.data ?? null;
  const canManage = can("payroll.manage");
  const [from, setFrom] = useState(today);
  const [paySheet, setPaySheet] = useState<Staff | null>(null);
  const bulk = useBulkCommission();
  const errorText = useErrorText();
  const undo = useUndo();

  if (q.isPending)
    return (
      <CalmCard>
        <SkeletonRows />
      </CalmCard>
    );
  if (q.isError)
    return (
      <CalmCard>
        <RetryError
          text={t("payroll.loadError")}
          onRetry={() => {
            void q.refetch();
          }}
        />
      </CalmCard>
    );
  if (q.data.forbidden || !s)
    return (
      <EmptyState
        testID="crm-payroll-forbidden"
        icon="wallet"
        title={t("payroll.forbiddenTitle")}
        body={t("payroll.forbiddenBody")}
      />
    );
  if (s.staff.length === 0)
    return (
      <EmptyState
        testID="crm-payroll-empty"
        icon="team"
        title={t("payroll.emptyTitle")}
        body={t("payroll.emptyBody")}
      />
    );

  const run = (change: CommissionBulkInput["change"], staffIds: string[], onDone?: () => void) => {
    bulk.mutate(
      { effectiveFrom: from, staffIds, change },
      {
        onSuccess: () => {
          onDone?.();
        },
      },
    );
  };

  return (
    <View testID="crm-rates-table" style={{ gap: 16 }}>
      {canManage ? (
        <CalmCard style={{ gap: 10 }}>
          <SectionTitle text={t("payroll.rates.fromTitle")} />
          <EffectiveFrom testID="crm-rates-from" value={from} onChange={setFrom} today={today} />
        </CalmCard>
      ) : null}
      <ErrorBanner text={errorText(bulk.error)} />
      <UndoBar state={undo.state} onDismiss={undo.dismiss} />

      <DefaultsCard
        staff={s.staff}
        mobile={mobile}
        canManage={canManage}
        busy={bulk.isPending}
        onEdit={setPaySheet}
        onSetDefault={(ids, percent, done) => {
          run({ target: "default", percent }, ids, done);
        }}
      />

      <OverridesCard
        staff={s.staff}
        mobile={mobile}
        canManage={canManage}
        busy={bulk.isPending}
        onSet={(services, rate, staffIds, done) => {
          run({ target: "override", services, rate }, staffIds, done);
        }}
        onRemoved={(g, label) => {
          run(
            {
              target: "override",
              services: [{ serviceId: g.serviceId, variantId: g.variantId }],
              rate: null,
            },
            g.staffIds,
            () => {
              undo.show(t("payroll.undo.rateRemoved", { name: label }), () => {
                run(
                  {
                    target: "override",
                    services: [{ serviceId: g.serviceId, variantId: g.variantId }],
                    rate: g.rate,
                  },
                  g.staffIds,
                );
              });
            },
          );
        }}
      />

      {canManage ? <SettingsCard s={s} from={from} /> : null}

      {paySheet ? (
        <PaySheet
          staffId={paySheet.staffId}
          name={paySheet.displayName}
          onClose={() => {
            setPaySheet(null);
          }}
        />
      ) : null}
      <Text size={13} color={c.muted}>
        {t("payroll.estimateNote")}
      </Text>
    </View>
  );
}

function Check({
  checked,
  onPress,
  label,
  testID,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      {...checkableA11y("checkbox", checked)}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? c.accentBg : c.line,
          backgroundColor: checked ? c.accentBg : c.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Icon name="check" size={14} color={c.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

/** Everyone's base pay + default %; select several and set one % for all of them. */
function DefaultsCard({
  staff,
  mobile,
  canManage,
  busy,
  onEdit,
  onSetDefault,
}: {
  staff: Staff[];
  mobile: boolean;
  canManage: boolean;
  busy: boolean;
  onEdit: (s: Staff) => void;
  onSetDefault: (ids: string[], percent: number, done: () => void) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [editing, setEditing] = useState<{ id: string; percent: number | null } | null>(null);
  const all = picked.size === staff.length;
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  return (
    <CalmCard testID="crm-rates-defaults" style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <SectionTitle text={t("payroll.rates.defaultsTitle")} />
        <Text size={13} color={c.muted}>
          {t("payroll.rates.defaultsHint")}
        </Text>
      </View>
      {canManage ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Check
            testID="crm-rates-select-all"
            checked={all}
            label={t("payroll.rates.selectAll")}
            onPress={() => {
              setPicked(all ? new Set() : new Set(staff.map((s) => s.staffId)));
            }}
          />
          <Text size={14} color={c.body}>
            {t("payroll.rates.selectAll")}
          </Text>
        </View>
      ) : null}
      {staff.map((s) => {
        const v = s.current;
        const isEditing = editing?.id === s.staffId;
        return (
          <View
            key={s.staffId}
            testID={`crm-rates-staff-${s.staffId}`}
            style={{
              flexDirection: mobile ? "column" : "row",
              alignItems: mobile ? "stretch" : "center",
              gap: mobile ? 6 : 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderColor: c.line,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1.4 }}>
              {canManage ? (
                <Check
                  testID={`crm-rates-pick-${s.staffId}`}
                  checked={picked.has(s.staffId)}
                  label={t("payroll.rates.pick", { name: s.displayName })}
                  onPress={() => {
                    toggle(s.staffId);
                  }}
                />
              ) : null}
              <Avatar name={s.displayName} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text role="uiSemiBold" size={16} color={c.ink}>
                  {s.displayName}
                </Text>
                <Text size={13} color={c.body}>
                  {v ? baseSummary(v, t, locale) : t("payroll.noPay")}
                </Text>
                {s.next ? (
                  <Text size={12} color={c.muted}>
                    {t("payroll.rates.scheduled", {
                      date: formatLocalDate(s.next.effectiveFrom, locale),
                      percent: formatPercentPoints(s.next.commissionPercent, locale),
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                justifyContent: mobile ? "flex-start" : "flex-end",
                flexWrap: "wrap",
              }}
            >
              {isEditing ? (
                <>
                  <BigPercentInput
                    testID={`crm-rates-default-input-${s.staffId}`}
                    size="md"
                    label={t("payroll.sheet.commission")}
                    value={editing.percent}
                    onChange={(p) => {
                      setEditing({ id: s.staffId, percent: p });
                    }}
                  />
                  <CalmButton
                    testID={`crm-rates-default-save-${s.staffId}`}
                    label={t("common.save")}
                    onPress={() => {
                      if (editing.percent === null) return;
                      onSetDefault([s.staffId], editing.percent, () => {
                        setEditing(null);
                      });
                    }}
                  />
                  <CalmButton
                    variant="ghost"
                    label={t("common.cancel")}
                    onPress={() => {
                      setEditing(null);
                    }}
                  />
                </>
              ) : (
                <Pressable
                  testID={`crm-rates-default-${s.staffId}`}
                  accessibilityRole="button"
                  accessibilityLabel={t("payroll.rates.editDefault", { name: s.displayName })}
                  disabled={!canManage}
                  onPress={() => {
                    setEditing({ id: s.staffId, percent: v?.commissionPercent ?? 0 });
                  }}
                  style={{
                    minHeight: 44,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: canManage ? 1 : 0,
                    borderColor: c.line,
                  }}
                >
                  <Text role="uiSemiBold" size={18} color={c.ink}>
                    {formatPercentPoints(v?.commissionPercent ?? 0, locale)}
                  </Text>
                  <Text size={13} color={c.body}>
                    {t("payroll.rates.defaultLabel")}
                  </Text>
                  {canManage ? <Icon name="chevronDown" size={14} color={c.body} /> : null}
                </Pressable>
              )}
              {!isEditing && v?.overrides.length ? (
                <Text size={13} color={c.body}>
                  {t("payroll.rates.ownCount", { count: v.overrides.length })}
                </Text>
              ) : null}
              {!isEditing && canManage ? (
                <CalmButton
                  testID={`crm-rates-edit-${s.staffId}`}
                  variant="secondary"
                  label={t("payroll.rates.editPay")}
                  onPress={() => {
                    onEdit(s);
                  }}
                />
              ) : null}
            </View>
          </View>
        );
      })}
      {canManage && picked.size > 0 ? (
        <View
          testID="crm-rates-bulk"
          style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.accentSoft }}
        >
          <Text role="uiSemiBold" size={15} color={c.ink}>
            {t("payroll.rates.bulkTitle", { count: picked.size })}
          </Text>
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}
          >
            <BigPercentInput
              testID="crm-rates-bulk-percent"
              size="md"
              label={t("payroll.sheet.commission")}
              value={percent}
              onChange={setPercent}
              quick={[5, 10, 15, 20, 30]}
              invalid={touched && percent === null}
            />
          </View>
          {touched && percent === null ? (
            <Hint error={t("payroll.validation.percentRequired")} />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <CalmButton
              testID="crm-rates-bulk-apply"
              label={
                busy
                  ? t("common.saving")
                  : t("payroll.rates.bulkApply", {
                      count: picked.size,
                      percent: percent === null ? "…" : formatPercentPoints(percent, locale),
                    })
              }
              onPress={() => {
                setTouched(true);
                if (percent === null) return;
                onSetDefault([...picked], percent, () => {
                  setPicked(new Set());
                  setPercent(null);
                  setTouched(false);
                });
              }}
            />
            <CalmButton
              variant="ghost"
              label={t("common.cancel")}
              onPress={() => {
                setPicked(new Set());
              }}
            />
          </View>
        </View>
      ) : null}
    </CalmCard>
  );
}

const rateText = (
  r: Rate,
  locale: "vi" | "en",
  t: ReturnType<typeof useTranslation<"crm">>["t"],
) =>
  r.kind === "percent"
    ? formatPercentPoints(r.percent, locale)
    : t("payroll.lines.rateFixed", { amount: formatVND(r.amount, locale) });

/** Every own rate as one table: service → rate → people; inline edit, remove, add. */
function OverridesCard({
  staff,
  mobile,
  canManage,
  busy,
  onSet,
  onRemoved,
}: {
  staff: Staff[];
  mobile: boolean;
  canManage: boolean;
  busy: boolean;
  onSet: (
    services: { serviceId: string; variantId: string | null }[],
    rate: Rate,
    staffIds: string[],
    done: () => void,
  ) => void;
  onRemoved: (g: OverrideGroup, label: string) => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const services = (useServices().data?.items ?? []).filter((s) => s.isActive);
  const groups = groupOverrides(
    staff,
    services.map((s) => s.id),
  );
  const nameOf = (id: string) => staff.find((s) => s.staffId === id)?.displayName ?? "";
  const [editing, setEditing] = useState<{ key: string; rate: Rate } | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <CalmCard testID="crm-rates-overrides" style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 1, gap: 2, minWidth: 220 }}>
          <SectionTitle text={t("payroll.rates.overridesTitle")} />
          <Text size={13} color={c.muted}>
            {t("payroll.rates.overridesHint")}
          </Text>
        </View>
        {canManage && !adding ? (
          <CalmButton
            testID="crm-rates-add"
            variant="secondary"
            icon="plus"
            label={t("payroll.rates.add")}
            onPress={() => {
              setAdding(true);
            }}
          />
        ) : null}
      </View>
      {adding ? (
        <AddRateForm
          staff={staff}
          busy={busy}
          onCancel={() => {
            setAdding(false);
          }}
          onSave={(svc, rate, ids) => {
            onSet(svc, rate, ids, () => {
              setAdding(false);
            });
          }}
        />
      ) : null}
      {!mobile && groups.length ? (
        <View style={{ flexDirection: "row", gap: 12, paddingVertical: 8 }}>
          <Text role="uiMedium" size={13} color={c.body} style={{ flex: 1.4 }}>
            {t("payroll.rates.colService")}
          </Text>
          <Text role="uiMedium" size={13} color={c.body} style={{ flex: 1 }}>
            {t("payroll.rates.colRate")}
          </Text>
          <Text role="uiMedium" size={13} color={c.body} style={{ flex: 1.4 }}>
            {t("payroll.rates.colStaff")}
          </Text>
          <View style={{ width: canManage ? 100 : 0 }} />
        </View>
      ) : null}
      {groups.length === 0 ? (
        <Text size={14} color={c.body} style={{ paddingVertical: 8 }}>
          {t("payroll.rates.noOverrides")}
        </Text>
      ) : (
        groups.map((g, i) => {
          const label = labelOf(services, g, locale) || t("payroll.sheet.unknownService");
          const isEditing = editing?.key === g.key;
          return (
            <View
              key={g.key}
              testID={`crm-rates-row-${String(i)}`}
              style={{
                flexDirection: mobile ? "column" : "row",
                alignItems: mobile ? "stretch" : "center",
                gap: mobile ? 6 : 12,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderColor: c.line,
              }}
            >
              <Text role="uiSemiBold" size={15} color={c.ink} style={{ flex: 1.4 }}>
                {label}
              </Text>
              <View style={{ flex: 1 }}>
                {isEditing ? (
                  <RateEditor
                    value={editing.rate}
                    onChange={(rate) => {
                      setEditing({ key: g.key, rate });
                    }}
                    testID={`crm-rates-row-${String(i)}-edit`}
                  />
                ) : (
                  <Text role="uiSemiBold" size={18} color={c.ink}>
                    {rateText(g.rate, locale, t)}
                  </Text>
                )}
              </View>
              <Text size={14} color={c.body} style={{ flex: 1.4 }}>
                {g.staffIds.map(nameOf).join(", ")}
              </Text>
              {canManage ? (
                <View style={{ flexDirection: "row", gap: 4, width: mobile ? undefined : 100 }}>
                  {isEditing ? (
                    <>
                      <CalmButton
                        testID={`crm-rates-row-${String(i)}-save`}
                        label={t("common.save")}
                        onPress={() => {
                          const r = editing.rate;
                          if (r.kind === "percent" ? Number.isNaN(r.percent) : r.amount <= 0)
                            return;
                          onSet(
                            [{ serviceId: g.serviceId, variantId: g.variantId }],
                            r,
                            g.staffIds,
                            () => {
                              setEditing(null);
                            },
                          );
                        }}
                      />
                      <CalmButton
                        variant="ghost"
                        label={t("common.cancel")}
                        onPress={() => {
                          setEditing(null);
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <IconAction
                        testID={`crm-rates-row-${String(i)}-edit-open`}
                        icon="settings"
                        label={t("payroll.rates.editRate", { name: label })}
                        onPress={() => {
                          setEditing({ key: g.key, rate: g.rate });
                        }}
                      />
                      <IconAction
                        testID={`crm-rates-row-${String(i)}-remove`}
                        icon="trash"
                        label={t("payroll.rates.removeRate", { name: label })}
                        onPress={() => {
                          onRemoved(g, label);
                        }}
                      />
                    </>
                  )}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </CalmCard>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: "settings" | "trash";
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { c } = useCalm();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
      }}
    >
      <Icon name={icon} size={18} color={c.body} />
    </Pressable>
  );
}

/** % or đ toggle + value (one row). */
export function RateEditor({
  value,
  onChange,
  testID,
}: {
  value: Rate;
  onChange: (r: Rate) => void;
  testID?: string;
}) {
  const { t } = useTranslation("crm");
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 4 }}>
        <KindButton
          testID={testID ? `${testID}-percent` : undefined}
          label={t("payroll.sheet.kind.percent")}
          on={value.kind === "percent"}
          onPress={() => {
            onChange({ kind: "percent", percent: value.kind === "percent" ? value.percent : 10 });
          }}
        />
        <KindButton
          testID={testID ? `${testID}-fixed` : undefined}
          label={t("payroll.sheet.kind.fixed")}
          on={value.kind === "fixed"}
          onPress={() => {
            onChange({ kind: "fixed", amount: value.kind === "fixed" ? value.amount : 0 });
          }}
        />
      </View>
      {value.kind === "percent" ? (
        <BigPercentInput
          testID={testID ? `${testID}-value` : undefined}
          size="md"
          label={t("payroll.rates.colRate")}
          value={value.percent}
          onChange={(p) => {
            onChange({ kind: "percent", percent: p ?? 0 });
          }}
        />
      ) : (
        <View style={{ width: 160 }}>
          <BigMoneyInput
            testID={testID ? `${testID}-value` : undefined}
            size="md"
            label={t("payroll.rates.colRate")}
            value={value.amount}
            onChange={(a) => {
              onChange({ kind: "fixed", amount: a ?? 0 });
            }}
          />
        </View>
      )}
    </View>
  );
}

/** Several services × one rate × several people, in one inline form. */
function AddRateForm({
  staff,
  busy,
  onSave,
  onCancel,
}: {
  staff: Staff[];
  busy: boolean;
  onSave: (
    services: { serviceId: string; variantId: string | null }[],
    rate: Rate,
    staffIds: string[],
  ) => void;
  onCancel: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const services = (useServices().data?.items ?? []).filter((s) => s.isActive);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rate, setRate] = useState<Rate>({ kind: "percent", percent: 10 });
  const [people, setPeople] = useState<Set<string>>(new Set(staff.map((s) => s.staffId)));
  const [touched, setTouched] = useState(false);
  const [picking, setPicking] = useState(true);
  const toggle = (set: Set<string>, k: string) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  };
  const rateOk = rate.kind === "percent" ? rate.percent >= 0 : rate.amount > 0;
  const svc = [...picked].map((k) => {
    const [serviceId = "", variantId = ""] = k.split(":");
    return { serviceId, variantId: variantId === "" ? null : variantId };
  });
  return (
    <View
      testID="crm-rates-add-form"
      style={{ gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.surfaceMuted }}
    >
      <Text role="uiSemiBold" size={15} color={c.ink}>
        {t("payroll.rates.addStep1")}
      </Text>
      {svc.length ? (
        <Text size={14} color={c.body}>
          {svc.map((x) => labelOf(services, x, locale)).join(", ")}
        </Text>
      ) : null}
      {picking ? (
        <ServicePicker
          multiple
          services={services}
          taken={new Set()}
          picked={picked}
          onPick={(serviceId, variantId) => {
            setPicked((p) => toggle(p, `${serviceId}:${variantId ?? ""}`));
          }}
          onCancel={() => {
            setPicking(false);
          }}
        />
      ) : (
        <View style={{ alignSelf: "flex-start" }}>
          <CalmButton
            variant="secondary"
            label={t("payroll.rates.changeServices")}
            onPress={() => {
              setPicking(true);
            }}
          />
        </View>
      )}
      {touched && svc.length === 0 ? (
        <Hint error={t("payroll.validation.serviceRequired")} />
      ) : null}
      <Text role="uiSemiBold" size={15} color={c.ink}>
        {t("payroll.rates.addStep2")}
      </Text>
      <RateEditor value={rate} onChange={setRate} testID="crm-rates-add-rate" />
      {touched && !rateOk ? <Hint error={t("payroll.validation.overrideRequired")} /> : null}
      <Text role="uiSemiBold" size={15} color={c.ink}>
        {t("payroll.rates.addStep3")}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {staff.map((s) => (
          <Chip
            key={s.staffId}
            testID={`crm-rates-add-staff-${s.staffId}`}
            role="checkbox"
            label={s.displayName}
            selected={people.has(s.staffId)}
            onPress={() => {
              setPeople((p) => toggle(p, s.staffId));
            }}
          />
        ))}
      </View>
      {touched && people.size === 0 ? <Hint error={t("payroll.validation.staffRequired")} /> : null}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <CalmButton
          testID="crm-rates-add-save"
          label={
            busy
              ? t("common.saving")
              : t("payroll.rates.addSave", { services: svc.length, people: people.size })
          }
          onPress={() => {
            setTouched(true);
            if (!svc.length || !rateOk || people.size === 0) return;
            onSave(svc, rate, [...people]);
          }}
        />
        <CalmButton variant="ghost" label={t("common.cancel")} onPress={onCancel} />
      </View>
    </View>
  );
}

/** Commission base (from the chosen date's month) and which managers may see payroll. */
function SettingsCard({ s, from }: { s: PayrollSettings; from: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const { can } = useSalon();
  const base = useSaveCommissionBase();
  const access = useManagerAccess();
  const errorText = useErrorText();
  return (
    <CalmCard testID="crm-payroll-settings" style={{ gap: 12 }}>
      <SectionTitle text={t("payroll.settings.title")} />
      <ErrorBanner text={errorText(base.error ?? access.error)} />
      <View style={{ gap: 6 }}>
        <Text role="uiMedium" size={14} color={c.ink}>
          {t("payroll.settings.commissionBase")}
        </Text>
        <Segmented
          value={s.commissionBase}
          onChange={(v) => {
            base.mutate({ base: v, effectiveFrom: `${from.slice(0, 7)}-01` });
          }}
          options={COMMISSION_BASE_VALUES.map((id) => ({
            id,
            label: t(`payroll.settings.bases.${id}`),
          }))}
        />
        <Text size={13} color={c.muted}>
          {`${t(`payroll.settings.basesHint.${s.commissionBase}`)} ${t("payroll.settings.baseFrom")}`}
        </Text>
      </View>
      {can("members.roles.write") ? (
        <View style={{ gap: 6 }}>
          <Text role="uiMedium" size={14} color={c.ink}>
            {t("payroll.settings.managerAccess")}
          </Text>
          <Text size={13} color={c.muted}>
            {t("payroll.settings.managerAccessHint")}
          </Text>
          {s.managers.length === 0 ? (
            <Text size={14} color={c.muted}>
              {t("payroll.settings.noManagers")}
            </Text>
          ) : (
            s.managers.map((m) => (
              <SettingRow key={m.memberId} title={m.displayName}>
                <Toggle
                  testID={`crm-payroll-manager-${m.memberId}`}
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
