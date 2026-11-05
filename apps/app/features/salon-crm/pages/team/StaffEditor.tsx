import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Text, typeScale, useCalm } from "@gugu/design-system";
import { STAFF_COLORS, type Service, type StaffMember } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import { AssignList } from "../../ui/AssignList";
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
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [touched, setTouched] = useState(false);
  const create = useCrmMutation(crmApi.createStaff, ["team", "services"]);
  const update = useCrmMutation(crmApi.updateStaff, ["team", "services"]);
  const remove = useCrmMutation(crmApi.removeStaff, ["team", "services"]);
  const busy = create.isPending || update.isPending || remove.isPending;

  const save = () => {
    if (busy) return;
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

  if (confirmRemoval && staff)
    return (
      <Sheet
        open={open}
        dismissDisabled={busy}
        onClose={() => {
          setConfirmRemoval(false);
        }}
        closeLabel={t("common.cancel")}
        title={t("team.removeTitle", { name: staff.displayName })}
        footer={
          <>
            <CalmButton
              label={t("common.cancel")}
              variant="secondary"
              disabled={busy}
              onPress={() => {
                setConfirmRemoval(false);
              }}
            />
            <CalmButton
              testID="crm-staff-remove-confirm"
              label={t("team.remove")}
              disabled={busy}
              onPress={() => {
                if (!busy) remove.mutate(staff.id, { onSuccess: onClose });
              }}
            />
          </>
        }
      >
        <ErrorBanner text={errorText(remove.error)} />
        <Text size={typeScale.body} color={c.body}>
          {t("team.removeBody")}
        </Text>
      </Sheet>
    );

  return (
    <Sheet
      open={open}
      dismissDisabled={busy}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={staff ? t("team.editTitle") : t("team.newTitle")}
      footer={
        <>
          {staff && staff.member?.role !== "owner" ? (
            <CalmButton
              testID="crm-staff-remove"
              disabled={busy}
              variant="ghost"
              icon="trash"
              label={t("team.remove")}
              onPress={() => {
                setConfirmRemoval(true);
              }}
            />
          ) : null}
          <CalmButton
            variant="secondary"
            disabled={busy}
            label={t("common.cancel")}
            onPress={onClose}
          />
          <CalmButton
            disabled={busy || !name.trim()}
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
      <AssignList
        testID="crm-staff-services"
        title={t("team.services")}
        items={services.map((x) => ({
          id: x.id,
          label: (locale === "en" && x.name.en) || x.name.vi,
          hint: x.isActive ? undefined : t("services.inactive"),
        }))}
        selected={serviceIds}
        onChange={setPicked}
        warning={
          bookable &&
          services.length &&
          !services.some((x) => x.isActive && serviceIds.includes(x.id))
            ? t("team.noServicesBookable")
            : null
        }
        empty={t("team.noServicesYet")}
      />
    </Sheet>
  );
}
