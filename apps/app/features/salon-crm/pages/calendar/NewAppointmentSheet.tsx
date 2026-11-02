import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, DatePicker, Pill, Text, useCalm } from "@gugu/design-system";
import type { ClientSuggestion, Service, StaffMember } from "@gugu/contracts";
import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { useAvailability, useClientLookup, useCreateBooking } from "../../data/bookings";
import { useSettings } from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";
import {
  addDays,
  clockMinutes,
  instantAt,
  isoWeekday,
  minutesInZone,
  salonDate,
} from "../../data/dates";
import { useErrorText } from "../../ui/errors";
import {
  ErrorBanner,
  Field,
  Input,
  Segmented,
  Sheet,
  TimeInput,
  Toggle,
  isClock,
} from "../../ui/form";
import { SlotGrid } from "./SlotPicker";

type Source = "phone" | "zalo_chat" | "walk_in" | "staff_created";

export type NewAppointmentPrefill = {
  date: string;
  staffId?: string | null;
  minutes?: number | null;
  /** From drag-to-create: services longer than this are hidden unless "show all" is on. */
  durationMinutes?: number | null;
};

/**
 * New appointment (07 §3.4). Returning client in ≤ 5 taps: open → pick the client (last service
 * and staff prefilled) → pick a free time → confirm. Free times come from the engine; on a 409
 * (taken meanwhile) the list refreshes and the receptionist picks again.
 */
/** First and last day of the month containing `ymd`. */
const monthOf = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return {
    first: `${ymd.slice(0, 7)}-01`,
    last: `${ymd.slice(0, 7)}-${String(last).padStart(2, "0")}`,
  };
};

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
  const { can, summary } = useSalon();
  const [showAll, setShowAll] = useState(false);
  const fits = (s: Service) =>
    !prefill.durationMinutes ||
    Math.min(s.durationMinutes, ...s.variants.map((v) => v.durationMinutes ?? s.durationMinutes)) <=
      prefill.durationMinutes;
  const active = useMemo(() => services.filter((s) => s.isActive), [services]);
  const offered = showAll ? active : active.filter(fits);
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
  const settings = useSettings();
  const today = salonDate(new Date(), tz);
  const windowDays = settings.data?.booking.bookingWindowDays ?? 60;
  const maxDate = addDays(today, windowDays);
  const canOverride = can("bookings.write") && summary?.myRole !== "staff";
  const [month, setMonth] = useState<{ first: string; last: string }>(() => monthOf(prefill.date));
  const beyondWindow = date > maxDate;
  const availability = useAvailability(
    service && (!service.variants.length || variantId) && month.last >= today
      ? {
          serviceId: service.id,
          variantId,
          addOnIds,
          staffId,
          date: month.first < today ? today : month.first,
          to: month.last > maxDate ? maxDate : month.last,
        }
      : null,
  );
  const slots = availability.data?.days.find((d) => d.date === date)?.slots ?? [];
  const freeDays = new Set(
    (availability.data?.days ?? []).filter((d) => d.slots.length).map((d) => d.date),
  );
  const [manualTime, setManualTime] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const closedWeekdays = new Set(
    [1, 2, 3, 4, 5, 6, 7].filter(
      (w) =>
        !(settings.data?.openingHours.days.find((d) => d.weekday === w)?.intervals.length ?? 0),
    ),
  );
  const dayState = (d: string): "closed" | "unavailable" | null => {
    if (settings.data?.openingHours.days.length && closedWeekdays.has(isoWeekday(d)))
      return "closed";
    if (settings.data?.holidays.some((h) => h.closed && h.startDate <= d && d <= h.endDate))
      return "closed";
    if (availability.data && d >= today && d <= maxDate && !freeDays.has(d)) return "unavailable";
    return null;
  };

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
  const manualSlot =
    beyondWindow && isClock(manualTime) ? instantAt(date, clockMinutes(manualTime), tz) : null;
  const chosenSlot = beyondWindow ? manualSlot : (slot ?? autoSlot);

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
    (!beyondWindow || (staffId && overrideReason.trim().length >= 3)) &&
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
        overrides: beyondWindow ? ["horizon"] : [],
        ...(beyondWindow ? { overrideReason: overrideReason.trim() } : {}),
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
                disabled={cl.phoneMasked}
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
          items={offered.map((s) => ({
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
        {prefill.durationMinutes && offered.length < active.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setShowAll((v) => !v);
            }}
          >
            <Text size={12} color={c.accent}>
              {showAll
                ? t("calendar.fitsRange", { min: prefill.durationMinutes })
                : t("calendar.showAllServices", { count: active.length - offered.length })}
            </Text>
          </Pressable>
        ) : null}
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
          <DatePicker
            testID="crm-date-picker"
            value={date}
            today={today}
            min={today}
            max={maxDate}
            allowBeyondMax={canOverride}
            dayState={dayState}
            localeTag={locale === "vi" ? "vi-VN" : "en-US"}
            prevLabel={t("calendar.prevMonth")}
            nextLabel={t("calendar.nextMonth")}
            onMonthChange={(first, last) => {
              setMonth({ first, last });
            }}
            onChange={(d) => {
              setDate(d);
              setSlot(null);
              setSlotTouched(true);
            }}
          />
          {beyondWindow ? (
            <View
              testID="crm-beyond-window"
              style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.surfaceMuted }}
            >
              <Text size={13} color={c.body}>
                {t("calendar.beyondWindow", { days: windowDays })}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <Field label={t("calendar.manualTime")}>
                  <TimeInput
                    label={t("calendar.manualTime")}
                    value={manualTime}
                    onChange={setManualTime}
                  />
                </Field>
                <Field
                  flex={1}
                  label={t("calendar.overrideReason")}
                  hint={staffId ? undefined : t("calendar.overrideNeedsStaff")}
                >
                  <Input
                    label={t("calendar.overrideReason")}
                    value={overrideReason}
                    onChangeText={setOverrideReason}
                  />
                </Field>
              </View>
            </View>
          ) : null}
          {beyondWindow ? null : (
            <SlotGrid
              tz={tz}
              loading={availability.isPending && availability.fetchStatus !== "idle"}
              slots={slots}
              selected={chosenSlot}
              onSelect={(s) => {
                setSlot(s);
              }}
            />
          )}
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
