import type { ReactNode } from "react";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard, type IconName } from "@gugu/design-system";

import { useWorkspace } from "../data/useWorkspace";
import { PageHeader } from "../shell/PageHeader";
import { useBreakpoint } from "../shell/useBreakpoint";
import { useCrmNav } from "../shell/useCrmNav";
import { EmptyState } from "../ui/EmptyState";

export type SectionId =
  "calendar" | "appointments" | "customers" | "team" | "resources" | "reviews" | "insights";

const ICON: Record<SectionId, IconName> = {
  calendar: "calendar",
  appointments: "clipboard",
  customers: "users",
  team: "team",
  resources: "box",
  reviews: "star",
  insights: "chart",
};

/** Workspace page frame: header + content. Without data, a section shows its designed empty state. */
export function SectionScreen({
  id,
  children,
}: {
  id: SectionId;
  children?: ReactNode | undefined;
}) {
  const { t } = useTranslation("crm");
  const ws = useWorkspace();
  const bp = useBreakpoint();
  const { go } = useCrmNav();
  const needsSetup = id === "calendar" || id === "appointments";
  return (
    <ScrollView contentContainerStyle={{ padding: bp === "mobile" ? 16 : 28, gap: 20 }}>
      <PageHeader title={t(`pages.${id}.title`)} workspace={ws} />
      {children ?? (
        <CalmCard>
          <EmptyState
            testID={`crm-empty-${id}`}
            icon={ICON[id]}
            title={t(`pages.${id}.emptyTitle`)}
            body={t(`pages.${id}.emptyBody`)}
            action={
              needsSetup ? (
                <CalmButton
                  label={t("pages.setupCta")}
                  icon="sparkles"
                  onPress={() => {
                    go("/business/services");
                  }}
                />
              ) : undefined
            }
          />
        </CalmCard>
      )}
    </ScrollView>
  );
}
