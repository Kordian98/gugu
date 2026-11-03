import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  type AdminSalonDetail,
  ENTITLEMENT_KEYS,
  type EntitlementKey,
  PAID_PLAN_CODES,
  type PaidPlanCode,
} from "@gugu/contracts";
import { Text, useCalm } from "@gugu/design-system";

import { Field, MoneyInput, Segmented, Select } from "../salon-crm/ui/form";
import { ActionSheet, DayField } from "./ActionSheet";
import { addDays, endOfDayVn, keyId, todayVn } from "./format";

export type SheetId =
  | "assignPlan"
  | "extendTrial"
  | "setPaidUntil"
  | "suspend"
  | "unsuspend"
  | "createOverride"
  | "grantFounding"
  | "revokeFounding"
  | { revokeOverride: string };

type Props = { salon: AdminSalonDetail; sheet: SheetId | null; onClose: () => void };

/** All admin write sheets for one salon; exactly one is open at a time. */
export function SalonActionSheets({ salon, sheet, onClose }: Props) {
  const id = salon.salon.id;
  const is = (s: SheetId) => sheet === s;
  const { t } = useTranslation("admin");
  return (
    <>
      <AssignPlanSheet open={is("assignPlan")} onClose={onClose} salon={salon} />
      <TrialSheet open={is("extendTrial")} onClose={onClose} salonId={id} />
      <PaidUntilSheet open={is("setPaidUntil")} onClose={onClose} salonId={id} />
      <OverrideSheet open={is("createOverride")} onClose={onClose} salonId={id} />
      <ActionSheet
        testID="admin-suspend"
        open={is("suspend")}
        onClose={onClose}
        salonId={id}
        highRisk
        title={t("actions.suspend.title")}
        body={t("actions.suspend.body")}
        build={(reason) => ({ kind: "suspend", body: { reason } })}
      />
      <ActionSheet
        testID="admin-unsuspend"
        open={is("unsuspend")}
        onClose={onClose}
        salonId={id}
        highRisk
        title={t("actions.unsuspend.title")}
        body={t("actions.unsuspend.body")}
        build={(reason) => ({ kind: "unsuspend", body: { reason } })}
      />
      <ActionSheet
        testID="admin-founding-grant"
        open={is("grantFounding")}
        onClose={onClose}
        salonId={id}
        title={t("actions.foundingGrant.title")}
        body={t("actions.foundingGrant.body")}
        build={(reason) => ({ kind: "grantFounding", body: { reason } })}
      />
      <ActionSheet
        testID="admin-founding-revoke"
        open={is("revokeFounding")}
        onClose={onClose}
        salonId={id}
        highRisk
        title={t("actions.foundingRevoke.title")}
        body={t("actions.foundingRevoke.body")}
        build={(reason) => ({ kind: "revokeFounding", body: { reason } })}
      />
      <ActionSheet
        testID="admin-override-revoke"
        open={typeof sheet === "object" && sheet !== null}
        onClose={onClose}
        salonId={id}
        title={t("actions.revokeOverride.title")}
        body={t("actions.revokeOverride.body")}
        build={(reason) =>
          typeof sheet === "object" && sheet !== null
            ? { kind: "revokeOverride", overrideId: sheet.revokeOverride, body: { reason } }
            : null
        }
      />
    </>
  );
}

function useDates() {
  const { t } = useTranslation("admin");
  const today = todayVn();
  return {
    today,
    long: [
      { label: t("actions.dates.d30"), days: 30 },
      { label: t("actions.dates.d90"), days: 90 },
      { label: t("actions.dates.y1"), days: 365 },
    ],
    short: [
      { label: t("actions.dates.d7"), days: 7 },
      { label: t("actions.dates.d14"), days: 14 },
      { label: t("actions.dates.d30"), days: 30 },
    ],
  };
}

function AssignPlanSheet({
  open,
  onClose,
  salon,
}: {
  open: boolean;
  onClose: () => void;
  salon: AdminSalonDetail;
}) {
  const { t } = useTranslation("admin");
  const d = useDates();
  const current = salon.subscription?.plan;
  const [plan, setPlan] = useState<PaidPlanCode>(current && current !== "trial" ? current : "pro");
  const [interval, setInterval] = useState<"month" | "year">(
    salon.subscription?.interval ?? "month",
  );
  const [until, setUntil] = useState<string | null>(null);
  const [entity, setEntity] = useState<"tbd" | "pl" | "vn">(
    salon.subscription?.invoicingEntity ?? "tbd",
  );
  return (
    <ActionSheet
      testID="admin-assign-plan"
      open={open}
      onClose={onClose}
      salonId={salon.salon.id}
      title={t("actions.assign.title")}
      body={t("detail.subscription.manual")}
      build={(reason) =>
        until
          ? {
              kind: "assignPlan",
              body: {
                plan,
                interval,
                paidUntil: endOfDayVn(until),
                invoicingEntity: entity,
                reason,
              },
            }
          : null
      }
    >
      <Field label={t("actions.assign.plan")}>
        <Segmented
          value={plan}
          onChange={setPlan}
          options={PAID_PLAN_CODES.map((p) => ({ id: p, label: t(`plan.${p}`) }))}
        />
      </Field>
      <Field label={t("actions.assign.interval")}>
        <Segmented
          value={interval}
          onChange={setInterval}
          options={(["month", "year"] as const).map((i) => ({
            id: i,
            label: t(`detail.interval.${i}`),
          }))}
        />
      </Field>
      <DayField
        label={t("actions.assign.paidUntil")}
        value={until}
        onChange={setUntil}
        today={d.today}
        presets={d.long}
      />
      <Field label={t("actions.assign.invoicing")}>
        <Segmented
          value={entity}
          onChange={setEntity}
          options={(["tbd", "pl", "vn"] as const).map((e) => ({
            id: e,
            label: t(`detail.invoicing.${e}`),
          }))}
        />
      </Field>
    </ActionSheet>
  );
}

