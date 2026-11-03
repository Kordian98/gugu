import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Avatar, CalmButton, CalmCard, Icon, Pill, Text, useCalm } from "@gugu/design-system";
import type { StaffMember } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { useAuth } from "@/services/auth/AuthProvider";

import { crmApi, useCrmMutation, useServices, useTeam } from "../data/catalog";
import { usePayrollSettings } from "../data/payroll";
import { useSalon } from "../data/SalonContext";
import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { useCrmNav } from "../shell/useCrmNav";
import { BookabilityWarning } from "../ui/BookabilityWarning";
import { EmptyState } from "../ui/EmptyState";
import { PaySheet, paySummary } from "./payroll/PaySheet";
import { InviteSheet } from "./team/InviteSheet";
import { ScheduleEditor, weekdayLabel } from "./team/ScheduleEditor";
import { StaffEditor } from "./team/StaffEditor";

type Open = { kind: "edit" | "schedule" | "invite" | "pay"; staff: StaffMember | null } | null;

/** "T2–T7 · 09:00–18:00" style summary of a weekly schedule. */
function scheduleSummary(s: StaffMember, locale: "vi" | "en", none: string): string {
  const days = s.schedule.days.filter((d) => d.intervals.length > 0);
  if (!days.length) return none;
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return none;
  const contiguous = last.weekday - first.weekday + 1 === days.length;
  const label = contiguous
    ? `${weekdayLabel(first.weekday, locale, "short")}–${weekdayLabel(last.weekday, locale, "short")}`
    : days.map((d) => weekdayLabel(d.weekday, locale, "short")).join(", ");
  const span = first.intervals[0];
  return span ? `${label} · ${span.start}–${span.end}` : label;
}

