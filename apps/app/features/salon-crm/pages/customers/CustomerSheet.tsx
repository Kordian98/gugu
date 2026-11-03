import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { ClientSuggestion, CustomerDetail } from "@gugu/contracts";
import { formatDateLong, formatTime, formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import { salonDate } from "../../data/dates";
import { useAddNote, useCustomer, useDeleteNote, useUpdateCustomer } from "../../data/customers";
import { useSalon } from "../../data/SalonContext";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Input, Sheet, Toggle } from "../../ui/form";
import { NewAppointmentSheet } from "../calendar/NewAppointmentSheet";
import { ClientPrivacySection } from "./ClientPrivacySection";
import { useCalendarData } from "../calendar/useCalendarData";

/** Marketing-consent channels stored on the profile (keys, not copy). */
const CONSENT_CHANNELS = ["zalo", "email", "sms"] as const;

/**
 * Client profile (07 §3.5): stats (estimated spend labelled), tags, marketing consent, team-only
 * notes, upcoming and past visits, and "Book again" with the client and favourite service prefilled.
 */
export function CustomerSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const errorText = useErrorText();
  const { can, summary } = useSalon();
  const detail = useCustomer(id);
  const update = useUpdateCustomer();
  const addNote = useAddNote();
  const deleteNote = useDeleteNote();
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState(false);
  const cal = useCalendarData(salonDate(new Date()));
  const d = detail.data;
  const canEdit = can("customers.read");
  const canPrivacy = can("customers.export") && can("customers.erase");
  const tz = cal.tz;

  if (booking && d) {
    const suggestion: ClientSuggestion = {
      name: d.displayName,
      phone: d.phone ?? "",
      phoneMasked: d.phone?.includes("•") ?? false,
      visits: d.visits,
      noShows: d.noShows,
      lastVisitAt: d.lastVisitAt ?? d.createdAt,
      lastServiceId: d.favouriteServiceIds[0] ?? cal.services.data?.items[0]?.id ?? d.id,
      lastVariantId: null,
      lastStaffId: d.history[0]?.staffId ?? d.upcoming[0]?.staffId ?? d.id,
    };
    return (
      <NewAppointmentSheet
        services={cal.services.data?.items ?? []}
        staff={cal.staff}
        tz={tz}
        prefill={{ date: salonDate(new Date(), tz) }}
        client={d.phone && !suggestion.phoneMasked ? suggestion : null}
        onClose={() => {
          setBooking(false);
        }}
      />
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      closeLabel={t("common.close")}
      title={d?.displayName ?? t("pages.customers.title")}
      footer={
        d && d.phone && summary?.myRole !== "staff" ? (
          <CalmButton
            testID="crm-customer-book"
            icon="calendar"
            label={t("customers.bookAgain")}
            onPress={() => {
              setBooking(true);
            }}
          />
        ) : (
          <CalmButton variant="secondary" label={t("common.close")} onPress={onClose} />
        )
      }
    >
      <ErrorBanner text={errorText(update.error ?? addNote.error ?? deleteNote.error)} />
      {!d ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <>
          <View style={{ gap: 4 }}>
            {d.phone ? (
              <Text size={14} color={c.body}>
                {d.phone}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {d.atRisk ? <Pill tone="brand" label={t("customers.atRisk")} /> : null}
              {d.noShows > 0 ? (
                <Pill tone="down" label={t("calendar.noShows", { count: d.noShows })} />
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label={t("customers.visits")} value={String(d.visits)} />
            <Stat
              label={t("customers.last")}
              value={
                d.lastVisitAt
                  ? formatDateLong(new Date(d.lastVisitAt), locale)
                  : t("customers.never")
              }
            />
            <Stat
              label={t("customers.spend")}
              value={formatVND(d.estimatedSpend, locale)}
              hint={t("revenueKind.estimated")}
            />
          </View>

          <Section title={t("customers.tags")}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {d.tags.map((x) => (
                <Pressable
                  key={x}
                  accessibilityRole="button"
                  accessibilityLabel={t("customers.removeTag", { tag: x })}
                  disabled={!canEdit}
                  onPress={() => {
                    update.mutate({ id, body: { tags: d.tags.filter((y) => y !== x) } });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: c.accentSoft,
                  }}
                >
                  <Text size={12} color={c.accent}>
                    {x}
                  </Text>
                  {canEdit ? <Icon name="close" size={12} color={c.accent} /> : null}
                </Pressable>
              ))}
            </View>
            {canEdit ? (
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Input
                    testID="crm-customer-tag"
                    label={t("customers.addTag")}
                    placeholder={t("customers.tagPlaceholder")}
                    value={tag}
                    onChangeText={setTag}
                  />
                </View>
                <CalmButton
                  size="sm"
                  variant="secondary"
                  icon="plus"
                  label={t("customers.addTag")}
                  onPress={() => {
                    if (!tag.trim()) return;
                    update.mutate(
                      { id, body: { tags: [...d.tags, tag.trim()] } },
                      {
                        onSuccess: () => {
                          setTag("");
                        },
                      },
                    );
                  }}
                />
              </View>
            ) : null}
          </Section>

          {canEdit ? (
            <Section title={t("customers.consent")}>
              {CONSENT_CHANNELS.map((ch) => (
                <View
                  key={ch}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text size={14} color={c.ink}>
                    {t(`customers.channels.${ch}`)}
                  </Text>
                  <Toggle
                    value={d.consent[ch]}
                    label={t(`customers.channels.${ch}`)}
                    onChange={(v) => {
                      update.mutate({ id, body: { consent: { ...d.consent, [ch]: v } } });
                    }}
                  />
                </View>
              ))}
              <Text size={12} color={c.muted}>
                {t("customers.consentHint")}
              </Text>
            </Section>
          ) : null}

          {d.notes ? (
            <Section title={t("customers.notes")}>
              <Text size={12} color={c.muted}>
                {t("customers.notesHint")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Input
                    testID="crm-customer-note"
                    multiline
                    label={t("customers.addNote")}
                    placeholder={t("customers.notePlaceholder")}
                    value={note}
                    onChangeText={setNote}
                  />
                </View>
                <CalmButton
                  testID="crm-customer-note-save"
                  size="sm"
                  label={t("common.save")}
                  onPress={() => {
                    if (!note.trim()) return;
                    addNote.mutate(
                      { id, body: note.trim() },
                      {
                        onSuccess: () => {
                          setNote("");
                        },
                      },
                    );
                  }}
                />
              </View>
              {d.notes.map((n) => (
                <View
                  key={n.id}
                  style={{ gap: 2, padding: 10, borderRadius: 10, backgroundColor: c.surfaceMuted }}
                >
                  <Text size={14} color={c.ink}>
                    {n.body}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text size={11} color={c.muted}>
                      {`${n.authorName ?? ""} · ${formatDateLong(new Date(n.createdAt), locale)}`}
                    </Text>
                    {n.mine || summary?.myRole === "owner" || summary?.myRole === "manager" ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("common.delete")}
                        onPress={() => {
                          deleteNote.mutate({ id, noteId: n.id });
                        }}
                      >
                        <Icon name="trash" size={14} color={c.body} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </Section>
          ) : null}

          <Visits
            title={t("customers.upcoming")}
            items={d.upcoming}
            tz={tz}
            empty={t("customers.noUpcoming")}
          />
          <Visits
            title={t("customers.history")}
            items={d.history}
            tz={tz}
            empty={t("customers.noHistory")}
          />
          {canPrivacy ? <ClientPrivacySection id={id} onErased={onClose} /> : null}
        </>
      )}
    </Sheet>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { c } = useCalm();
  return (
    <View
      style={{ flex: 1, gap: 2, padding: 10, borderRadius: 12, backgroundColor: c.surfaceMuted }}
    >
      <Text size={11} color={c.muted}>
        {label}
      </Text>
      <Text
        role="uiSemiBold"
        size={14}
        color={c.ink}
        numberOfLines={2}
        style={{ textTransform: "capitalize" }}
      >
        {value}
      </Text>
      {hint ? (
        <Text size={10} color={c.accent}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useCalm();
  return (
    <View style={{ gap: 8 }}>
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

function Visits({
  title,
  items,
  tz,
  empty,
}: {
  title: string;
  items: CustomerDetail["history"];
  tz: string;
  empty: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  return (
    <Section title={title}>
      {items.length === 0 ? (
        <Text size={13} color={c.muted}>
          {empty}
        </Text>
      ) : (
        items.map((v) => (
          <View key={v.bookingId} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Text
              size={13}
              color={c.body}
              style={{ width: 150, textTransform: "capitalize" }}
              numberOfLines={1}
            >
              {`${formatDateLong(new Date(v.startsAt), locale, tz)} ${formatTime(new Date(v.startsAt), locale, tz)}`}
            </Text>
            <Text size={13} color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
              {(locale === "en" && v.service.en) || v.service.vi}
            </Text>
            <Pill size={10} label={t(`booking.status.${v.status}`, { defaultValue: v.status })} />
          </View>
        ))
      )}
    </Section>
  );
}
