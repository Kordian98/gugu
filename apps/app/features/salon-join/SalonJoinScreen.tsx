import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type {
  CategoryItem,
  LocationItem,
  SalonRegistrationInput,
  SalonRegistrationResult,
} from "@gugu/contracts";
import { normalizeVnPhone } from "@gugu/domain";
import { Button, Text, color } from "@gugu/design-system";

import { AuthCard } from "@/features/auth/AuthCard";
import { EMAIL_RE, authErrorMessage } from "@/features/auth/errors";
import { TextField } from "@/features/auth/TextField";
import { ApiError, apiFetch } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

type Field =
  "businessName" | "categoryId" | "phone" | "provinceId" | "wardId" | "streetAddress" | "email";

/** Pill choice list on design tokens (no shared Select yet — TODO(design-system)). */
function Choices<T extends { id: string }>({
  label,
  items,
  value,
  onChange,
  name,
  error,
}: {
  label: string;
  items: readonly T[];
  value: string | null;
  onChange: (id: string) => void;
  name: (item: T) => string;
  error?: string | null;
}) {
  return (
    <View className="gap-1.5">
      <Text role="uiSemiBold" size={14} color={color.ink}>
        {label}
      </Text>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                onChange(item.id);
              }}
              style={{
                paddingHorizontal: 14,
                height: 40,
                borderRadius: 20,
                justifyContent: "center",
                borderWidth: 1,
                borderColor: selected ? color.lilac700 : color.line,
                backgroundColor: selected ? color.lilac100 : color.white,
              }}
            >
              <Text role={selected ? "uiSemiBold" : "ui"} size={14} color={color.ink}>
                {name(item)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text size={13} color={color.rose500}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Minimal salon registration (topic 05 Step 3; the CRM workspace UI comes with topic 07). Signed-in
 * users become owner at once; others give an email and confirm through the magic link.
 */
export function SalonJoinScreen() {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const router = useRouter();
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  const [form, setForm] = useState({
    businessName: "",
    categoryId: null as string | null,
    phone: "",
    provinceId: null as string | null,
    wardId: null as string | null,
    streetAddress: "",
    locationsHint: "1" as "1" | "2+",
    email: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SalonRegistrationResult | null>(null);

  const categories = useQuery({
    queryKey: ["public", "categories"],
    queryFn: () => apiFetch<{ items: CategoryItem[] }>("/public/categories"),
  });
  const provinces = useQuery({
    queryKey: ["public", "locations", "province"],
    queryFn: () => apiFetch<{ items: LocationItem[] }>("/public/locations?level=province"),
  });
  const wards = useQuery({
    queryKey: ["public", "locations", "ward", form.provinceId],
    queryFn: () =>
      apiFetch<{ items: LocationItem[] }>(
        `/public/locations?level=ward&parentId=${form.provinceId ?? ""}`,
      ),
    enabled: form.provinceId !== null,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === "provinceId" ? { wardId: null } : {}) }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const next: Partial<Record<Field, string>> = {};
    if (form.businessName.trim().length < 2) next.businessName = t("join.required");
    if (!form.categoryId) next.categoryId = t("join.required");
    if (!normalizeVnPhone(form.phone)) next.phone = t("join.invalidPhone");
    if (!form.provinceId) next.provinceId = t("join.required");
    if (!form.wardId) next.wardId = t("join.required");
    if (form.streetAddress.trim().length < 3) next.streetAddress = t("join.required");
    if (!signedIn && !EMAIL_RE.test(form.email.trim())) next.email = t("errors.invalidEmail");
    setErrors(next);
    if (Object.keys(next).length > 0 || !form.categoryId || !form.provinceId || !form.wardId)
      return;
    const body: SalonRegistrationInput = {
      businessName: form.businessName.trim(),
      categoryId: form.categoryId,
      phone: form.phone,
      provinceId: form.provinceId,
      wardId: form.wardId,
      streetAddress: form.streetAddress.trim(),
      locationsHint: form.locationsHint,
      locale,
      ...(signedIn ? {} : { email: form.email.trim().toLowerCase() }),
    };
    setBusy(true);
    setFormError(null);
    try {
      const result = await apiFetch<SalonRegistrationResult>("/salons/registrations", {
        method: "POST",
        body,
      });
      if (signedIn) await auth.reload();
      setDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === "salon.invalid_phone") {
        setErrors({ phone: t("join.invalidPhone") });
      } else setFormError(authErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard>
        <Text role="display" size={40} lineHeight={44}>
          {t("join.doneTitle")}
        </Text>
        <Text size={16} color={color.body}>
          {done.magicLinkStatus === "sent"
            ? t("join.doneCheckInbox", { email: form.email.trim().toLowerCase() })
            : done.magicLinkStatus === "rate_limited"
              ? t("join.doneSignInLater", { email: form.email.trim().toLowerCase() })
              : t("join.doneBody")}
        </Text>
        {done.magicLinkStatus === "not_required" ? (
          <Button
            label={t("join.goToBusiness")}
            onPress={() => {
              router.replace(`/${locale}/business`);
            }}
            height={52}
            fontSize={16}
            trailingArrow
          />
        ) : null}
      </AuthCard>
    );
  }

  const nameOf = (item: { name: { vi: string; en: string } }) => item.name[locale];
  return (
    <AuthCard wide>
      <Text role="display" size={40} lineHeight={44}>
        {t("join.title")}
      </Text>
      <Text size={16} color={color.body}>
        {t("join.subtitle")}
      </Text>
      <TextField
        label={t("join.businessName")}
        value={form.businessName}
        onChangeText={(v) => {
          set("businessName", v);
        }}
        error={errors.businessName ?? null}
      />
      <Choices
        label={t("join.category")}
        items={categories.data?.items ?? []}
        value={form.categoryId}
        onChange={(id) => {
          set("categoryId", id);
        }}
        name={nameOf}
        error={errors.categoryId ?? null}
      />
      <TextField
        label={t("join.phone")}
        value={form.phone}
        onChangeText={(v) => {
          set("phone", v);
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={errors.phone ?? null}
      />
      <Choices
        label={t("join.province")}
        items={provinces.data?.items ?? []}
        value={form.provinceId}
        onChange={(id) => {
          set("provinceId", id);
        }}
        name={nameOf}
        error={errors.provinceId ?? null}
      />
      {form.provinceId ? (
        <Choices
          label={t("join.ward")}
          items={wards.data?.items ?? []}
          value={form.wardId}
          onChange={(id) => {
            set("wardId", id);
          }}
          name={nameOf}
          error={errors.wardId ?? null}
        />
      ) : null}
      <TextField
        label={t("join.streetAddress")}
        value={form.streetAddress}
        onChangeText={(v) => {
          set("streetAddress", v);
        }}
        autoComplete="street-address"
        error={errors.streetAddress ?? null}
      />
      <Choices
        label={t("join.locations")}
        items={[
          { id: "1", name: t("join.locationsOne") },
          { id: "2+", name: t("join.locationsMany") },
        ]}
        value={form.locationsHint}
        onChange={(id) => {
          set("locationsHint", id === "2+" ? "2+" : "1");
        }}
        name={(i) => i.name}
      />
      {signedIn ? null : (
        <TextField
          label={t("join.email")}
          hint={t("join.emailHint")}
          value={form.email}
          onChangeText={(v) => {
            set("email", v);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          error={errors.email ?? null}
        />
      )}
      {formError ? (
        <Text size={14} color={color.rose500}>
          {formError}
        </Text>
      ) : null}
      <Button
        label={busy ? t("join.submitting") : t("join.submit")}
        onPress={() => void (busy ? undefined : submit())}
        height={52}
        fontSize={16}
        trailingArrow
      />
    </AuthCard>
  );
}
