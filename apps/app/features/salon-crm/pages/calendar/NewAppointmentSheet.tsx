import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  Avatar,
  CalmButton,
  checkableA11y,
  DatePicker,
  Icon,
  Pill,
  Text,
  useCalm,
} from "@gugu/design-system";
import type {
  ClientSuggestion,
  EarliestSlots,
  RuleOverride,
  Service,
  SalonBooking,
  StaffMember,
} from "@gugu/contracts";
import { formatDateLong, formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";
import type { AppointmentDraft } from "../../calendar/AppointmentDraft";

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
  MoneyInput,
  isClock,
} from "../../ui/form";
import { OverridePrompt } from "../../ui/OverridePrompt";
import { type ExtraLine, nextServicesOf, ServiceLines } from "./ServiceLines";
import { SlotGrid } from "./SlotPicker";

type Source = "phone" | "zalo_chat" | "walk_in" | "staff_created";

export type NewAppointmentPrefill = {
  date: string;
  staffId?: string | null;
  minutes?: number | null;
  /** Exact appointment length from drag-to-create, editable before saving. */
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
  onPreviewChange,
  onCreated,
}: {
  services: Service[];
  staff: StaffMember[];
  tz: string;
  prefill: NewAppointmentPrefill;
  /** "Book again" from a client profile: client, last service and staff preselected. */
  client?: ClientSuggestion | null | undefined;
  onClose: () => void;
  onPreviewChange?: ((draft: AppointmentDraft | null) => void) | undefined;
  onCreated?: ((booking: SalonBooking) => void) | undefined;
}) {
  const { c } = useCalm();
  const { go } = useCrmNav();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const { can } = useSalon();
  const active = useMemo(() => services.filter((s) => s.isActive), [services]);
  const [serviceMode, setServiceMode] = useState<"catalog" | "custom">(
    active.length ? "catalog" : "custom",
  );
  const custom = serviceMode === "custom";
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [durationOverride, setDurationOverride] = useState<string | null>(
    prefill.durationMinutes == null ? null : String(prefill.durationMinutes),
  );
  const [overridePending, setOverridePending] = useState<RuleOverride[] | null>(null);
  const [q, setQ] = useState("");
  const [client, setClient] = useState<ClientSuggestion | null>(initialClient);
  const again = initialClient
    ? active.find((s) => s.id === initialClient.lastServiceId)
    : undefined;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
  const service = custom ? null : (active.find((s) => s.id === serviceId) ?? null);
  const catalogDuration = service
    ? (service.variants.find((v) => v.id === variantId)?.durationMinutes ??
        service.durationMinutes) +
      service.addOns
        .filter((a) => addOnIds.includes(a.id))
        .reduce((sum, a) => sum + a.extraDurationMinutes, 0)
    : 30;
  const durationMinutes = durationOverride === null ? catalogDuration : Number(durationOverride);
  const validDuration =
    Number.isInteger(durationMinutes) && durationMinutes >= 5 && durationMinutes <= 1440;
  const customService =
    custom &&
    customName.trim() &&
    customName.trim().length <= 160 &&
    customPrice !== null &&
    customPrice <= 1_000_000_000
      ? { name: customName.trim(), priceMinor: customPrice }
      : undefined;
  const selectionReady =
    validDuration &&
    (custom ? Boolean(customService) : Boolean(service && (!service.variants.length || variantId)));
  const selection = {
    ...(service ? { serviceId: service.id } : {}),
    ...(customService ? { customService } : {}),
    ...(extras.length || (!custom && durationOverride === null) ? {} : { durationMinutes }),
    variantId: custom ? null : variantId,
    addOnIds: custom ? [] : addOnIds,
    staffId,
    nextServices: custom ? [] : (nextServices ?? []),
  };
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
  const availability = useAvailability(
    selectionReady && nextServices && month.last >= today && month.first <= maxDate
      ? {
          ...selection,
          date: month.first < today ? today : month.first,
          to: month.last > maxDate ? maxDate : month.last,
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
  const [manualTime, setManualTime] = useState(
    prefill.minutes == null
      ? ""
      : `${String(Math.floor(prefill.minutes / 60)).padStart(2, "0")}:${String(prefill.minutes % 60).padStart(2, "0")}`,
  );
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

  // Engine slots supplement the editable time. Confirm always revalidates it on the server.
  const [slotTouched, setSlotTouched] = useState(false);
  const autoSlot =
    prefill.minutes != null && !slotTouched
      ? (slots.find(
          (s) =>
            minutesInZone(new Date(s.startsAt), tz) === prefill.minutes &&
            salonDate(new Date(s.startsAt), tz) === date,
        )?.startsAt ?? null)
      : null;
  const manualSlot = isClock(manualTime) ? instantAt(date, clockMinutes(manualTime), tz) : null;
  const chosenSlot = manualSlot ?? slot ?? autoSlot;
  // The selected time can still be confirmed; alternatives are offered without discarding it.
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
    selectionReady && nextServices ? selection : null,
    earliestOpen,
  );
  const pickEarliest = (e: { date: string; startsAt: string; staffIds: string[] }) => {
    setDate(e.date);
    setMonth(monthOf(e.date));
    if (!staffId && e.staffIds[0]) setStaffId(e.staffIds[0]);
    setSlot(e.startsAt);
    setManualTime("");
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
  const contact = client
    ? { name: client.name, phone: client.phone }
    : {
        name: name.trim() || (digits.length < 3 ? q.trim() : ""),
        phone: phone.trim() || (digits.length >= 8 ? q.trim() : ""),
      };
  const ready = Boolean(
    selectionReady &&
    chosenSlot &&
    nextServices &&
    (walkIn || (contact.name && contact.phone.replace(/\D/g, "").length >= 8)),
  );

  // Keep the drawn block while the form is open. This is a visual draft, never an availability
  // decision: the engine's selected plan replaces the tentative range once it is available.
  const previewStart =
    chosenSlot ??
    (!slotTouched && prefill.minutes != null ? instantAt(date, prefill.minutes, tz) : null);
  const previewStaff = staffId ?? slots.find((s) => s.startsAt === chosenSlot)?.staffIds[0] ?? null;
  const previewName = custom
    ? customName.trim() || t("calendar.newTitle")
    : service
      ? (locale === "en" && service.name.en) || service.name.vi
      : t("calendar.newTitle");
  const previewPlan = slots.find((s) => s.startsAt === chosenSlot)?.lines;
  const previewBlocks = JSON.stringify(
    previewStart && validDuration && previewStaff
      ? previewPlan?.length
        ? previewPlan.flatMap((line) => {
            if (!line.staffId) return [];
            const catalog = active.find((s) => s.id === line.serviceId);
            return [
              {
                staffId: line.staffId,
                startsAt: line.startsAt,
                endsAt: line.endsAt,
                service: catalog
                  ? (locale === "en" && catalog.name.en) || catalog.name.vi
                  : previewName,
              },
            ];
          })
        : [
            {
              staffId: previewStaff,
              startsAt: previewStart,
              endsAt: new Date(Date.parse(previewStart) + durationMinutes * 60_000).toISOString(),
              service: previewName,
            },
          ]
      : [],
  );
  const lastPreview = useRef<AppointmentDraft | null>(null);
  const created = useRef(false);
  useEffect(() => {
    if (created.current) {
      onPreviewChange?.(null);
      return;
    }
    const blocks = JSON.parse(previewBlocks) as AppointmentDraft["blocks"];
    if (blocks.length) lastPreview.current = { date, saving: create.isPending, blocks };
    const draft = lastPreview.current?.date === date ? lastPreview.current : null;
    onPreviewChange?.(draft ? { ...draft, saving: create.isPending } : null);
  }, [date, previewBlocks, create.isPending, onPreviewChange]);
  useEffect(
    () => () => {
      onPreviewChange?.(null);
    },
    [onPreviewChange],
  );

  const submit = (overrides: RuleOverride[] = [], reason = "") => {
    if (!selectionReady || !chosenSlot || create.isPending) return;
    create.mutate(
      {
        ...selection,
        startsAt: chosenSlot,
        source: walkIn ? "walk_in" : source,
        customer: walkIn ? null : contact,
        note: note.trim() || null,
        // Only the rules this time actually breaks are overridden (and audited, 06).
        overrides,
        ...(overrides.length ? { overrideReason: reason.trim() } : {}),
      },
      {
        onSuccess: (booking) => {
          created.current = true;
          onPreviewChange?.(null);
          if (onCreated) onCreated(booking);
          else onClose();
        },
        onError: (e) => {
          const codes = requiredOverrides(e);
          if (codes?.length && overrides.length === 0 && canOverride) {
            const minutes = minutesInZone(new Date(chosenSlot), tz);
            setManualTime(
              `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
            );
            setOverridePending(codes);
            return;
          }
          void availability.refetch();
        },
      },
    );
  };

  const serviceName = (s: Service) => (locale === "en" && s.name.en) || s.name.vi;

  return (
    <>
      {overridePending !== null ? (
        <OverridePrompt
          codes={overridePending}
          busy={create.isPending}
          error={requiredOverrides(create.error) ? null : errorText(create.error)}
          disabled={
            !selectionReady ||
            !chosenSlot ||
            !(walkIn || (contact.name && contact.phone.replace(/\D/g, "").length >= 8))
          }
          extra={
            <>
              <Text testID="crm-override-context" size={14} color={c.ink}>
                {`${staff.find((s) => s.id === staffId)?.displayName ?? t("calendar.anyStaff")} · ${dayLabel(date, locale)} · ${chosenSlot ? formatTime(new Date(chosenSlot), locale, tz) : ""}`}
              </Text>
            </>
          }
          onCancel={() => {
            setOverridePending(null);
            create.reset();
          }}
          onConfirm={(reason) => {
            submit(overridePending, reason);
          }}
        />
      ) : null}
      <Sheet
        open={overridePending === null}
        onClose={onClose}
        dismissDisabled={create.isPending}
        closeLabel={t("common.close")}
        title={t("calendar.newTitle")}
        footer={
          <>
            <CalmButton
              variant="secondary"
              label={t("common.cancel")}
              onPress={onClose}
              disabled={create.isPending}
            />
            <CalmButton
              testID="crm-new-confirm"
              disabled={!ready || create.isPending}
              label={create.isPending ? t("common.saving") : t("calendar.confirmBooking")}
              onPress={() => {
                if (ready && !create.isPending) {
                  submit();
                }
              }}
            />
          </>
        }
      >
        <ErrorBanner text={overridePending ? null : errorText(create.error)} />

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
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 6,
                  }}
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
          <Segmented<"catalog" | "custom">
            value={serviceMode}
            options={[
              { id: "catalog", label: t("calendar.catalogService") },
              { id: "custom", label: t("calendar.customService") },
            ]}
            onChange={(mode) => {
              setServiceMode(mode);
              setExtras([]);
              setSlot(null);
              setSlotTouched(false);
            }}
          />
          {custom ? (
            <>
              <Field label={t("calendar.customServiceName")} hint={t("calendar.customServiceHint")}>
                <Input
                  testID="crm-custom-service-name"
                  label={t("calendar.customServiceName")}
                  value={customName}
                  onChangeText={setCustomName}
                  maxLength={160}
                />
              </Field>
              <Field label={t("calendar.customServicePrice")}>
                <MoneyInput
                  testID="crm-custom-service-price"
                  label={t("calendar.customServicePrice")}
                  value={customPrice}
                  onChange={setCustomPrice}
                />
              </Field>
            </>
          ) : (
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
                setSlotTouched(false);
              }}
            />
          )}
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
                setSlotTouched(false);
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
                      {...checkableA11y("checkbox", on)}
                      onPress={() => {
                        setAddOnIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]));
                        setSlot(null);
                        setSlotTouched(false);
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
          {extras.length === 0 ? (
            <Field
              label={t("calendar.durationLabel")}
              hint={
                prefill.durationMinutes
                  ? t("calendar.selectedDuration", { minutes: prefill.durationMinutes })
                  : undefined
              }
              error={validDuration ? null : t("calendar.durationInvalid")}
            >
              <Input
                testID="crm-booking-duration"
                label={t("calendar.durationLabel")}
                keyboardType="number-pad"
                value={durationOverride ?? String(catalogDuration)}
                onChangeText={(value) => {
                  setDurationOverride(value.replace(/\D/g, "").slice(0, 4));
                  setSlot(null);
                  setSlotTouched(false);
                }}
              />
            </Field>
          ) : null}
        </Section>

        {service || custom ? (
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
                setSlotTouched(false);
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
              if (next.length) setDurationOverride(null);
              setSlot(null);
              setSlotTouched(true);
            }}
          />
        ) : null}

        {service || custom ? (
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
            <Field label={t("calendar.manualTime")}>
              <TimeInput
                testID="crm-manual-time"
                label={t("calendar.manualTime")}
                value={
                  chosenSlot
                    ? `${String(Math.floor(minutesInZone(new Date(chosenSlot), tz) / 60)).padStart(2, "0")}:${String(minutesInZone(new Date(chosenSlot), tz) % 60).padStart(2, "0")}`
                    : manualTime
                }
                onChange={(value) => {
                  setManualTime(value);
                  setSlot(null);
                  setSlotTouched(true);
                  create.reset();
                }}
              />
            </Field>
            {reason ? (
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
            {reason ? null : (
              <SlotGrid
                tz={tz}
                loading={availability.isPending && availability.fetchStatus !== "idle"}
                slots={slots}
                selected={chosenSlot}
                onSelect={(s) => {
                  setSlot(s);
                  setManualTime("");
                  setSlotTouched(true);
                  create.reset();
                }}
              />
            )}
            {!reason && availability.data?.truncated ? (
              <TruncatedHint testID="crm-availability-truncated" />
            ) : null}
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
    </>
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
            {...checkableA11y("radio", on)}
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
      {!loading && data?.truncated ? <TruncatedHint testID="crm-earliest-truncated" /> : null}
    </View>
  );
}

/** The engine's search budget ran out (ADR-0013): what is shown is real, but more may exist. */
function TruncatedHint({ testID }: { testID: string }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
      <Icon name="alert" size={14} color={c.muted} />
      <Text size={12} color={c.muted} style={{ flex: 1 }}>
        {t("calendar.truncated")}
      </Text>
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
  lines: { serviceId: string | null; startsAt: string; staffId: string | null }[];
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
          <Text key={`${l.serviceId ?? "custom"}-${l.startsAt}`} size={12} color={c.body}>
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
