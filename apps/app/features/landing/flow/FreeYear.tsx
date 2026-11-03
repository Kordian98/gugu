import { useTranslation } from "react-i18next";

import type { LandingNavActions } from "../useLandingNav";

/**
 * X25, right after the story (where "Finish journey" and "Skip" land): Basic is free for everyone for the
 * first year, then 99,000 VND/month; AI setup from the price list is included, the AI assistant starts
 * at Pro.
 */
export function FreeYear({ nav }: { nav: LandingNavActions }) {
  const { t } = useTranslation("landing");
  return (
    <section className="fy" id="fl-free">
      <div className="fy-in rv">
        <div className="fl-eye">{t("flow.free.eyebrow")}</div>
        <h2 className="fl-h fy-h">
          {t("flow.free.pre")}
          <span className="fy-glow">{t("flow.free.glow")}</span>
          {t("flow.free.post")}
        </h2>
        <p className="fl-sub fy-sub">{t("flow.free.sub")}</p>
        <div className="fy-cta">
          <button type="button" className="fy-btn" onClick={nav.trial}>
            {t("flow.free.cta")}
          </button>
          <button
            type="button"
            className="fy-link"
            onClick={() => {
              nav.scrollTo("pricing");
            }}
          >
            {t("flow.free.plans")}
          </button>
        </div>
      </div>
    </section>
  );
}