function TrialSheet({
  open,
  onClose,
  salonId,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
}) {
  const { t } = useTranslation("admin");
  const d = useDates();
  const [until, setUntil] = useState<string | null>(null);
  return (
    <ActionSheet
      testID="admin-extend-trial"
      open={open}
      onClose={onClose}
      salonId={salonId}
      title={t("actions.trial.title")}
      build={(reason) =>
        until ? { kind: "extendTrial", body: { trialEndsAt: endOfDayVn(until), reason } } : null
      }
    >
      <DayField
        label={t("actions.trial.until")}
        hint={t("actions.trial.hint")}
        value={until}
        onChange={setUntil}
        today={d.today}
        max={addDays(d.today, 89)}
        presets={d.short}
      />
    </ActionSheet>
  );
}

function PaidUntilSheet({
  open,
  onClose,
  salonId,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
}) {
  const { t } = useTranslation("admin");
  const d = useDates();
  const [until, setUntil] = useState<string | null>(null);
  return (
    <ActionSheet
      testID="admin-paid-until"
      open={open}
      onClose={onClose}
      salonId={salonId}
      title={t("actions.paidUntil.title")}
      body={t("detail.subscription.manual")}
      build={(reason) =>
        until ? { kind: "setPaidUntil", body: { paidUntil: endOfDayVn(until), reason } } : null
      }
    >
      <DayField
        label={t("actions.paidUntil.until")}
        value={until}
        onChange={setUntil}
        today={d.today}
        presets={d.long}
      />
    </ActionSheet>
  );
}

const KEYS = Object.keys(ENTITLEMENT_KEYS) as EntitlementKey[];

function OverrideSheet({
  open,
  onClose,
  salonId,
}: {
  open: boolean;
  onClose: () => void;
  salonId: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const d = useDates();
  const [key, setKey] = useState<EntitlementKey>("ai.monthly_cost_cap_vnd");
  const [bool, setBool] = useState<"on" | "off">("on");
  const [limit, setLimit] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState<"number" | "unlimited">("number");
  const [until, setUntil] = useState<string | null>(null);
  const isBool = ENTITLEMENT_KEYS[key].type === "boolean";
  const value = isBool ? bool === "on" : unlimited === "unlimited" ? "unlimited" : limit;
  return (
    <ActionSheet
      testID="admin-override"
      open={open}
      onClose={onClose}
      salonId={salonId}
      title={t("actions.override.title")}
      body={t("actions.override.hint")}
      build={(reason) =>
        until && value !== null
          ? { kind: "createOverride", body: { key, value, expiresAt: endOfDayVn(until), reason } }
          : null
      }
    >
      <Field label={t("actions.override.key")}>
        <Select
          testID="admin-override-key"
          label={t("actions.override.key")}
          placeholder={t("actions.override.key")}
          value={key}
          options={KEYS.map((k) => ({ id: k, label: t(`entitlementKey.${keyId(k)}` as never) }))}
          onChange={setKey}
        />
      </Field>
      <Text size={12} color={c.muted}>
        {key}
      </Text>
      <Field label={t("actions.override.value")}>
        {isBool ? (
          <Segmented
            value={bool}
            onChange={setBool}
            options={[
              { id: "on", label: t("actions.override.boolOn") },
              { id: "off", label: t("actions.override.boolOff") },
            ]}
          />
        ) : (
          <View style={{ gap: 8 }}>
            <Segmented
              value={unlimited}
              onChange={setUnlimited}
              options={[
                { id: "number", label: t("actions.override.limit") },
                { id: "unlimited", label: t("actions.override.unlimited") },
              ]}
            />
            {unlimited === "number" ? (
              <MoneyInput
                testID="admin-override-limit"
                label={t("actions.override.limit")}
                value={limit}
                onChange={setLimit}
              />
            ) : null}
          </View>
        )}
      </Field>
      <DayField
        label={t("actions.override.expires")}
        value={until}
        onChange={setUntil}
        today={d.today}
        max={addDays(d.today, 365)}
        presets={d.long}
      />
    </ActionSheet>
  );
}
