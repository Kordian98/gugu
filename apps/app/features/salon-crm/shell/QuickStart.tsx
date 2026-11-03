import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import type { MyInvitation } from "@gugu/contracts";
import { CalmButton, CalmCard, Icon, Text, useCalm } from "@gugu/design-system";

import { ApiError } from "@/services/auth/api";
import { useAuth } from "@/services/auth/AuthProvider";
import { useLocale } from "@/services/i18n/useLocale";

import { acceptMyInvitation, myInvitations, quickStartSalon } from "../data/setup";
import { EmptyState } from "../ui/EmptyState";

type View_ =
  | { kind: "working" }
  | { kind: "failed"; code: string | null }
  | { kind: "admin" }
  | { kind: "invited"; items: MyInvitation[] }
  | { kind: "former" };

/**
 * First visit of a signed-in user without any salon (email-only signup, owner 2026-11-04):
 * - platform admins are sent to the admin panel (they own no salon);
 * - an email with team invitations is offered "Join <salon>" (q102: invited staff never get an
 *   empty salon); only the explicit "I own a salon, create a new one" creates one;
 * - someone who used to be in a salon (accepted an invitation before) also chooses explicitly;
 * - everyone else gets their salon created at once (idempotent server call), then the setup.
 */
export function QuickStart() {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const auth = useAuth();
  const locale = useLocale();
  const router = useRouter();
  // Platform admins own no salon: straight to the admin notice, no server call.
  const [view, setView] = useState<View_>(
    auth.user?.platformRole ? { kind: "admin" } : { kind: "working" },
  );
  const started = useRef(false);

  const create = (ignoreInvitations: boolean) => {
    setView({ kind: "working" });
    quickStartSalon(locale, ignoreInvitations)
      .then(async () => {
        await auth.reload();
        router.replace(`/${locale}/business/setup` as never);
      })
      .catch((e: unknown) => {
        const code = e instanceof ApiError ? e.code : null;
        if (code === "salon.invitation_pending") void decide();
        else setView({ kind: "failed", code });
      });
  };

  const decide = async () => {
    setView({ kind: "working" });
    try {
      const inv = await myInvitations();
      if (inv.items.length > 0) setView({ kind: "invited", items: inv.items });
      else if (inv.formerMember) setView({ kind: "former" });
      else create(false);
    } catch (e) {
      setView({ kind: "failed", code: e instanceof ApiError ? e.code : null });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!auth.user?.platformRole) void decide();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const frame = (children: React.ReactNode) => (
    <View
      testID="crm-quick-start"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 14,
        backgroundColor: c.canvas,
      }}
    >
      {children}
    </View>
  );

  if (view.kind === "working") {
    return frame(
      <>
        <ActivityIndicator color={c.accent} />
        <Text size={16} color={c.body} style={{ textAlign: "center" }}>
          {t("quickStart.preparing")}
        </Text>
      </>,
    );
  }
  if (view.kind === "admin") {
    return frame(
      <CalmCard style={{ maxWidth: 480, width: "100%" }}>
        <EmptyState
          testID="crm-quick-start-admin"
          icon="settings"
          title={t("quickStart.adminTitle")}
          body={t("quickStart.adminBody")}
          action={
            <CalmButton
              label={t("quickStart.adminCta")}
              onPress={() => {
                router.replace(`/${locale}/admin` as never);
              }}
            />
          }
        />
      </CalmCard>,
    );
  }
  if (view.kind === "invited") {
    return frame(
      <Invitations
        items={view.items}
        onCreateOwn={() => {
          create(true);
        }}
      />,
    );
  }
  if (view.kind === "former") {
    return frame(
      <CalmCard style={{ maxWidth: 480, width: "100%" }}>
        <EmptyState
          testID="crm-quick-start-former"
          icon="store"
          title={t("quickStart.formerTitle")}
          body={t("quickStart.formerBody")}
          action={
            <CalmButton
              testID="crm-quick-start-create-own"
              label={t("quickStart.createOwn")}
              onPress={() => {
                create(true);
              }}
            />
          }
        />
      </CalmCard>,
    );
  }
  return frame(
    <CalmCard style={{ maxWidth: 480, width: "100%" }}>
      <EmptyState
        testID="crm-quick-start-failed"
        icon="store"
        title={t("quickStart.failedTitle")}
        body={
          view.code === "salon.email_not_allowed"
            ? t("quickStart.emailNotAllowed")
            : t("quickStart.failedBody")
        }
        action={
          view.code === "salon.email_not_allowed" ? undefined : (
            <CalmButton label={t("quickStart.retry")} onPress={() => void decide()} />
          )
        }
      />
    </CalmCard>,
  );
}

/** "Anh/chị được mời vào <Salon>. Tham gia?" — one card per invitation, then the owner option. */
function Invitations({ items, onCreateOwn }: { items: MyInvitation[]; onCreateOwn: () => void }) {
  const { c } = useCalm();
  const { t } = useTranslation("crm");
  const auth = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const join = (id: string) => {
    if (busy) return;
    setBusy(id);
    setFailed(false);
    acceptMyInvitation(id)
      .then(async () => {
        await auth.reload();
        router.replace(`/${locale}/business` as never);
      })
      .catch(() => {
        setBusy(null);
        setFailed(true);
      });
  };
  return (
    <View testID="crm-invitations" style={{ maxWidth: 520, width: "100%", gap: 14 }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: c.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="team" size={26} color={c.accent} />
        </View>
        <Text role="uiSemiBold" size={22} color={c.ink} style={{ textAlign: "center" }}>
          {items.length === 1 && items[0]
            ? t("quickStart.invitedOne", { salon: items[0].salonName })
            : t("quickStart.invitedTitle")}
        </Text>
        <Text size={15} color={c.body} style={{ textAlign: "center" }}>
          {t("quickStart.invitedBody")}
        </Text>
      </View>
      {failed ? (
        <Text size={14} color={c.attention} style={{ textAlign: "center" }}>
          {t("quickStart.joinFailed")}
        </Text>
      ) : null}
      {items.map((inv) => (
        <CalmCard key={inv.id} style={{ gap: 10 }}>
          <Text role="uiSemiBold" size={17} color={c.ink}>
            {inv.salonName}
          </Text>
          <Text size={14} color={c.body}>
            {t("quickStart.role", { role: t(`shell.roles.${inv.role}`) })}
          </Text>
          <CalmButton
            testID="crm-invitation-join"
            icon="check"
            label={
              busy === inv.id
                ? t("quickStart.joining")
                : t("quickStart.join", { salon: inv.salonName })
            }
            onPress={() => {
              join(inv.id);
            }}
          />
        </CalmCard>
      ))}
      <CalmButton
        testID="crm-quick-start-create-own"
        variant="ghost"
        label={t("quickStart.createOwn")}
        onPress={onCreateOwn}
      />
    </View>
  );
}
