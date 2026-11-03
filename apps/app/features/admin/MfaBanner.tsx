import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton } from "@gugu/design-system";

import { useLocale } from "@/services/i18n/useLocale";

import { EmptyState } from "../salon-crm/ui/EmptyState";
import { useAdminMfa } from "./data";
import { Section } from "./ui";

/** Shown until the admin enrols a TOTP factor: every admin write is refused before that. */
export function MfaBanner() {
  const { t } = useTranslation("admin");
  const status = useAdminMfa();
  const router = useRouter();
  const locale = useLocale();
  if (!status.data || status.data.enrolled) return null;
  return (
    <Section testID="admin-mfa-banner" title={t("security.bannerTitle")}>
      <EmptyState
        icon="alert"
        title={t("security.bannerTitle")}
        body={t("security.bannerBody")}
        action={
          <CalmButton
            label={t("actions.enrolAction")}
            onPress={() => {
              router.push(`/${locale}/admin/security` as never);
            }}
          />
        }
      />
    </Section>
  );
}
