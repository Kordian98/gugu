import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { ComingSoonScreen } from "@/features/coming-soon/ComingSoonScreen";
import { CATEGORY_IDS, type CategoryId } from "@/features/home/data";

export default function CategoryScreen() {
  const { t } = useTranslation();
  const { t: tm } = useTranslation("marketing");
  const { category } = useLocalSearchParams<{ category: string }>();
  const id = (CATEGORY_IDS as readonly string[]).includes(category)
    ? (category as CategoryId)
    : null;
  const name = id ? tm(`home.categories.${id}`) : category;
  return <ComingSoonScreen title={t("comingSoon.category", { name })} />;
}
