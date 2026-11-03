import { useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import type { SalonSettings, SetupMethod, StaffMember, WeeklyScheduleInput } from "@gugu/contracts";
import { Avatar, CalmButton, Icon, Text, useCalm } from "@gugu/design-system";

import { useAuth } from "@/services/auth/AuthProvider";

import { crmApi, useCrmMutation } from "../../../data/catalog";
import { useErrorText } from "../../../ui/errors";
import { ErrorBanner, Field, Input, Toggle } from "../../../ui/form";
import { selectHaptic } from "../parts/haptics";
import { ChoiceTile, StepFooter, StepFrame } from "../parts/StepFrame";

/** A new person's weekly hours: the salon's opening hours, else Mon–Sat 9:00–18:00. */
export function defaultSchedule(settings: SalonSettings): WeeklyScheduleInput {
  const days = settings.openingHours.days.length
    ? settings.openingHours.days.map((d) => ({
        weekday: d.weekday,
        intervals: d.intervals.slice(0, 1),
        breaks: [],
      }))
    : [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        intervals: [{ start: "09:00", end: "18:00" }],
        breaks: [],
      }));
  return { days };
}

/**
 * Step (d): "just me" or add people by name. Everyone gets the salon's hours and every service, so
 * the calendar can take bookings at once; invites are optional and come later under Team.
 */
export function TeamStep({
  team,
  settings,
  eta,
  onDone,
  onSkip,
  onBack,
}: {
  team: StaffMember[];
  settings: SalonSettings;
  eta: string;
  onDone: (method: SetupMethod) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const errorText = useErrorText();
  const { user } = useAuth();
  const me = team.find((s) => s.member?.userId === user?.id) ?? null;
  const others = team.filter((s) => s.id !== me?.id);
  const [mode, setMode] = useState<"me" | "team" | null>(
    others.length > 0 ? "team" : me ? "me" : null,
  );
  const [myName, setMyName] = useState(
    me?.displayName ?? user?.displayName ?? user?.email?.split("@")[0] ?? "",
  );
  const [includeMe, setIncludeMe] = useState(true);
  const [name, setName] = useState("");
  const create = useCrmMutation(crmApi.createStaff, ["team", "services"]);
  const schedule = useCrmMutation(crmApi.replaceSchedule, ["team"]);
  const busy = create.isPending || schedule.isPending;

  const addPerson = async (displayName: string, linkToMe: boolean) => {
    const { id } = await create.mutateAsync({ displayName, linkToMe });
    await schedule.mutateAsync({ id, body: defaultSchedule(settings) });
  };

  const finish = async () => {
    try {
      if (mode === "me") {
        if (!me) await addPerson(myName.trim(), true);
        onDone("just_me");
      } else if (mode === "team") {
        if (includeMe && !me && myName.trim()) await addPerson(myName.trim(), true);
        onDone("team");
      }
    } catch {
      // The error banner shows the mutation error; stay on the step.
    }
  };

  const ready =
    mode === "me"
      ? myName.trim().length > 0 || me !== null
      : mode === "team"
        ? others.length > 0 || (includeMe && (myName.trim().length > 0 || me !== null))
        : false;

  return (
    <StepFrame
      title={t("setupWizard.team.title")}
      body={t("setupWizard.team.body")}
      eta={eta}
      footer={
        <StepFooter
          label={t("setupWizard.next")}
          disabled={!ready}
          busy={busy}
          hint={mode === "team" && !ready ? t("setupWizard.team.needOne") : null}
          onPress={() => void finish()}
          onSkip={onSkip}
          onBack={onBack}
        />
      }
    >
      <ErrorBanner text={errorText(create.error ?? schedule.error)} />
      <View
        role="radiogroup"
        accessibilityRole="radiogroup"
        aria-label={t("setupWizard.team.title")}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
      >
        <ChoiceTile
          testID="crm-setup-just-me"
          label={t("setupWizard.team.justMe")}
          body={t("setupWizard.team.justMeBody")}
          selected={mode === "me"}
          art={<Icon name="heart" size={26} color={c.accent} />}
          onPress={() => {
            selectHaptic();
            setMode("me");
          }}
        />
        <ChoiceTile
          testID="crm-setup-with-team"
          label={t("setupWizard.team.withTeam")}
          body={t("setupWizard.team.withTeamBody")}
          selected={mode === "team"}
          art={<Icon name="team" size={26} color={c.accent} />}
          onPress={() => {
            selectHaptic();
            setMode("team");
          }}
        />
      </View>

      {mode !== null && !me && (mode === "me" || includeMe) ? (
        <Field label={t("setupWizard.team.myName")}>
          <Input
            testID="crm-setup-my-name"
            label={t("setupWizard.team.myName")}
            value={myName}
            onChangeText={setMyName}
          />
        </Field>
      ) : null}

      {mode === "team" ? (
        <View style={{ gap: 12 }}>
          {!me ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text size={15} color={c.ink} style={{ flex: 1 }}>
                {t("setupWizard.team.includeMe")}
              </Text>
              <Toggle
                testID="crm-setup-include-me"
                label={t("setupWizard.team.includeMe")}
                value={includeMe}
                onChange={setIncludeMe}
              />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field flex={1} label={t("setupWizard.team.staffName")}>
              <Input
                testID="crm-setup-staff-name"
                label={t("setupWizard.team.staffName")}
                placeholder={t("setupWizard.team.staffPlaceholder")}
                value={name}
                onChangeText={setName}
              />
            </Field>
            <CalmButton
              testID="crm-setup-staff-add"
              icon="plus"
              label={t("setupWizard.team.add")}
              onPress={() => {
                const n = name.trim();
                if (!n || busy) return;
                addPerson(n, false)
                  .then(() => {
                    // Clear only what was submitted: typing the next name meanwhile must survive.
                    setName((cur) => (cur.trim() === n ? "" : cur));
                  })
                  .catch(() => undefined);
              }}
            />
          </View>
          <Text size={12} color={c.muted}>
            {t("setupWizard.team.hint")}
          </Text>
        </View>
      ) : null}

      {team.length > 0 ? (
        <View testID="crm-setup-team-list" style={{ gap: 8 }}>
          {team.map((s) => (
            <Animated.View
              key={s.id}
              entering={FadeInDown.duration(300)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 }}
            >
              <Avatar name={s.displayName} size={32} />
              <Text size={15} color={c.ink} style={{ flex: 1 }}>
                {s.displayName}
              </Text>
              <Icon name="check" size={16} color={c.accent} />
            </Animated.View>
          ))}
        </View>
      ) : null}
    </StepFrame>
  );
}
