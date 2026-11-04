import { useTranslation } from "react-i18next";

import { Shot } from "./Shot";

const ITEMS = ["i1", "i2", "i3", "i4", "i5"] as const;
const CHECK = "✓";

/**
 * Back office, second page: Insights: key metrics, estimated vs recorded revenue, gross margin from
 * execution cost, upcoming appointments, the Zalo funnel — next to a REAL crop of the Insights screen
 * of the seeded demo salon.
 */
export function InsightsPanel() {
  const { t } = useTranslation("landing");
  return (
    <div className="ov ov-i">
      <div className="t">
        <div className="fl-eye">{t("flow.insights.eyebrow")}</div>
        <h2 className="fl-h">{t("flow.insights.title")}</h2>
        <p className="fl-sub in-sub">{t("flow.insights.sub")}</p>
        <ul className="in-list">
          {ITEMS.map((k) => (
            <li key={k}>
              <i aria-hidden>{CHECK}</i>
              {t(`flow.insights.${k}`)}
            </li>
          ))}
        </ul>
      </div>
      <Shot
        name="insightsKpis"
        name2x="insightsKpis2x"
        caption={t("flow.insights.shot")}
        sizes="(max-width: 899px) 140vw, 46vw"
        className="ins"
      />
    </div>
  );
}
