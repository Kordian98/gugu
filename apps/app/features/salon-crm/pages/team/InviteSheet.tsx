import { useState } from "react";
import { Platform, Share, View } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, Text, useCalm } from "@gugu/design-system";
import type { InvitationCreated, StaffMember } from "@gugu/contracts";

import { useLocale } from "@/services/i18n/useLocale";

import { crmApi, useCrmMutation } from "../../data/catalog";
import { useSalon } from "../../data/SalonContext";
import { useErrorText } from "../../ui/errors";
import { ErrorBanner, Field, Input, Segmented, Sheet } from "../../ui/form";

type Role = "staff" | "receptionist" | "manager";

/**
 * Invite a person to the team by link (share via Zalo/copy; no SMS, X12) or email. Links are single
 * use and valid for 72 h; only the owner can invite managers.
 */
export function InviteSheet({
  staff,
  open,
  onClose,
}: {
  staff: StaffMember | null;
  open: boolean;
  onClose: () => void;
}) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const { summary } = useSalon();
  const errorText = useErrorText();
  const [role, setRole] = useState<Role>("staff");
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const invite = useCrmMutation(crmApi.invite, ["team"]);
  const roles: Role[] =
    summary?.myRole === "owner" ? ["staff", "receptionist", "manager"] : ["staff", "receptionist"];

  const share = async (url: string) => {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && "clipboard" in navigator) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    }
    await Share.share({ message: url });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={staff ? t("team.inviteTitleFor", { name: staff.displayName }) : t("team.inviteTitle")}
      footer={
        created ? (
          <CalmButton label={t("common.done")} onPress={onClose} />
        ) : (
          <>
            <CalmButton variant="secondary" label={t("common.cancel")} onPress={onClose} />
            <CalmButton
              testID="crm-invite-create"
              icon="link"
              label={invite.isPending ? t("common.saving") : t("team.createLink")}
              onPress={() => {
                invite.mutate(
                  {
                    role,
                    locale,
                    ...(email.trim() ? { email: email.trim() } : {}),
                    ...(staff ? { staffProfileId: staff.id } : {}),
                  },
                  { onSuccess: setCreated },
                );
              }}
            />
          </>
        )
      }
    >
      <ErrorBanner text={errorText(invite.error)} />
      {created ? (
        <View style={{ gap: 12 }}>
          <Text size={14} color={c.body}>
            {created.emailSent ? t("team.linkEmailed") : t("team.linkReady")}
          </Text>
          <View
            testID="crm-invite-url"
            style={{ padding: 12, borderRadius: 12, backgroundColor: c.surfaceMuted }}
          >
            <Text size={13} color={c.ink}>
              {created.acceptUrl}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <CalmButton
              icon="link"
              label={
                copied
                  ? t("team.copied")
                  : Platform.OS === "web"
                    ? t("team.copyLink")
                    : t("team.shareLink")
              }
              onPress={() => {
                void share(created.acceptUrl);
              }}
            />
          </View>
          <Text size={12} color={c.muted}>
            {t("team.linkExpiry")}
          </Text>
        </View>
      ) : (
        <>
          <Field label={t("team.role")}>
            <Segmented<Role>
              value={role}
              onChange={setRole}
              options={roles.map((r) => ({ id: r, label: t(`shell.roles.${r}`) }))}
            />
          </Field>
          <Text size={12} color={c.muted}>
            {t(`team.roleHints.${role}`)}
          </Text>
          <Field label={t("team.inviteEmail")} hint={t("team.inviteEmailHint")}>
            <Input
              label={t("team.inviteEmail")}
              value={email}
              keyboardType="email-address"
              onChangeText={setEmail}
            />
          </Field>
        </>
      )}
    </Sheet>
  );
}
