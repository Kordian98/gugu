import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { BusinessType, Service } from "@gugu/contracts";
import { CalmButton, Icon, Text, checkableA11y, useCalm } from "@gugu/design-system";
import { starterServices, type StarterService } from "@gugu/domain";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { setupApi, useSetupMutation } from "../../../data/setup";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner, Field, Input, MoneyInput, NumberInput } from "../../../ui/form";

const nameKey = (n: string) => n.trim().toLocaleLowerCase("vi");

type Row = StarterService & { selected: boolean; editing: boolean };

/**
 * Starter services for the business type (step c, path B): typical Vietnamese services with editable
 * names, durations and prices. Rows already in the salon show as added; a retry never duplicates.
 */
export function TemplatePicker({
  type,
  existing,
  onAdded,
}: {
  type: BusinessType;
  existing: Service[];
  onAdded: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const taken = useMemo(() => new Set(existing.map((s) => nameKey(s.name.vi))), [existing]);
  const [rows, setRows] = useState<Row[]>(() =>
    starterServices(type).map((s) => ({ ...s, selected: true, editing: false })),
  );
  const [typeShown, setTypeShown] = useState(type);
  if (typeShown !== type) {
    setTypeShown(type);
    setRows(starterServices(type).map((s) => ({ ...s, selected: true, editing: false })));
  }
  const add = useSetupMutation(setupApi.starterServices, ["services", "team"]);
  const [added, setAdded] = useState<number | null>(null);
  const pending = rows.filter((r) => r.selected && !taken.has(nameKey(r.name.vi)));
  const allAdded = rows.every((r) => taken.has(nameKey(r.name.vi)));
  const patch = (key: string, p: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  };
  return (
    <View testID="crm-setup-template" style={{ gap: 10 }}>
      <Text size={13} color={c.muted}>
        {t("setupWizard.services.templateHint")}
      </Text>
      <ErrorBanner text={errorText(add.error)} />
      {rows.map((r) => {
        const done = taken.has(nameKey(r.name.vi));
        const checked = done || r.selected;
        const label = (locale === "en" && r.name.en) || r.name.vi;
        return (
          <View
            key={r.key}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: checked ? c.accentBg : c.line,
              backgroundColor: c.surface,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                testID={`crm-setup-template-row-${r.key}`}
                {...checkableA11y("checkbox", checked, { disabled: done })}
                accessibilityLabel={label}
                onPress={() => {
                  if (!done) patch(r.key, { selected: !r.selected });
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                  minHeight: 44,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: checked ? c.accentBg : c.line,
                    backgroundColor: checked ? c.accentBg : c.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {checked ? (
                    <Icon name="check" size={14} color={c.onAccent} strokeWidth={2.8} />
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text role="uiSemiBold" size={15} color={c.ink}>
                    {label}
                  </Text>
                  <Text size={13} color={c.body}>
                    {`${formatVND(r.price, locale)} · ${t("services.minutes", { count: r.durationMinutes })}`}
                  </Text>
                  {r.priceMax ? (
                    <Text size={12} color={c.muted}>
                      {t("setupWizard.services.rangeHint", {
                        range: `${formatVND(r.price, locale)}–${formatVND(r.priceMax, locale)}`,
                      })}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {done ? (
                <Icon name="check" size={18} color={c.accent} />
              ) : (
                <CalmButton
                  size="sm"
                  variant="ghost"
                  icon={r.editing ? "chevronUp" : "chevronDown"}
                  label={t("setupWizard.services.editRow")}
                  accessibilityLabel={t("services.edit", { name: label })}
                  onPress={() => {
                    patch(r.key, { editing: !r.editing });
                  }}
                />
              )}
            </View>
            {r.editing && !done ? (
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
              >
                <Field flex={2} label={t("services.nameVi")}>
                  <Input
                    label={t("services.nameVi")}
                    value={r.name.vi}
                    onChangeText={(v) => {
                      patch(r.key, { name: { ...r.name, vi: v } });
                    }}
                  />
                </Field>
                <Field flex={1} label={t("services.price")}>
                  <MoneyInput
                    label={t("services.price")}
                    value={r.price}
                    onChange={(v) => {
                      const price = v ?? 0;
                      patch(r.key, {
                        price,
                        priceMax: r.priceMax && r.priceMax > price ? r.priceMax : null,
                      });
                    }}
                  />
                </Field>
                <Field label={t("services.duration")}>
                  <NumberInput
                    label={t("services.duration")}
                    value={r.durationMinutes}
                    onChange={(v) => {
                      patch(r.key, { durationMinutes: v ?? 30 });
                    }}
                  />
                </Field>
              </View>
            ) : null}
          </View>
        );
      })}
      {added !== null ? (
        <Text testID="crm-setup-template-added" role="uiSemiBold" size={14} color={c.accent}>
          {t("setupWizard.services.added", { count: added })}
        </Text>
      ) : null}
      {allAdded ? null : (
        <CalmButton
          testID="crm-setup-template-add"
          icon="plus"
          label={
            pending.length > 0
              ? t("setupWizard.services.addSelected", { count: pending.length })
              : t("setupWizard.services.selectSome")
          }
          onPress={() => {
            const items = pending
              .filter((r) => r.name.vi.trim() && r.durationMinutes >= 5)
              .map((r) => ({
                name: { vi: r.name.vi.trim(), en: r.name.en },
                price: r.price,
                priceMax: r.priceMax,
                durationMinutes: r.durationMinutes,
              }));
            if (items.length === 0 || add.isPending) return;
            add.mutate(
              { businessType: type, items },
              {
                onSuccess: (res) => {
                  setAdded(res.created);
                  onAdded();
                },
              },
            );
          }}
        />
      )}
    </View>
  );
}
