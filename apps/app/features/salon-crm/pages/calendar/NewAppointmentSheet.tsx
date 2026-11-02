import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, Pill, Text, useCalm } from "@gugu/design-system";
import type { ClientSuggestion, Service, StaffMember } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useAvailability, useClientLookup, useCreateBooking } from "../../data/bookings";
import { minutesInZone, salonDate } from "../../data/dates";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Segmented, Sheet, Toggle } from "../../ui/form";
import { DayStrip, SlotGrid } from "./SlotPicker";

type Source = "phone" | "zalo_chat" | "walk_in" | "staff_created";

export type NewAppointmentPrefill = {
  date: string;
  staffId?: string | null;
  minutes?: number | null;
};

/**
 * New appointment (07 §3.4). Returning client in ≤ 5 taps: open → pick the client (last service
 * and staff prefilled) → pick a free time → confirm. Free times come from the engine; on a 409
 * (taken meanwhile) the list refreshes and the receptionist picks again.
 */
export function NewAppointmentSheet({
  services,
  staff,
  tz,
  prefill,
  onClose,
}: {
  services: Service[];
  staff: StaffMember[];
  tz: string;
  prefill: NewAppointmentPrefill;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const active = useMemo(() => services.filter((s) => s.isActive), [services]);
  const [q, setQ] = useState("");
  const [client, setClient] = useState<ClientSuggestion | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(
    active.length === 1 ? (active[0]?.id ?? null) : null,
  );
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(prefill.staffId ?? null);
  const [date, setDate] = useState(prefill.date);
  const [slot, setSlot] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("phone");
  const [note, setNote] = useState("");
  const lookup = useClientLookup(q, !walkIn && !client);
  const create = useCreateBooking();
  const service = active.find((s) => s.id === serviceId) ?? null;
  const people = staff.filter((s) => s.isBookable && (!service || service.staffIds.includes(s.id)));
  const availability = useAvailability(
    service && (!service.variants.length || variantId)
      ? { serviceId: service.id, variantId, addOnIds, staffId, date }
      : null,
  );
  const slots = availability.data?.days[0]?.slots ?? [];

  // A tap on an empty grid cell preselects that time when it is free.
  // A tap on an empty grid cell preselects that time when it is free (until the user picks).
  const [slotTouched, setSlotTouched] = useState(false);
  const autoSlot =
    prefill.minutes != null && !slotTouched
      ? (slots.find(
          (s) =>
            minutesInZone(new Date(s.startsAt), tz) === prefill.minutes &&
            salonDate(new Date(s.startsAt), tz) === date,
        )?.startsAt ?? null)
      : null;
  const chosenSlot = slot ?? autoSlot;

  const pickClient = (cl: ClientSuggestion) => {
    setClient(cl);
    const last = active.find((s) => s.id === cl.lastServiceId);
    if (last) {
      setServiceId(last.id);
      setVariantId(
        last.variants.some((v) => v.id === cl.lastVariantId)
          ? cl.lastVariantId
          : (last.variants[0]?.id ?? null),
      );
      setAddOnIds([]);
      if (prefill.staffId == null && last.staffIds.includes(cl.lastStaffId))
        setStaffId(cl.lastStaffId);
    }
    setSlot(null);
  };

  const digits = q.replace(/\D/g, "");
  const contact = client
    ? { name: client.name, phone: client.phone }
    : {
        name: name.trim() || (digits.length < 3 ? q.trim() : ""),
        phone: phone.trim() || (digits.length >= 8 ? q.trim() : ""),
      };
  const ready = Boolean(
    service &&
    chosenSlot &&
    (walkIn || (contact.name && contact.phone.replace(/\D/g, "").length >= 8)),
  );

  const submit = () => {
    if (!service || !chosenSlot) return;
    create.mutate(
      {
        serviceId: service.id,
        variantId,
        addOnIds,
        staffId,
        startsAt: chosenSlot,
        source: walkIn ? "walk_in" : source,
        customer: walkIn ? null : contact,
        note: note.trim() || null,
        overrides: [],
      },
      {
        onSuccess: onClose,
        onError: () => {
          setSlot(null);
          setSlotTouched(true);
          void availability.refetch();
        },
      },
    );
  };

  const serviceName = (s: Service) => (locale === "en" && s.name.en) || s.name.vi;

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("calendar.newTitle")}
      footer={
        <>
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID="crm-new-confirm"
            label={create.isPending ? t("common.saving") : t("calendar.confirmBooking")}
            onPress={() => {
              if (ready) submit();
            }}
          />
        </>
      }
    >
      <ErrorBanner text={errorText(create.error)} />

      <Section title={t("calendar.client")}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text size={13} color={c.body}>
            {t("calendar.walkIn")}
          </Text>
          <Toggle
            testID="crm-walk-in"
            value={walkIn}
            label={t("calendar.walkIn")}
            onChange={(v) => {
              setWalkIn(v);
              setClient(null);
              if (v) setDate(salonDate(new Date(), tz));
            }}
          />
        </View>
        {walkIn ? null : client ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.accentBg,
              backgroundColor: c.accentSoft,
            }}
          >
            <Avatar name={client.name} size={34} />
            <View style={{ flex: 1 }}>
              <Text role="uiSemiBold" size={14} color={c.ink}>
                {client.name}
              </Text>
              <Text size={12} color={c.body}>
                {`${client.phone} · ${t("calendar.visits", { count: client.visits })}`}
              </Text>
            </View>
            {client.noShows > 0 ? (
              <Pill
                tone="down"
                size={11}
                label={t("calendar.noShows", { count: client.noShows })}
              />
            ) : null}
            <CalmButton
              size="sm"
              variant="ghost"
              label={t("calendar.change")}
              onPress={() => {
                setClient(null);
              }}
            />
          </View>
        ) : (
          <>
            <Input
              testID="crm-client-search"
              label={t("calendar.clientSearch")}
              placeholder={t("calendar.clientSearch")}
              value={q}
              onChangeText={setQ}
            />
            {(lookup.data?.items ?? []).map((cl) => (
              <Pressable
                key={cl.phone}
                testID="crm-client-suggestion"
                accessibilityRole="button"
                onPress={() => {
                  pickClient(cl);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}
              >
                <Avatar name={cl.name} size={30} />
                <View style={{ flex: 1 }}>
                  <Text role="uiMedium" size={14} color={c.ink}>
                    {cl.name}
                  </Text>
                  <Text size={12} color={c.muted}>
                    {cl.phone}
                  </Text>
                </View>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Field flex={1} label={t("calendar.newClientName")}>
                <Input
                  testID="crm-client-name"
                  label={t("calendar.newClientName")}
                  value={name || (digits.length < 3 ? q : "")}
                  onChangeText={setName}
                />
              </Field>
              <Field flex={1} label={t("calendar.newClientPhone")}>
                <Input
                  testID="crm-client-phone"
                  label={t("calendar.newClientPhone")}
                  keyboardType="phone-pad"
                  value={phone || (digits.length >= 3 ? q : "")}
                  onChangeText={setPhone}
                />
              </Field>
            </View>
          </>
        )}
      </Section>

      <Section title={t("calendar.service")}>
        <Chips
          items={active.map((s) => ({
            id: s.id,
            label: serviceName(s),
            sub: formatVND(s.price, locale),
          }))}
          value={serviceId}
          onChange={(id) => {
            setServiceId(id);
            const s = active.find((x) => x.id === id);
            setVariantId(s?.variants[0]?.id ?? null);
            setAddOnIds([]);
            if (staffId && s && !s.staffIds.includes(staffId)) setStaffId(null);
            setSlot(null);
            setSlotTouched(true);
          }}
        />
        {service?.variants.length ? (
          <Chips
            items={service.variants
              .filter((v) => v.isActive)
              .map((v) => ({
                id: v.id,
                label: (locale === "en" && v.name.en) || v.name.vi,
                sub: v.price !== null ? formatVND(v.price, locale) : undefined,
              }))}
            value={variantId}
            onChange={(id) => {
              setVariantId(id);
              setSlot(null);
              setSlotTouched(true);
            }}
          />
        ) : null}
        {service?.addOns.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {service.addOns
              .filter((a) => a.isActive)
              .map((a) => {
                const on = addOnIds.includes(a.id);
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      setAddOnIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]));
                      setSlot(null);
                      setSlotTouched(true);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      height: 34,
                      borderRadius: 10,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: on ? c.accentBg : c.line,
                      backgroundColor: on ? c.accentSoft : c.surface,
                    }}
                  >
                    <Text size={13} color={on ? c.accent : c.ink}>
                      {`+ ${(locale === "en" && a.name.en) || a.name.vi} · ${formatVND(a.extraPrice, locale)}`}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        ) : null}
      </Section>

      {service ? (
        <Section title={t("calendar.staff")}>
          <Chips
            items={[
              { id: "any", label: t("calendar.anyStaff") },
              ...people.map((s) => ({ id: s.id, label: s.displayName })),
            ]}
            value={staffId ?? "any"}
            onChange={(id) => {
              setStaffId(id === "any" ? null : id);
              setSlot(null);
              setSlotTouched(true);
            }}
          />
        </Section>
      ) : null}

      {service ? (
        <Section title={t("calendar.time")}>
          <DayStrip
            value={date}
            tz={tz}
            onChange={(d) => {
              setDate(d);
              setSlot(null);
              setSlotTouched(true);
            }}
          />
          <SlotGrid
            tz={tz}
            loading={availability.isPending && availability.fetchStatus !== "idle"}
            slots={slots}
            selected={chosenSlot}
            onSelect={(s) => {
              setSlot(s);
            }}
          />
        </Section>
      ) : null}

      {walkIn ? null : (
        <Section title={t("calendar.source")}>
          <Segmented<Source>
            value={source}
            onChange={setSource}
            options={(["phone", "zalo_chat", "staff_created"] as const).map((s) => ({
              id: s,
              label: t(`booking.source.${s}`),
            }))}
          />
        </Section>
      )}
      <Field label={t("booking.note")}>
        <Input multiline label={t("booking.note")} value={note} onChangeText={setNote} />
      </Field>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 10 }}>
      <Text
        role="uiSemiBold"
        size={12}
        color={c.ink}
        style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Chips({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; sub?: string | undefined }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { c } = useCalm();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((i) => {
        const on = i.id === value;
        return (
          <Pressable
            key={i.id}
            testID="crm-chip"
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              onChange(i.id);
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: on ? c.accentBg : c.line,
              backgroundColor: on ? c.accentSoft : c.surface,
            }}
          >
            <Text role={on ? "uiSemiBold" : "ui"} size={14} color={on ? c.accent : c.ink}>
              {i.label}
            </Text>
            {i.sub ? (
              <Text size={11} color={c.muted}>
                {i.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
