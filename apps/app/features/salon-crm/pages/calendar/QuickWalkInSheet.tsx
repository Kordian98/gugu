import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { SalonBooking } from "@gugu/contracts";
import {
  CalmButton,
  checkableA11y,
  Icon,
  MIN_TOUCH,
  radius,
  space,
  Text,
  typeScale,
  useCalm,
} from "@gugu/design-system";
import { formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";
import { useAvailability, useCreateBooking } from "../../data/bookings";
import { useServices, useTeam } from "../../data/catalog";
import { salonDate } from "../../data/dates";
import { useSalon } from "../../data/SalonContext";
import { useCrmNav } from "../../shell/useCrmNav";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Sheet } from "../../ui/form";
import { QueryError } from "../../ui/QueryError";
import { SlotGrid } from "./SlotPicker";
import { walkInNeedsRefresh, walkInOptions, walkInSlots } from "./quick-walk-in";

/** Today → service → confirm. No contact fields, keyboard or hidden booking-rule overrides. */
export function QuickWalkInSheet({
  onClose,
  onCreated,
  tz,
}: {
  onClose: () => void;
  onCreated: (booking: SalonBooking) => void;
  tz: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const salon = useSalon();
  const { go } = useCrmNav();
  const errorText = useErrorText();
  const services = useServices();
  const canReadTeam = salon.can("members.read");
  const team = useTeam(canReadTeam);
  const create = useCreateBooking();
  const submitting = useRef(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const today = salonDate(new Date(), tz);
  const options = useMemo(() => walkInOptions(services.data?.items ?? []), [services.data]);
  const selected =
    options.find((option) => option.key === selectedKey) ??
    (options.length === 1 ? options[0] : undefined);
  const availability = useAvailability(
    selected
      ? {
          serviceId: selected.service.id,
          variantId: selected.variant?.id ?? null,
          addOnIds: [],
          staffId,
          date: today,
        }
      : null,
  );
  const slots = walkInSlots(availability.data, today);
  const { refetch } = availability;
  const hasSelection = !!selected;
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && hasSelection && !submitting.current) {
        setRefreshed(true);
        void refetch();
      }
    });
    return () => {
      listener.remove();
    };
  }, [hasSelection, refetch]);
  const slot = slots.find((item) => item.startsAt === startsAt) ?? slots[0];
  const assignedId = slot?.staffIds[0] ?? null;
  const assigned = team.data?.items.find((member) => member.id === assignedId);
  const ready =
    !!selected &&
    !!slot &&
    !availability.isFetching &&
    !availability.isError &&
    !services.isError &&
    !create.isPending &&
    salon.can("bookings.write");
  const resetChoice = () => {
    setStartsAt(null);
    setError(null);
    setRefreshed(false);
  };
  const openCalendar = () => {
    onClose();
    go("/business/calendar");
  };
  const confirm = () => {
    if (!ready || submitting.current) return;
    // eslint-disable-next-line react-hooks/purity -- This callback runs only on the confirm press, never during render.
    if (walkInNeedsRefresh(availability.dataUpdatedAt, slot.startsAt, Date.now())) {
      setRefreshed(true);
      void availability.refetch();
      return;
    }
    submitting.current = true;
    setError(null);
    create.mutate(
      {
        serviceId: selected.service.id,
        variantId: selected.variant?.id ?? null,
        addOnIds: [],
        staffId: assignedId,
        startsAt: slot.startsAt,
        nextServices: [],
        source: "walk_in",
        customer: null,
        note: null,
        overrides: [],
      },
      {
        onSuccess: onCreated,
        onError: (failure) => {
          setError(errorText(failure));
          setStartsAt(null);
          setRefreshed(true);
          void availability.refetch();
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };
  const price = selected
    ? selected.priceMax === null
      ? formatVND(selected.price, locale)
      : t("quickWalkIn.priceRange", {
          min: formatVND(selected.price, locale),
          max: formatVND(selected.priceMax, locale),
        })
    : "";
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("quickWalkIn.title")}
      closeLabel={t("common.close")}
      dismissDisabled={create.isPending}
      footer={
        <View style={{ flex: 1, gap: space[3] }}>
          {selected && slot && !availability.isError ? (
            <View testID="crm-walk-in-summary" style={{ gap: space[1] }}>
              <Text role="uiSemiBold" size={typeScale.lead} color={c.ink}>
                {t("quickWalkIn.todayAt", {
                  time: formatTime(new Date(slot.startsAt), locale, tz),
                })}
              </Text>
              <Text size={typeScale.body} color={c.body}>
                {t("quickWalkIn.assigned", {
                  name: assigned?.displayName ?? t("calendar.anyStaff"),
                })}
              </Text>
              <Text size={typeScale.body} color={c.body}>
                {t("quickWalkIn.price", { price })}
              </Text>
            </View>
          ) : null}
          <CalmButton
            testID="crm-walk-in-confirm"
            label={t("calendar.confirmBooking")}
            disabled={!ready}
            onPress={confirm}
            trailing={create.isPending ? <ActivityIndicator color={c.onAccent} /> : undefined}
          />
        </View>
      }
    >
      <View testID="crm-quick-walk-in" style={{ gap: space[4] }}>
        <Text size={typeScale.body} color={c.body}>
          {t("quickWalkIn.intro")}
        </Text>
        {services.isError ? (
          <QueryError
            onRetry={() => {
              void services.refetch();
            }}
            busy={services.isFetching}
          />
        ) : services.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : !options.length ? (
          <Text size={typeScale.body} color={c.muted}>
            {t("quickWalkIn.noServices")}
          </Text>
        ) : (
          options.map((option) => {
            const checked = option.key === selected?.key;
            const name = option.service.name[locale] || option.service.name.vi;
            const variant = option.variant
              ? option.variant.name[locale] || option.variant.name.vi
              : null;
            return (
              <Pressable
                key={option.key}
                testID={`crm-walk-in-service-${option.key}`}
                {...checkableA11y("radio", checked, { disabled: create.isPending })}
                disabled={create.isPending}
                onPress={() => {
                  setSelectedKey(option.key);
                  setStaffId(null);
                  resetChoice();
                }}
                style={{
                  minHeight: MIN_TOUCH,
                  padding: space[4],
                  borderRadius: radius.sm,
                  backgroundColor: checked ? c.accentSoft : c.surface,
                  borderColor: checked ? c.accent : c.line,
                  borderWidth: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space[3],
                }}
              >
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="uiSemiBold" size={typeScale.body} color={c.ink}>
                    {name}
                  </Text>
                  {variant ? (
                    <Text size={typeScale.body} color={c.body}>
                      {variant}
                    </Text>
                  ) : null}
                  <Text size={typeScale.body} color={c.muted}>
                    {t("quickWalkIn.duration", { minutes: option.durationMinutes })}
                  </Text>
                </View>
                {checked ? <Icon name="check" size={typeScale.title} color={c.accent} /> : null}
              </Pressable>
            );
          })
        )}
        <ErrorBanner text={error} />
        {refreshed ? (
          <Text size={typeScale.body} color={c.body}>
            {t("quickWalkIn.refreshed")}
          </Text>
        ) : null}
        {!selected && options.length > 0 ? (
          <Text size={typeScale.body} color={c.muted}>
            {t("quickWalkIn.selectHint")}
          </Text>
        ) : !selected ? null : availability.isError ? (
          <QueryError
            testID="crm-walk-in-availability-error"
            onRetry={() => {
              void availability.refetch();
            }}
            busy={availability.isFetching}
          />
        ) : availability.isPending || availability.isFetching ? (
          <ActivityIndicator color={c.accent} />
        ) : !slot ? (
          <View testID="crm-walk-in-unavailable" style={{ gap: space[3] }}>
            <Text size={typeScale.body} color={c.body}>
              {t("quickWalkIn.noSlotsToday")}
            </Text>
            {availability.data.unavailableReason &&
            availability.data.unavailableReason !== "fully_booked" ? (
              <Text size={typeScale.body} color={c.muted}>
                {t(`calendar.unavailable.${availability.data.unavailableReason}`)}
              </Text>
            ) : null}
            <CalmButton
              variant="secondary"
              label={t("quickWalkIn.openCalendar")}
              onPress={openCalendar}
            />
          </View>
        ) : null}
        {selected ? (
          <CalmButton
            testID="crm-walk-in-options"
            variant="secondary"
            label={t("quickWalkIn.options")}
            disabled={create.isPending}
            onPress={() => {
              setExpanded(!expanded);
            }}
          />
        ) : null}
        {expanded && selected ? (
          <View style={{ gap: space[3] }}>
            {canReadTeam && team.isError ? (
              <QueryError
                onRetry={() => {
                  void team.refetch();
                }}
                busy={team.isFetching}
              />
            ) : null}
            {canReadTeam && team.data ? (
              <View style={{ gap: space[3] }}>
                <CalmButton
                  variant={staffId === null ? "primary" : "secondary"}
                  label={t("calendar.anyStaff")}
                  disabled={create.isPending}
                  onPress={() => {
                    setStaffId(null);
                    resetChoice();
                  }}
                />
                {team.data.items
                  .filter(
                    (member) => member.isBookable && selected.service.staffIds.includes(member.id),
                  )
                  .map((member) => (
                    <CalmButton
                      key={member.id}
                      label={member.displayName}
                      variant={staffId === member.id ? "primary" : "secondary"}
                      disabled={create.isPending}
                      onPress={() => {
                        setStaffId(member.id);
                        resetChoice();
                      }}
                    />
                  ))}
              </View>
            ) : null}
            <SlotGrid
              slots={create.isPending || availability.isError ? [] : slots}
              loading={availability.isFetching}
              selected={slot?.startsAt ?? null}
              tz={tz}
              onSelect={(time) => {
                setStartsAt(time);
                setError(null);
              }}
            />
            <CalmButton
              variant="ghost"
              label={t("quickWalkIn.openCalendar")}
              disabled={create.isPending}
              onPress={openCalendar}
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
