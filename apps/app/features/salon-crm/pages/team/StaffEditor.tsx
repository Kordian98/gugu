import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Text, useCalm } from "@gugu/design-system";
import { STAFF_COLORS, type Service, type StaffMember } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Segmented, Sheet, Toggle } from "../../ui/form";

type Color = (typeof STAFF_COLORS)[number];

/** Add or edit a team member's profile: name, calendar colour, bookable, services. */
export function StaffEditor({
  staff,
  services,
  open,
  onClose,
}: {
  staff: StaffMember | null;
  services: Service[];
  open: boolean;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const [name, setName] = useState(staff?.displayName ?? "");
  const [colorKey, setColorKey] = useState<Color>(staff?.color ?? "lilac");
  const [bookable, setBookable] = useState(staff?.isBookable ?? true);
  // New member: every active service preselected (the API does the same when none are sent).
  const [picked, setPicked] = useState<string[] | null>(staff?.serviceIds ?? null);
  const serviceIds = picked ?? services.filter((s) => s.isActive).map((s) => s.id);
  const [touched, setTouched] = useState(false);
  const create = useCrmMutation(crmApi.createStaff, ["team", "services"]);
  const update = useCrmMutation(crmApi.updateStaff, ["team", "services"]);
  const remove = useCrmMutation(crmApi.removeStaff, ["team", "services"]);
  const busy = create.isPending || update.isPending;

  const save = () => {
    setTouched(true);
    if (!name.trim()) return;
    const body = {
      displayName: name.trim(),
      color: colorKey,
      isBookable: bookable,
      ...(picked ? { serviceIds: picked } : {}),
    };
    if (staff) update.mutate({ id: staff.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={staff ? t("team.editTitle") : t("team.newTitle")}
      footer={
        <>
          {staff && staff.member?.role !== "owner" ? (
            <CalmButton
              variant="ghost"
              icon="trash"
              label={t("team.remove")}
              onPress={() => {
                remove.mutate(staff.id, { onSuccess: onClose });
              }}
            />
          ) : null}
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID="crm-staff-save"
            label={busy ? t("common.saving") : t("common.save")}
            onPress={save}
          />
        </>
      }
    >
      <ErrorBanner text={errorText(create.error ?? update.error ?? remove.error)} />
      <Field label={t("team.name")} error={touched && !name.trim() ? t("common.required") : null}>
        <Input testID="crm-staff-name" label={t("team.name")} value={name} onChangeText={setName} />
      </Field>
      <Field label={t("team.color")}>
        <Segmented<Color>
          value={colorKey}
          onChange={setColorKey}
          options={STAFF_COLORS.map((k) => ({ id: k, label: t(`team.colors.${k}`) }))}
        />
      </Field>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text role="uiMedium" size={14} color={c.ink}>
            {t("team.bookable")}
          </Text>
          <Text size={12} color={c.muted}>
            {t("team.bookableHint")}
          </Text>
        </View>
        <Toggle value={bookable} onChange={setBookable} label={t("team.bookable")} />
      </View>
      <Field
        label={t("team.services")}
        hint={services.length ? undefined : t("team.noServicesYet")}
      >
        <View style={{ gap: 4 }}>
          {services.map((s) => {
            const label = (locale === "en" && s.name.en) || s.name.vi;
            return (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <Text size={14} color={c.ink}>
                  {label}
                </Text>
                <Toggle
                  value={serviceIds.includes(s.id)}
                  label={label}
                  onChange={(v) => {
                    setPicked(v ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id));
                  }}
                />
              </View>
            );
          })}
        </View>
      </Field>
    </Sheet>
  );
}
