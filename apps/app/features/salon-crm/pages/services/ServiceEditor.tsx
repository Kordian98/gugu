import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Text, useCalm } from "@gugu/design-system";
import type { CategoryItem, Service, ServiceInput, StaffMember } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { AssignList } from "../../ui/AssignList";
import { useErrorText } from "../../ui/errors";
import {
  ConfirmDialog,
  ErrorBanner,
  Field,
  Input,
  MoneyInput,
  NumberInput,
  Select,
  Sheet,
  Toggle,
} from "../../ui/form";

type VariantDraft = {
  id?: string;
  nameVi: string;
  nameEn: string;
  price: number | null;
  duration: number | null;
};
type AddOnDraft = {
  id?: string;
  nameVi: string;
  nameEn: string;
  extraPrice: number | null;
  extraDuration: number | null;
};

type Draft = {
  nameVi: string;
  nameEn: string;
  descriptionVi: string;
  categoryId: string | null;
  price: number | null;
  priceMax: number | null;
  duration: number | null;
  bufferAfter: number | null;
  isActive: boolean;
  variants: VariantDraft[];
  addOns: AddOnDraft[];
  staffIds: string[];
  /** New service whose staff list was never touched: the API assigns every bookable member. */
  staffDefault: boolean;
};

const fromService = (s: Service | null): Draft => ({
  nameVi: s?.name.vi ?? "",
  nameEn: s?.name.en ?? "",
  descriptionVi: s?.description?.vi ?? "",
  categoryId: s?.categoryId ?? null,
  price: s?.price ?? null,
  priceMax: s?.priceMax ?? null,
  duration: s?.durationMinutes ?? 30,
  bufferAfter: s?.bufferAfterMinutes ?? 0,
  isActive: s?.isActive ?? true,
  variants: (s?.variants ?? []).map((v) => ({
    id: v.id,
    nameVi: v.name.vi,
    nameEn: v.name.en,
    price: v.price,
    duration: v.durationMinutes,
  })),
  addOns: (s?.addOns ?? []).map((a) => ({
    id: a.id,
    nameVi: a.name.vi,
    nameEn: a.name.en,
    extraPrice: a.extraPrice,
    extraDuration: a.extraDurationMinutes,
  })),
  staffIds: s?.staffIds ?? [],
  staffDefault: !s,
});

const toInput = (d: Draft, description: { vi: string; en: string } | null): ServiceInput => ({
  name: { vi: d.nameVi.trim(), en: d.nameEn.trim() },
  description: d.descriptionVi.trim()
    ? { vi: d.descriptionVi.trim(), en: description?.en ?? "" }
    : null,
  categoryId: d.categoryId,
  price: d.price ?? 0,
  priceMax: d.priceMax !== null && d.price !== null && d.priceMax > d.price ? d.priceMax : null,
  durationMinutes: d.duration ?? 30,
  bufferAfterMinutes: d.bufferAfter ?? 0,
  isActive: d.isActive,
  variants: d.variants
    .filter((v) => v.nameVi.trim())
    .map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      name: { vi: v.nameVi.trim(), en: v.nameEn.trim() },
      price: v.price,
      durationMinutes: v.duration !== null && v.duration >= 5 ? v.duration : null,
    })),
  addOns: d.addOns
    .filter((a) => a.nameVi.trim())
    .map((a) => ({
      ...(a.id ? { id: a.id } : {}),
      name: { vi: a.nameVi.trim(), en: a.nameEn.trim() },
      extraPrice: a.extraPrice ?? 0,
      extraDurationMinutes: a.extraDuration ?? 0,
    })),
  ...(d.staffDefault ? {} : { staffIds: d.staffIds }),
});

/**
 * Create/edit a service with variants (e.g. short/long hair), add-ons (extra duration + price,
 * q17) and the staff who perform it. Saves the whole service in one request.
 */
