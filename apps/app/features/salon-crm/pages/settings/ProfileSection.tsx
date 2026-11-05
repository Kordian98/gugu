import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, Text, useCalm } from "@gugu/design-system";
import type { LocationItem, SalonSettings } from "@gugu/contracts";

import { apiFetch } from "@/services/auth/api";
import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Select } from "../../ui/form";

const useLocations = (level: "province" | "ward", parentId?: string | null) =>
  useQuery({
    queryKey: ["public", "locations", level, parentId ?? null],
    queryFn: () =>
      apiFetch<{ items: LocationItem[] }>(
        `/public/locations?level=${level}${parentId ? `&parentId=${parentId}` : ""}`,
      ),
    enabled: level === "province" || Boolean(parentId),
    staleTime: 3_600_000,
  });

/** Salon name, phone, short description and address (province → ward, post-2025 model). */
export function ProfileSection({
  settings,
  canEdit,
}: {
  settings: SalonSettings;
  canEdit: boolean;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const p = settings.profile;
  const [name, setName] = useState(p.name);
  const [phone, setPhone] = useState(p.phone ?? "");
  const [description, setDescription] = useState(p.description?.vi ?? "");
  const [street, setStreet] = useState(p.address?.streetAddress ?? "");
  const [provinceId, setProvinceId] = useState<string | null>(p.address?.provinceId ?? null);
  const [wardId, setWardId] = useState<string | null>(p.address?.wardId ?? null);
  const [saved, setSaved] = useState(false);
  const provinces = useLocations("province");
  const wards = useLocations("ward", provinceId);
  const save = useCrmMutation(crmApi.updateProfile, ["settings"]);
  const addressStarted = Boolean(street.trim() || provinceId || wardId);
  const ready =
    name.trim().length >= 2 &&
    (!phone.trim() || phone.trim().length >= 8) &&
    (!addressStarted || Boolean(street.trim().length >= 3 && provinceId && wardId));
  const label = (l: LocationItem) => l.name[locale] || l.name.vi;

  return (
    <CalmCard style={{ gap: 14 }}>
      <Text role="uiSemiBold" size={16} color={c.ink}>
        {t("settings.profile")}
      </Text>
      <ErrorBanner text={errorText(save.error)} />
      <Text size={16} color={c.body}>
        {t("settings.contactOptional")}
      </Text>
      {addressStarted && !(street.trim().length >= 3 && provinceId && wardId) ? (
        <ErrorBanner text={t("settings.addressIncomplete")} />
      ) : null}
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Field flex={1.4} label={t("settings.salonName")}>
          <Input
            testID="crm-profile-name"
            editable={canEdit}
            label={t("settings.salonName")}
            value={name}
            onChangeText={setName}
          />
        </Field>
        <Field flex={1} label={t("settings.phone")}>
          <Input
            editable={canEdit}
            label={t("settings.phone")}
            value={phone}
            keyboardType="phone-pad"
            onChangeText={setPhone}
          />
        </Field>
      </View>
      <Field label={t("settings.description")} hint={t("settings.descriptionHint")}>
        <Input
          editable={canEdit}
          multiline
          label={t("settings.description")}
          value={description}
          onChangeText={setDescription}
        />
      </Field>
      <Field label={t("settings.street")}>
        <Input
          editable={canEdit}
          label={t("settings.street")}
          value={street}
          onChangeText={setStreet}
        />
      </Field>
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
        <Field flex={1} label={t("settings.province")}>
          <Select
            label={t("settings.province")}
            placeholder={t("settings.pick")}
            value={provinceId}
            options={(provinces.data?.items ?? []).map((l) => ({ id: l.id, label: label(l) }))}
            onChange={(v) => {
              setProvinceId(v);
              setWardId(null);
            }}
          />
        </Field>
        <Field flex={1} label={t("settings.ward")}>
          <Select
            label={t("settings.ward")}
            placeholder={t("settings.pick")}
            value={wardId}
            options={(wards.data?.items ?? []).map((l) => ({ id: l.id, label: label(l) }))}
            onChange={setWardId}
          />
        </Field>
      </View>
      {canEdit ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          {saved ? (
            <Text size={13} color={c.accent}>
              {t("common.saved")}
            </Text>
          ) : null}
          <CalmButton
            disabled={save.isPending || !ready}
            testID="crm-profile-save"
            label={save.isPending ? t("common.saving") : t("common.save")}
            onPress={() => {
              if (!ready || save.isPending) return;
              setSaved(false);
              save.mutate(
                {
                  name: name.trim(),
                  phone: phone.trim() || null,
                  description: description.trim()
                    ? { vi: description.trim(), en: p.description?.en ?? "" }
                    : null,
                  streetAddress: street.trim() || null,
                  provinceId,
                  wardId,
                },
                {
                  onSuccess: () => {
                    setSaved(true);
                  },
                },
              );
            }}
          />
        </View>
      ) : null}
    </CalmCard>
  );
}
