import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { ADMIN_ERRORS, type AdminTeamMember } from "@gugu/contracts";
import { CalmButton, Pill, Text, useCalm } from "@gugu/design-system";

import { ApiError } from "@/services/auth/api";

import { ErrorBanner, Field, Input, Sheet } from "../salon-crm/ui/form";
import { useAdminTeam, useResetAdminMfa } from "./data";
import { StepUpPrompt } from "./StepUpPrompt";
import { LoadError, Loading, Section, useAdminErrorText } from "./ui";

const MIN_REASON = 5;
const MAX_REASON = 500;

/**
 * Admin team on the security screen (owner answer q93): a super admin resets ANOTHER admin's
 * two-step verification after they lost both device and recovery codes. UX only: the API needs
 * `platform.mfa.reset` (super_admin), this session's step-up and a reason, audits the reset and
 * refuses one's own account. Rendered only for super admins.
 */
export function AdminTeamSection() {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const team = useAdminTeam(true);
  const [target, setTarget] = useState<AdminTeamMember | null>(null);
  const [doneFor, setDoneFor] = useState<string | null>(null);

  return (
    <Section testID="admin-team" title={t("security.team.title")} body={t("security.team.body")}>
      {team.isPending ? (
        <Loading />
      ) : !team.data ? (
        <LoadError
          onRetry={() => {
            void team.refetch();
          }}
        />
      ) : team.data.items.length <= 1 ? (
        <Text size={14} color={c.body}>
          {t("security.team.empty")}
        </Text>
      ) : (
        team.data.items.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            done={doneFor === m.userId}
            onReset={() => {
              setDoneFor(null);
              setTarget(m);
            }}
          />
        ))
      )}
      {target ? (
        <ResetSheet
          member={target}
          onClose={() => {
            setTarget(null);
          }}
          onDone={() => {
            setDoneFor(target.userId);
            setTarget(null);
          }}
        />
      ) : null}
    </Section>
  );
}

function MemberRow({
  member,
  done,
  onReset,
}: {
  member: AdminTeamMember;
  done: boolean;
  onReset: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  return (
    <View
      testID={`admin-team-${member.userId}`}
      style={{
        gap: 8,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Text role="uiSemiBold" size={14} color={c.ink}>
          {member.email ?? t("security.team.noEmail")}
        </Text>
        {member.isSelf ? <Pill tone="accent" label={t("security.team.you")} /> : null}
        <Pill
          tone="neutral"
          label={
            member.platformRole === "super_admin"
              ? t("security.team.roleSuper")
              : t("security.team.roleSupport")
          }
        />
        <Pill
          tone={member.mfaEnrolled ? "up" : "down"}
          label={member.mfaEnrolled ? t("security.team.on") : t("security.team.off")}
        />
      </View>
      <Text size={12} color={c.muted}>
        {t("security.team.details", {
          codes: member.recoveryCodesRemaining,
          sessions: member.activeSessions,
        })}
      </Text>
      {done ? (
        <Text testID="admin-team-reset-done" size={13} color={c.up.text}>
          {t("security.team.done")}
        </Text>
      ) : null}
      {member.isSelf ? (
        <Text size={12} color={c.muted}>
          {t("security.team.selfHint")}
        </Text>
      ) : (
        <View style={{ flexDirection: "row" }}>
          <CalmButton
            testID={`admin-team-reset-${member.userId}`}
            size="sm"
            variant="secondary"
            label={t("security.team.reset")}
            onPress={onReset}
          />
        </View>
      )}
    </View>
  );
}

function ResetSheet({
  member,
  onClose,
  onDone,
}: {
  member: AdminTeamMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("admin");
  const errorText = useAdminErrorText();
  const reset = useResetAdminMfa();
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;
  const stepUp =
    reset.error instanceof ApiError && reset.error.code === ADMIN_ERRORS.stepUpRequired;
  const submit = () => {
    if (!valid || reset.isPending) return;
    reset.mutate({ userId: member.userId, body: { reason: trimmed } }, { onSuccess: onDone });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("security.team.resetTitle", { email: member.email ?? t("security.team.noEmail") })}
      closeLabel={t("common.cancel")}
      footer={
        <>
          <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
          <CalmButton
            testID="admin-team-reset-submit"
            label={reset.isPending ? t("security.team.resetting") : t("security.team.resetAction")}
            variant={valid && !reset.isPending ? "primary" : "secondary"}
            onPress={submit}
          />
        </>
      }
    >
      <Text size={14} color={c.body}>
        {t("security.team.resetBody")}
      </Text>
      <Pill label={t("actions.highRisk")} tone="down" />
      <Field label={t("actions.reason")} hint={t("actions.reasonHint")}>
        <Input
          testID="admin-team-reset-reason"
          label={t("actions.reason")}
          value={reason}
          onChangeText={setReason}
          multiline
        />
      </Field>
      {stepUp ? (
        <StepUpPrompt testID="admin-team-reset-stepup" onDone={submit} />
      ) : (
        <ErrorBanner text={errorText(reset.error)} />
      )}
    </Sheet>
  );
}
