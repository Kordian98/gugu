import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { CalmButton, CalmCard } from "@gugu/design-system";

import { useCrmNav } from "../shell/useCrmNav";
import { EmptyState } from "../ui/EmptyState";
import { SectionScreen } from "./SectionScreen";

/**
 * Appointments list. `?new=1` (from "New appointment") explains the prerequisite: the booking engine
 * needs at least one service and working hours before it can offer free times (06, 07 §3.4).
 */
export function AppointmentsScreen() {
  const { t } = useTranslation("crm");
  const { go } = useCrmNav();
  const { new: isNew } = useLocalSearchParams<{ new?: string | undefined }>();
  if (isNew !== "1") return <SectionScreen id="appointments" />;
  return (
    <SectionScreen id="appointments">
      <CalmCard>
        <EmptyState
          testID="crm-new-appointment-prereq"
          icon="calendar"
          title={t("pages.newAppointment.title")}
          body={t("pages.newAppointment.body")}
          action={
            <CalmButton
              label={t("pages.setupCta")}
              icon="sparkles"
              onPress={() => {
                go("/business/services?import=1");
              }}
            />
          }
        />
      </CalmCard>
    </SectionScreen>
  );
}