export function ServiceEditor({
  service,
  open,
  onClose,
  categories,
  staff,
}: {
  service: Service | null;
  open: boolean;
  onClose: () => void;
  categories: CategoryItem[];
  staff: StaffMember[];
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const [d, setD] = useState<Draft>(() => fromService(service));
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
  };
  const create = useCrmMutation(crmApi.createService, ["services", "team"]);
  const update = useCrmMutation(crmApi.updateService, ["services", "team"]);
  const remove = useCrmMutation(crmApi.removeService, ["services", "team"]);
  const bookable = staff.filter((s) => s.isBookable);
  // New service: every bookable member is preselected (and with exactly one, silently assigned).
  const chosen = d.staffDefault ? bookable.map((s) => s.id) : d.staffIds;
  const unassigned = d.isActive && !bookable.some((s) => chosen.includes(s.id));
  const busy = create.isPending || update.isPending || remove.isPending;
  const invalid = !d.nameVi.trim() || d.price === null || d.duration === null || d.duration < 5;

  const save = () => {
    setTouched(true);
    if (invalid) return;
    const body = toInput(d, service?.description ?? null);
    const done = { onSuccess: onClose };
    if (service) update.mutate({ id: service.id, body }, done);
    else create.mutate(body, done);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={service ? t("services.editTitle") : t("services.newTitle")}
      footer={
        <>
          {service ? (
            <CalmButton
              variant="ghost"
              icon="trash"
              label={t("common.delete")}
              onPress={() => {
                setConfirmDelete(true);
              }}
            />
          ) : null}
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID="crm-service-save"
            label={busy ? t("common.saving") : t("common.save")}
            onPress={save}
          />
        </>
      }
    >
      <ConfirmDialog
        testID="crm-service-delete-dialog"
        open={confirmDelete}
        title={t("services.deleteTitle", {
          name: service ? (locale === "en" && service.name.en) || service.name.vi : "",
        })}
        body={t("services.deleteBody")}
        confirmLabel={t("services.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        busy={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (service) remove.mutate(service.id, { onSuccess: onClose });
        }}
      />
      <ErrorBanner text={errorText(create.error ?? update.error ?? remove.error)} />
      <Field
        label={t("services.nameVi")}
        error={touched && !d.nameVi.trim() ? t("common.required") : null}
      >
        <Input
          testID="crm-service-name"
          label={t("services.nameVi")}
          value={d.nameVi}
          onChangeText={(v) => {
            set({ nameVi: v });
          }}
        />
      </Field>
      <Field label={t("services.nameEn")} hint={t("services.nameEnHint")}>
        <Input
          label={t("services.nameEn")}
          value={d.nameEn}
          onChangeText={(v) => {
            set({ nameEn: v });
          }}
        />
      </Field>
      <Field label={t("services.category")}>
        <Select
          label={t("services.category")}
          placeholder={t("services.categoryPlaceholder")}
          value={d.categoryId}
          options={categories.map((cat) => ({
            id: cat.id,
            label: cat.name[locale] || cat.name.vi,
          }))}
          onChange={(v) => {
            set({ categoryId: v });
          }}
        />
      </Field>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Field
          hint={d.price !== null ? formatVND(d.price, locale) : undefined}
          flex={1}
          label={t("services.price")}
          error={touched && d.price === null ? t("common.required") : null}
        >
          <MoneyInput
            testID="crm-service-price"
            label={t("services.price")}
            value={d.price}
            onChange={(v) => {
              set({ price: v });
            }}
          />
        </Field>
        <Field flex={1} label={t("services.priceMax")} hint={t("services.priceMaxHint")}>
          <MoneyInput
            label={t("services.priceMax")}
            value={d.priceMax}
            onChange={(v) => {
              set({ priceMax: v });
            }}
          />
        </Field>
      </View>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Field
          label={t("services.duration")}
          error={touched && (d.duration ?? 0) < 5 ? t("services.durationMin") : null}
        >
          <NumberInput
            label={t("services.duration")}
            value={d.duration}
            onChange={(v) => {
              set({ duration: v });
            }}
          />
        </Field>
        <Field label={t("services.bufferAfter")} hint={t("services.bufferAfterHint")}>
          <NumberInput
            label={t("services.bufferAfter")}
            value={d.bufferAfter}
            onChange={(v) => {
              set({ bufferAfter: v });
            }}
          />
        </Field>
      </View>
      {/* Who performs it: prominent; silent only when the salon has exactly one bookable member. */}
      {d.staffDefault && bookable.length === 1 && staff.length === 1 ? null : (
        <AssignList
          testID="crm-service-staff"
          title={t("services.staff")}
          items={staff.map((s) => ({
            id: s.id,
            label: s.displayName,
            avatar: true,
            hint: s.isBookable ? undefined : t("team.notBookable"),
          }))}
          selected={chosen}
          onChange={(ids) => {
            set({ staffDefault: false, staffIds: ids });
          }}
          warning={unassigned && staff.length ? t("services.notBookable") : null}
          empty={t("services.noStaffYet")}
        />
      )}
      <Field label={t("services.description")}>
        <Input
          multiline
          label={t("services.description")}
          value={d.descriptionVi}
          onChangeText={(v) => {
            set({ descriptionVi: v });
          }}
        />
      </Field>

      <ListEditor
        title={t("services.variants")}
        hint={t("services.variantsHint")}
        addLabel={t("services.addVariant")}
        items={d.variants}
        onAdd={() => {
          set({
            variants: [...d.variants, { nameVi: "", nameEn: "", price: null, duration: null }],
          });
        }}
        onRemove={(i) => {
          set({ variants: d.variants.filter((_, j) => j !== i) });
        }}
        render={(v, i) => (
          <>
            <Input
              label={t("services.variantName")}
              placeholder={t("services.variantPlaceholder")}
              value={v.nameVi}
              onChangeText={(x) => {
                set({ variants: d.variants.map((y, j) => (j === i ? { ...y, nameVi: x } : y)) });
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <MoneyInput
                  label={t("services.price")}
                  value={v.price}
                  onChange={(x) => {
                    set({ variants: d.variants.map((y, j) => (j === i ? { ...y, price: x } : y)) });
                  }}
                />
              </View>
              <NumberInput
                label={t("services.duration")}
                value={v.duration}
                onChange={(x) => {
                  set({
                    variants: d.variants.map((y, j) => (j === i ? { ...y, duration: x } : y)),
                  });
                }}
              />
            </View>
          </>
        )}
      />

      <ListEditor
        title={t("services.addOns")}
        hint={t("services.addOnsHint")}
        addLabel={t("services.addAddOn")}
        items={d.addOns}
        onAdd={() => {
          set({
            addOns: [
              ...d.addOns,
              { nameVi: "", nameEn: "", extraPrice: null, extraDuration: null },
            ],
          });
        }}
        onRemove={(i) => {
          set({ addOns: d.addOns.filter((_, j) => j !== i) });
        }}
        render={(a, i) => (
          <>
            <Input
              label={t("services.addOnName")}
              placeholder={t("services.addOnPlaceholder")}
              value={a.nameVi}
              onChangeText={(x) => {
                set({ addOns: d.addOns.map((y, j) => (j === i ? { ...y, nameVi: x } : y)) });
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <MoneyInput
                  label={t("services.extraPrice")}
                  value={a.extraPrice}
                  onChange={(x) => {
                    set({
                      addOns: d.addOns.map((y, j) => (j === i ? { ...y, extraPrice: x } : y)),
                    });
                  }}
                />
              </View>
              <NumberInput
                label={t("services.extraDuration")}
                value={a.extraDuration}
                onChange={(x) => {
                  set({
                    addOns: d.addOns.map((y, j) => (j === i ? { ...y, extraDuration: x } : y)),
                  });
                }}
              />
            </View>
          </>
        )}
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text size={14} color={c.ink}>
          {t("services.activeLabel")}
        </Text>
        <Toggle
          value={d.isActive}
          label={t("services.activeLabel")}
          onChange={(v) => {
            set({ isActive: v });
          }}
        />
      </View>
    </Sheet>
  );
}

function ListEditor<T>({
  title,
  hint,
  addLabel,
  items,
  onAdd,
  onRemove,
  render,
}: {
  title: string;
  hint: string;
  addLabel: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (item: T, i: number) => ReactNode;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text role="uiSemiBold" size={14} color={c.ink}>
          {title}
        </Text>
        <Text size={12} color={c.muted}>
          {hint}
        </Text>
      </View>
      {items.map((item, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            gap: 8,
            padding: 12,
            borderRadius: 12,
            backgroundColor: c.surfaceMuted,
          }}
        >
          <View style={{ flex: 1, gap: 8 }}>{render(item, i)}</View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.delete")}
            onPress={() => {
              onRemove(i);
            }}
            style={{ padding: 6 }}
          >
            <Icon name="trash" size={16} color={c.body} />
          </Pressable>
        </View>
      ))}
      <View style={{ alignItems: "flex-start" }}>
        <CalmButton size="sm" variant="secondary" icon="plus" label={addLabel} onPress={onAdd} />
      </View>
    </View>
  );
}
