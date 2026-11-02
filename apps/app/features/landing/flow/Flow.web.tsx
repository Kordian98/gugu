import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { BeforeAfter, Pain } from "./Desk";
import { FLOW_CSS } from "./flow.css";
import { Businesses, FeaturesMobile, FeaturesOverlay, OfficeMobile, OfficeOverlay } from "./Rooms";
import { buildEnter, buildFeatures, buildOffice } from "./timelines";
import { Walk } from "./Walk";

gsap.registerPlugin(ScrollTrigger);

const ROWS = ["1", "2", "3", "4"] as const;
const SEP = " · ";
const ARROW = "→";

/**
 * v4 landing flow (web): one continuous walk through one salon, photoreal and scroll-scrubbed.
 * Street → doors open → reception (walk 1) · the front desk, drowning → calm (same person) · before/after
 * with the time-saved card · reception → treatment area with the features of that room (walk 2) ·
 * treatment → back office with the overview, cited stat and assistant (walk 3) · business types · switching.
 * Native and reduced motion use StoryStatic.
 */
export function Flow() {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (el === null) return;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    el.querySelectorAll(".rv").forEach((n) => {
      io.observe(n);
    });
    return () => {
      io.disconnect();
    };
  }, [locale]);

  useLayoutEffect(() => {
    const refresh = () => {
      ScrollTrigger.refresh();
    };
    void document.fonts.ready.then(refresh);
    window.addEventListener("load", refresh);
    return () => {
      window.removeEventListener("load", refresh);
    };
  }, [locale]);

  return (
    <div className="fl" ref={root}>
      <style>{FLOW_CSS}</style>

      <Walk seg="w1" vh={260} build={buildEnter}>
        <div className="wk-title">
          <div className="fl-eye">{t("flow.walk.eyebrow")}</div>
          <h2 className="fl-h">{t("flow.walk.title")}</h2>
          <div className="wk-hint">{t("flow.walk.hint")}</div>
        </div>
      </Walk>

      <Pain />
      <BeforeAfter />

      <Walk
        seg="w2"
        vh={340}
        walkEnd={0.6}
        build={buildFeatures}
        id="fl-features"
        after={<FeaturesMobile />}
      >
        <FeaturesOverlay />
      </Walk>

      <Walk seg="w3" vh={340} walkEnd={0.6} build={buildOffice} after={<OfficeMobile />}>
        <OfficeOverlay />
      </Walk>

      <Businesses />

      <section className="fl-sec">
        <div className="fl-eye rv">{t("flow.switch.eyebrow")}</div>
        <h2 className="fl-h rv">{t("flow.switch.title")}</h2>
        <p className="fl-sub rv">{t("flow.switch.sub")}</p>
        <div className="sw">
          <div className="plist rv">
            <div className="lbl">{t("flow.switch.from")}</div>
            <p>{t("story.switch.list")}</p>
          </div>
          <div className="arrow rv" style={{ ["--d" as string]: "150ms" }}>
            {ARROW}
          </div>
          <div className="card svc rv" style={{ ["--d" as string]: "250ms" }}>
            <div className="lbl">{t("flow.switch.to")}</div>
            {ROWS.map((r, i) => (
              <div
                key={r}
                className="svc-row rv"
                style={{ ["--d" as string]: `${String(350 + i * 120)}ms` }}
              >
                {t(`story.switch.s${r}`)}
                <span>{[t(`story.switch.d${r}`), t(`story.switch.p${r}`)].join(SEP)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
