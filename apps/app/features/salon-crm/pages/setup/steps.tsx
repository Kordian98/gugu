import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, CalmCard, Icon, Text, useCalm } from "@gugu/design-system";
import type { SalonSettings, Service, StaffMember, WeeklyScheduleInput } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, MoneyInput, NumberInput } from "../../ui/form";

/** Services step: AI import entry point (topic 08) + quick manual add (name, price, duration). */
export function ServicesStep({ services }: { services: Service[] }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(30);
  const create = useCrmMutation(crmApi.createService, ["services"]);
  return (
    <View style={{ gap: 16 }}>
      <View
        testID="crm-wizard-ai"
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
          padding: 16,
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: c.accentBg,
          backgroundColor: c.accentSoft,
        }}
      >
        <Icon name="sparkles" size={22} color={c.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="uiSemiBold" size={15} color={c.ink}>
            {t("setup.title")}
          </Text>
          <Text size={13} color={c.body}>
            {t("setup.importPending")}
          </Text>
        </View>
      </View>
      <CalmCard style={{ gap: 12 }}>
        <Text role="uiSemiBold" size={15} color={c.ink}>
          {t("wizard.quickService")}
        </Text>
        <ErrorBanner text={errorText(create.error)} />
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field flex={2} label={t("services.nameVi")}>
            <Input
              testID="crm-wizard-service-name"
              label={t("services.nameVi")}
              placeholder={t("wizard.servicePlaceholder")}
              value={name}
              onChangeText={setName}
            />
          </Field>
          <Field flex={1} label={t("services.price")}>
            <MoneyInput
              testID="crm-wizard-service-price"
              label={t("services.price")}
              value={price}
              onChange={setPrice}
            />
          </Field>
          <Field label={t("services.duration")}>
            <NumberInput label={t("services.duration")} value={duration} onChange={setDuration} />
          </Field>
          <CalmButton
            testID="crm-wizard-service-add"
            icon="plus"
            label={t("services.add")}
            onPress={() => {
              if (!name.trim() || price === null || (duration ?? 0) < 5) return;
              create.mutate(
                { name: { vi: name.trim() }, price, durationMinutes: duration ?? 30 },
                {
                  onSuccess: () => {
                    setName("");
                    setPrice(null);
                  },
                },
              );
            }}
          />
        </View>
        {services.map((s) => (
          <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="check" size={14} color={c.accent} />
            <Text size={14} color={c.ink} style={{ flex: 1 }}>
              {(locale === "en" && s.name.en) || s.name.vi}
            </Text>
            <Text size={13} color={c.body}>
              {`${formatVND(s.price, locale)} · ${t("services.minutes", { count: s.durationMinutes })}`}
            </Text>
          </View>
        ))}
      </CalmCard>
    </View>
  );
}

/** Weekly hours for a new team member: the salon's opening hours, else Mon–Sat 9:00–18:00. */
function defaultSchedule(settings: SalonSettings): WeeklyScheduleInput {
  const days = settings.openingHours.days.length
    ? settings.openingHours.days.map((d) => ({
        weekday: d.weekday,
        intervals: d.intervals.slice(0, 1),
      }))
    : [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        intervals: [{ start: "09:00", end: "18:00" }],
      }));
  return { days };
}

/**
 * Team step: add yourself and/or team members by name. Each gets the salon's opening hours and all
 * active services, so the salon is bookable at once (fine-tune later under Team).
 */
export function TeamStep({
  team,
  services,
  settings,
}: {
  team: StaffMember[];
  services: Service[];
  settings: SalonSettings;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const { user } = useAuth();
  const myName = user?.displayName ?? user?.email?.split("@")[0] ?? t("shell.roles.owner");
  const [name, setName] = useState("");
  const create = useCrmMutation(crmApi.createStaff, ["team", "services"]);
  const schedule = useCrmMutation(crmApi.replaceSchedule, ["team"]);
  const serviceIds = services.filter((s) => s.isActive).map((s) => s.id);
  const add = (displayName: string, linkToMe: boolean) => {
    create.mutate(
      { displayName, linkToMe, serviceIds },
      {
        onSuccess: ({ id }) => {
          schedule.mutate({ id, body: defaultSchedule(settings) });
          setName("");
        },
      },
    );
  };
  return (
    <CalmCard style={{ gap: 14 }}>
      <ErrorBanner text={errorText(create.error ?? schedule.error)} />
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <CalmButton
          testID="crm-wizard-add-me"
          variant="secondary"
          icon="plus"
          label={t("team.addMe")}
          onPress={() => {
            add(myName, true);
          }}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field flex={1} label={t("team.name")}>
          <Input
            testID="crm-wizard-staff-name"
            label={t("team.name")}
            value={name}
            onChangeText={setName}
          />
        </Field>
        <CalmButton
          testID="crm-wizard-staff-add"
          icon="plus"
          label={t("team.add")}
          onPress={() => {
            if (name.trim()) add(name.trim(), false);
          }}
        />
      </View>
      <Text size={12} color={c.muted}>
        {t("wizard.teamHint")}
      </Text>
      {team.map((s) => (
        <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Avatar name={s.displayName} size={30} />
          <Text size={14} color={c.ink} style={{ flex: 1 }}>
            {s.displayName}
          </Text>
          <Text size={12} color={c.body}>
            {t("team.servicesCount", { count: s.serviceIds.length })}
          </Text>
        </View>
      ))}
    </CalmCard>
  );
}
