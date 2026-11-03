import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, DatePicker, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type {
  ClientSuggestion,
  EarliestSlots,
  RuleOverride,
  Service,
  StaffMember,
} from "@gugu/contracts";
import { formatDateLong, formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import {
  useAvailability,
  useBookingFeatures,
  useClientLookup,
  useCreateBooking,
  requiredOverrides,
  useEarliestSlots,
} from "../../data/bookings";
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
import { useCrmNav } from "../../shell/useCrmNav";
import { BookabilityWarning } from "../../ui/BookabilityWarning";
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
import { type ExtraLine, nextServicesOf, ServiceLines } from "./ServiceLines";
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
  client: initialClient = null,
  onClose,
}: {
  services: Service[];
  staff: StaffMember[];
  tz: string;
  prefill: NewAppointmentPrefill;
  /** "Book again" from a client profile: client, last service and staff preselected. */
  client?: ClientSuggestion | null | undefined;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { go } = useCrmNav();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const { can } = useSalon();
  const [showAll, setShowAll] = useState(false);
  const fits = (s: Service) =>
    !prefill.durationMinutes ||
    Math.min(s.durationMinutes, ...s.variants.map((v) => v.durationMinutes ?? s.durationMinutes)) <=
      prefill.durationMinutes;
  const active = useMemo(() => services.filter((s) => s.isActive), [services]);
  const offered = showAll ? active : active.filter(fits);
  const [q, setQ] = useState("");
  const [client, setClient] = useState<ClientSuggestion | null>(initialClient);
  const again = initialClient
    ? active.find((s) => s.id === initialClient.lastServiceId)
    : undefined;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(
    again?.id ?? (active.length === 1 ? (active[0]?.id ?? null) : null),
  );
  const [variantId, setVariantId] = useState<string | null>(again?.variants[0]?.id ?? null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(
    prefill.staffId ??
      (again && initialClient && again.staffIds.includes(initialClient.lastStaffId)
        ? initialClient.lastStaffId
        : null),
  );
  const [date, setDate] = useState(prefill.date);
  const [slot, setSlot] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("phone");
  const [note, setNote] = useState("");
  // Further services in sequence (06 M6.8), only when the engine flag is on.
  const features = useBookingFeatures();
  const maxExtra = features.data?.multiService ? Math.max(0, features.data.maxServices - 1) : 0;
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const nextServices = nextServicesOf(extras, active);
  const lookup = useClientLookup(q, !walkIn && !client);
  const create = useCreateBooking();
  const service = active.find((s) => s.id === serviceId) ?? null;
  const people = staff.filter((s) => s.isBookable && (!service || service.staffIds.includes(s.id)));
  const settings = useSettings();
  const today = salonDate(new Date(), tz);
  const windowDays = settings.data?.booking.bookingWindowDays ?? 60;
  const maxDate = addDays(today, windowDays);
  const canOverride = can("bookings.override_rules");
  const [month, setMonth] = useState<{ first: string; last: string }>(() => monthOf(prefill.date));
  const beyondWindow = date > maxDate;
  // Outside the rules (q18): after hours / short notice / beyond the window, with a reason; audited
  // by the API (bookings.override_rules). Never lifts the overlap guarantee.
  const [overrideOn, setOverrideOn] = useState(false);
  const manualMode = beyondWindow || overrideOn;
  const availability = useAvailability(
    service && (!service.variants.length || variantId) && nextServices && month.last >= today
      ? {
          serviceId: service.id,
          variantId,
          addOnIds,
          staffId,
          date: month.first < today ? today : month.first,
          to: month.last > maxDate ? maxDate : month.last,
          nextServices,
        }
      : null,
  );
  const slots = availability.data?.days.find((d) => d.date === date)?.slots ?? [];
  // Whole month empty: say why (nobody assigned, no working hours, window) instead of "no times".
  const reason =
    service && people.length === 0
      ? ("no_staff_assigned" as const)
      : (availability.data?.unavailableReason ?? null);
  const reasonFix =
    reason === "no_staff_assigned"
      ? { label: t("calendar.unavailable.fixServices"), path: "/business/services" }
      : reason === "no_working_hours"
        ? { label: t("calendar.unavailable.fixHours"), path: "/business/team" }
        : reason === "no_resource"
          ? { label: t("calendar.unavailable.fixResources"), path: "/business/resources" }
          : null;
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
    manualMode && isClock(manualTime) ? instantAt(date, clockMinutes(manualTime), tz) : null;
  const chosenSlot = manualMode ? manualSlot : (slot ?? autoSlot);
  // Drag-to-create on a time that is not free: offer the earliest options instead.
  const dragUnavailable =
    prefill.minutes != null &&
    !slotTouched &&
    !beyondWindow &&
    availability.isSuccess &&
    !availability.isPlaceholderData &&
    autoSlot === null &&
    reason === null;
  const [earliestOpen, setEarliestOpen] = useState(false);
  const earliest = useEarliestSlots(
    service && (!service.variants.length || variantId) && nextServices
      ? { serviceId: service.id, variantId, addOnIds, staffId, nextServices }
      : null,
    earliestOpen,
  );
  const pickEarliest = (e: { date: string; startsAt: string; staffIds: string[] }) => {
    setDate(e.date);
    setMonth(monthOf(e.date));
    if (!staffId && e.staffIds[0]) setStaffId(e.staffIds[0]);
    setSlot(e.startsAt);
    setSlotTouched(true);
    setEarliestOpen(false);
  };

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
  const emailValue = email.trim();
  const emailInvalid = emailValue !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  const contact = client
    ? { name: client.name, phone: client.phone, email: emailValue || null }
    : {
        name: name.trim() || (digits.length < 3 ? q.trim() : ""),
        phone: phone.trim() || (digits.length >= 8 ? q.trim() : ""),
        email: emailValue || null,
      };
  const ready = Boolean(
    service &&
    chosenSlot &&
    nextServices &&
    (!manualMode || (staffId && overrideReason.trim().length >= 3)) &&
    (walkIn || (contact.name && contact.phone.replace(/\D/g, "").length >= 8 && !emailInvalid)),
  );

  const submit = (overrides: RuleOverride[] = []) => {
    if (!service || !chosenSlot) return;
    create.mutate(
      {
        serviceId: service.id,
        variantId,
        addOnIds,
        staffId,
        startsAt: chosenSlot,
        nextServices: nextServices ?? [],
        source: walkIn ? "walk_in" : source,
        customer: walkIn ? null : contact,
        note: note.trim() || null,
        // Only the rules this time actually breaks are overridden (and audited, 06).
        overrides,
        ...(overrides.length ? { overrideReason: overrideReason.trim() } : {}),
      },
      {
        onSuccess: onClose,
        onError: (e) => {
          const codes = requiredOverrides(e);
          if (codes?.length && manualMode && overrides.length === 0 && canOverride) {
            submit(codes);
            return;
          }
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
        {walkIn ? null : (
          <Field
            label={t("calendar.newClientEmail")}
            hint={t("calendar.newClientEmailHint")}
            error={emailInvalid ? t("calendar.newClientEmailInvalid") : null}
          >
            <Input
              testID="crm-client-email"
              label={t("calendar.newClientEmail")}
              keyboardType="email-address"
              value={email}
              invalid={emailInvalid}
              onChangeText={setEmail}
            />
          </Field>
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

      {service && maxExtra > 0 ? (
        <ServiceLines
          lines={extras}
          services={active}
          staff={staff}
          max={maxExtra}
          onChange={(next) => {
            setExtras(next);
            setSlot(null);
            setSlotTouched(true);
          }}
        />
      ) : null}

      {service ? (
        <Section title={t("calendar.time")}>
          {dragUnavailable && !earliestOpen ? (
            <BookabilityWarning
              testID="crm-drag-unavailable"
              text={t("calendar.dragUnavailable")}
              action={t("calendar.findEarliest")}
              onPress={() => {
                setEarliestOpen(true);
              }}
            />
          ) : null}
          {reason === null && !earliestOpen ? (
            <View style={{ flexDirection: "row" }}>
              <CalmButton
                testID="crm-find-earliest"
                size="sm"
                variant="secondary"
                icon="clock"
                label={t("calendar.findEarliest")}
                onPress={() => {
                  setEarliestOpen(true);
                }}
              />
            </View>
          ) : null}
          {earliestOpen ? (
            <EarliestList
              loading={earliest.isPending}
              data={earliest.data}
              tz={tz}
              staff={staff}
              showStaff={!staffId}
              onPick={pickEarliest}
              onClose={() => {
                setEarliestOpen(false);
              }}
            />
          ) : null}
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
          {canOverride && !beyondWindow ? (
            <Pressable
              testID="crm-override-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: overrideOn }}
              onPress={() => {
                setOverrideOn((v) => !v);
                setSlot(null);
                setSlotTouched(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                alignSelf: "flex-start",
              }}
            >
              <Icon name={overrideOn ? "close" : "clock"} size={14} color={c.accent} />
              <Text role="uiSemiBold" size={13} color={c.accent}>
                {overrideOn ? t("calendar.overrideOff") : t("calendar.overrideOn")}
              </Text>
            </Pressable>
          ) : null}
          {manualMode ? (
            <View
              testID={beyondWindow ? "crm-beyond-window" : "crm-override-panel"}
              style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.surfaceMuted }}
            >
              <Text size={13} color={c.body}>
                {beyondWindow
                  ? t("calendar.beyondWindow", { days: windowDays })
                  : t("calendar.overrideExplain")}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <Field label={t("calendar.manualTime")}>
                  <TimeInput
                    testID="crm-manual-time"
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
                    testID="crm-override-reason"
                    label={t("calendar.overrideReason")}
                    value={overrideReason}
                    onChangeText={setOverrideReason}
                  />
                </Field>
              </View>
            </View>
          ) : null}
          {!manualMode && reason ? (
            <BookabilityWarning
              testID={`crm-unavailable-${reason}`}
              text={t(`calendar.unavailable.${reason}`)}
              {...(reasonFix
                ? {
                    action: reasonFix.label,
                    onPress: () => {
                      onClose();
                      go(reasonFix.path);
                    },
                  }
                : {})}
            />
          ) : null}
          {manualMode || reason ? null : (
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
          {extras.length > 0 && availability.data ? (
            <ChainPlan
              durationMinutes={availability.data.durationMinutes}
              price={[service, ...extras.map((l) => active.find((x) => x.id === l.serviceId))]
                .filter((x): x is Service => Boolean(x))
                .reduce((sum, x, i) => {
                  const v =
                    i === 0
                      ? x.variants.find((y) => y.id === variantId)
                      : x.variants.find((y) => y.id === extras[i - 1]?.variantId);
                  return sum + (v?.price ?? x.price);
                }, 0)}
              lines={slots.find((x) => x.startsAt === chosenSlot)?.lines ?? []}
              services={active}
              staff={staff}
              tz={tz}
            />
          ) : null}
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

/** Salon-local date (YYYY-MM-DD) as a long label; noon UTC keeps the calendar day. */
const dayLabel = (ymd: string, locale: "vi" | "en") =>
  formatDateLong(new Date(`${ymd}T12:00:00Z`), locale, "UTC");

/** Earliest free options grouped by day (07 New appointment, owner request). */
function EarliestList({
  loading,
  data,
  tz,
  staff,
  showStaff,
  onPick,
  onClose,
}: {
  loading: boolean;
  data: EarliestSlots | undefined;
  tz: string;
  staff: StaffMember[];
  showStaff: boolean;
  onPick: (e: EarliestSlots["slots"][number]) => void;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const days = [...new Set((data?.slots ?? []).map((x) => x.date))];
  return (
    <View
      testID="crm-earliest"
      style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.surfaceMuted }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text role="uiSemiBold" size={13} color={c.ink}>
          {t("calendar.earliestTitle")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
        >
          <Icon name="close" size={16} color={c.body} />
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={c.accent} />
      ) : !data || data.slots.length === 0 ? (
        <Text testID="crm-earliest-empty" size={13} color={c.body}>
          {data?.unavailableReason
            ? t(`calendar.unavailable.${data.unavailableReason}`)
            : t("calendar.noSlots")}
        </Text>
      ) : (
        days.map((d) => (
          <View key={d} style={{ gap: 6 }}>
            <Text size={12} color={c.muted} style={{ textTransform: "capitalize" }}>
              {dayLabel(d, locale)}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {data.slots
                .filter((x) => x.date === d)
                .map((x) => {
                  const nameOf = (id: string | null | undefined) =>
                    staff.find((p) => p.id === id)?.displayName;
                  // Chains (06 M6.8): everyone in order, "Linh → Mai".
                  const who =
                    x.lines.length > 1
                      ? [...new Set(x.lines.map((l) => nameOf(l.staffId)).filter(Boolean))].join(
                          t("calendar.chainSeparator"),
                        )
                      : nameOf(x.staffIds[0]);
                  return (
                    <Pressable
                      key={x.startsAt}
                      testID="crm-earliest-slot"
                      accessibilityRole="button"
                      onPress={() => {
                        onPick(x);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        height: 38,
                        borderRadius: 10,
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: c.line,
                        backgroundColor: c.surface,
                      }}
                    >
                      <Text role="uiSemiBold" size={14} color={c.ink}>
                        {(showStaff || x.lines.length > 1) && who
                          ? `${formatTime(new Date(x.startsAt), locale, tz)} · ${who}`
                          : formatTime(new Date(x.startsAt), locale, tz)}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/** Total of a multi-service appointment and, for the chosen time, who does what when. */
function ChainPlan({
  durationMinutes,
  price,
  lines,
  services,
  staff,
  tz,
}: {
  durationMinutes: number;
  /** Base prices (add-ons excluded); the booking shows the exact estimate. */
  price: number;
  lines: { serviceId: string; startsAt: string; staffId: string | null }[];
  services: Service[];
  staff: StaffMember[];
  tz: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  return (
    <View testID="crm-chain-plan" style={{ gap: 4 }}>
      <Text role="uiSemiBold" size={13} color={c.ink}>
        {t("calendar.chainTotal", { minutes: durationMinutes, price: formatVND(price, locale) })}
      </Text>
      {lines.map((l) => {
        const s = services.find((x) => x.id === l.serviceId);
        return (
          <Text key={`${l.serviceId}-${l.startsAt}`} size={12} color={c.body}>
            {t("calendar.chainPlan", {
              time: formatTime(new Date(l.startsAt), locale, tz),
              service: s ? (locale === "en" && s.name.en) || s.name.vi : "",
              staff: staff.find((p) => p.id === l.staffId)?.displayName ?? t("calendar.anyStaff"),
            })}
          </Text>
        );
      })}
    </View>
  );
}
