import { View } from "react-native";
import { useTranslation } from "react-i18next";

import { space, type IconName } from "@gugu/design-system";

import { ChoiceRow } from "./Choice";
import { TEAMS, type Answers, type Team } from "./model";
import { StepQuestion } from "./Tiles";

const TEAM_ICON: Record<Team, IconName> = { solo: "user", small: "users", large: "team" };

/**
 * The three one-tap questions. Desktop: numbered steps (each starts answered) with icon tiles.
 * Phone: compact inline chip rows (same states), so the whole assistant fits one screen.
 */
export function Questions({
  answers,
  onAnswer,
  desktop,
  reduce,
}: {
  answers: Answers;
  onAnswer: (patch: Partial<Answers>) => void;
  desktop: boolean;
  reduce: boolean;
}) {
  const { t } = useTranslation("landing");
  const team = TEAMS.map((v) => ({
    value: v,
    label: desktop ? t(`pricing.q.team.${v}`) : t(`pricing.q.team.short.${v}`),
    a11yLabel: t(`pricing.q.team.${v}`),
    icon: TEAM_ICON[v],
  }));
  const ai = [
    { value: "yes", label: t("pricing.q.ai.yes"), icon: "sparkles" },
    { value: "no", label: t("pricing.q.ai.no"), icon: "calendar" },
  ] as const;
  const multi = [
    { value: "one", label: t("pricing.q.multi.one"), icon: "store" },
    { value: "many", label: t("pricing.q.multi.many"), icon: "pin" },
  ] as const;
  const aiValue = answers.ai ? "yes" : "no";
  const multiValue = answers.multi ? "many" : "one";
  const setTeam = (v: Team) => {
    onAnswer({ team: v });
  };
  const setAi = (v: "yes" | "no") => {
    onAnswer({ ai: v === "yes" });
  };
  const setMulti = (v: "one" | "many") => {
    onAnswer({ multi: v === "many" });
  };

  if (!desktop) {
    return (
      <View style={{ gap: space[1] + 2 }} testID="pricing-questions">
        <ChoiceRow
          testID="pricing-q-team"
          inline
          label={t("pricing.q.team.label")}
          question={t("pricing.q.team.full")}
          value={answers.team}
          onChange={setTeam}
          options={team}
        />
        <ChoiceRow
          testID="pricing-q-ai"
          inline
          label={t("pricing.q.ai.label")}
          question={t("pricing.q.ai.full")}
          value={aiValue}
          onChange={setAi}
          options={ai}
        />
        <ChoiceRow
          testID="pricing-q-multi"
          inline
          label={t("pricing.q.multi.label")}
          question={t("pricing.q.multi.full")}
          value={multiValue}
          onChange={setMulti}
          options={multi}
        />
      </View>
    );
  }
  return (
    <View testID="pricing-questions">
      <View>
        <StepQuestion
          n={1}
          testID="pricing-q-team"
          question={t("pricing.q.team.full")}
          options={team}
          value={answers.team}
          onChange={setTeam}
          last={false}
          reduce={reduce}
        />
        <StepQuestion
          n={2}
          testID="pricing-q-ai"
          question={t("pricing.q.ai.full")}
          options={ai}
          value={aiValue}
          onChange={setAi}
          last={false}
          reduce={reduce}
        />
        <StepQuestion
          n={3}
          testID="pricing-q-multi"
          question={t("pricing.q.multi.full")}
          options={multi}
          value={multiValue}
          onChange={setMulti}
          last
          reduce={reduce}
        />
      </View>
    </View>
  );
}