/** Team (07 M7.4, ref crm-02 "Team & Services"): members, roles, services, hours, invitations. */
export function TeamScreen() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const bp = useBreakpoint();
  const ws = useWorkspace();
  const { can } = useSalon();
  const team = useTeam(can("members.read"));
  const services = useServices();
  const [open, setOpen] = useState<Open>(null);
  const canInvite = can("members.invite");
  const canSchedule = can("schedules.write");
  // Settings → Team → Pay & commission (owner; managers only with the owner's grant).
  const canPay = can("payroll.manage");
  const canSeePay = can("payroll.read");
  const pay = usePayrollSettings(canSeePay).data?.data ?? null;
  const payOf = (id: string) => pay?.staff.find((p) => p.staffId === id) ?? null;
  const items = team.data?.items ?? [];
  const mobile = bp === "mobile";
  const { user } = useAuth();
  const addMe = useCrmMutation(crmApi.createStaff, ["team"]);
  const iHaveProfile = items.some((s) => s.member?.userId === user?.id);
  const { go } = useCrmNav();
  const bookableIds = new Set(items.filter((s) => s.isBookable).map((s) => s.id));
  const activeServices = (services.data?.items ?? []).filter((x) => x.isActive);
  const activeIds = new Set(activeServices.map((x) => x.id));
  const unassigned = team.isSuccess
    ? activeServices.filter((x) => !x.staffIds.some((id) => bookableIds.has(id))).length
    : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: mobile ? 16 : 28, gap: 20 }}>
      <PageHeader title={t("pages.team.title")} subtitle={t("team.subtitle")} workspace={ws} />
      <CalmCard style={{ gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Text
            role="uiSemiBold"
            size={12}
            color={c.ink}
            style={{ letterSpacing: 0.4, textTransform: "uppercase" }}
          >
            {t("team.listTitle", { count: items.length })}
          </Text>
          {canInvite ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <CalmButton
                size="sm"
                variant="secondary"
                icon="link"
                label={t("team.invite")}
                onPress={() => {
                  setOpen({ kind: "invite", staff: null });
                }}
              />
              <CalmButton
                testID="crm-staff-add"
                size="sm"
                icon="plus"
                label={t("team.add")}
                onPress={() => {
                  setOpen({ kind: "edit", staff: null });
                }}
              />
            </View>
          ) : null}
        </View>
        {unassigned > 0 ? (
          <BookabilityWarning
            testID="crm-team-unassigned"
            text={t("team.unassignedServices", { count: unassigned })}
            action={t("pages.services.title")}
            onPress={() => {
              go("/business/services");
            }}
          />
        ) : null}
        {canInvite && team.isSuccess && !iHaveProfile ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: 14,
              backgroundColor: c.accentSoft,
              flexWrap: "wrap",
            }}
          >
            <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
              <Text role="uiSemiBold" size={14} color={c.ink}>
                {t("team.addMeTitle")}
              </Text>
              <Text size={12} color={c.body}>
                {t("team.addMeBody")}
              </Text>
            </View>
            <CalmButton
              testID="crm-staff-add-me"
              size="sm"
              icon="plus"
              label={t("team.addMe")}
              onPress={() => {
                addMe.mutate({
                  displayName: ws.user?.name ?? t("shell.roles.owner"),
                  linkToMe: true,
                });
              }}
            />
          </View>
        ) : null}
        {team.isPending ? (
          <ActivityIndicator color={c.accent} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="team"
            title={t("pages.team.emptyTitle")}
            body={t("pages.team.emptyBody")}
          />
        ) : (
          items.map((s) => (
            <View
              key={s.id}
              testID={`crm-staff-${s.id}`}
              style={{
                flexDirection: mobile ? "column" : "row",
                alignItems: mobile ? "stretch" : "center",
                gap: 12,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.surface,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1.4 }}>
                <Avatar name={s.displayName} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text role="uiSemiBold" size={15} color={c.ink} numberOfLines={1}>
                    {s.displayName}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                    <Pill
                      size={11}
                      tone="accent"
                      label={s.member ? t(`shell.roles.${s.member.role}`) : t("team.noAccount")}
                    />
                    {s.pendingInvitation ? (
                      <Pill size={11} tone="brand" label={t("team.invited")} />
                    ) : null}
                    {!s.isBookable ? <Pill size={11} label={t("team.notBookable")} /> : null}
                    {s.isBookable && !s.serviceIds.some((id) => activeIds.has(id)) ? (
                      <View testID={`crm-staff-no-services-${s.id}`}>
                        <Pill size={11} tone="down" label={t("team.noServicesWarning")} />
                      </View>
                    ) : null}
                    {s.isBookable && !s.schedule.days.some((d) => d.intervals.length > 0) ? (
                      <Pill size={11} tone="down" label={t("team.noHoursWarning")} />
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={{ flex: 1.2, gap: 2 }}>
                <Text size={13} color={c.body}>
                  {t("team.servicesCount", { count: s.serviceIds.length })}
                </Text>
                <Text size={13} color={c.body}>
                  {scheduleSummary(s, locale, t("team.noSchedule"))}
                </Text>
              </View>
              {canSeePay && pay ? (
                <PayEntry
                  testID={`crm-staff-pay-${s.id}`}
                  text={paySummary(payOf(s.id)?.current ?? null, t, locale)}
                  missing={!payOf(s.id)?.current}
                  editable={canPay}
                  label={t("team.pay.open", { name: s.displayName })}
                  onPress={() => {
                    setOpen({ kind: "pay", staff: s });
                  }}
                />
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: mobile ? "flex-start" : "flex-end",
                }}
              >
                {canSchedule ? (
                  <CalmButton
                    size="sm"
                    variant="secondary"
                    icon="clock"
                    label={t("team.hours")}
                    onPress={() => {
                      setOpen({ kind: "schedule", staff: s });
                    }}
                  />
                ) : null}
                {canInvite ? (
                  <CalmButton
                    size="sm"
                    variant="ghost"
                    label={t("common.edit")}
                    onPress={() => {
                      setOpen({ kind: "edit", staff: s });
                    }}
                  />
                ) : null}
                {canInvite && !s.member ? (
                  <CalmButton
                    size="sm"
                    variant="ghost"
                    icon="link"
                    label={t("team.invite")}
                    onPress={() => {
                      setOpen({ kind: "invite", staff: s });
                    }}
                  />
                ) : null}
              </View>
            </View>
          ))
        )}
      </CalmCard>
      {open?.kind === "edit" ? (
        <StaffEditor
          key={open.staff?.id ?? "new"}
          open
          staff={open.staff}
          services={services.data?.items ?? []}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === "schedule" && open.staff ? (
        <ScheduleEditor
          key={open.staff.id}
          open
          staff={open.staff}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === "pay" && open.staff ? (
        <PaySheet
          key={open.staff.id}
          staffId={open.staff.id}
          name={open.staff.displayName}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {open?.kind === "invite" ? (
        <InviteSheet
          key={open.staff?.id ?? "link"}
          open
          staff={open.staff}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

/** "8.000.000đ/tháng + 10% hoa hồng ›" — the pay setup at a glance, and the way into it. */
function PayEntry({
  text,
  missing,
  editable,
  label,
  onPress,
  testID,
}: {
  text: string;
  missing: boolean;
  editable: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!editable}
      onPress={onPress}
      style={{
        flex: 1.6,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: missing ? c.attention : c.line,
        backgroundColor: missing ? c.down.bg : c.surfaceMuted,
      }}
    >
      <Icon name="wallet" size={16} color={c.ink} />
      <Text role="uiMedium" size={14} color={c.ink} style={{ flex: 1 }} numberOfLines={2}>
        {missing && editable ? t("team.pay.setNow") : text}
      </Text>
      {editable ? <Icon name="chevronRight" size={16} color={c.body} /> : null}
    </Pressable>
  );
}
