import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { ComingSoonScreen } from "@/features/coming-soon/ComingSoonScreen";
import { DEMO_SALONS } from "@/features/home/data";

export default function SalonScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const name = DEMO_SALONS.find((s) => s.slug === slug)?.name ?? slug;
  return <ComingSoonScreen title={t("comingSoon.salon", { name })} />;
}
