import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import type { LandingNavActions } from "../useLandingNav";
import { BeforeAfter } from "./Desk";
import { FLOW_CSS } from "./flow.css";
import { Journey } from "./Journey";
import { Businesses } from "./Rooms";

gsap.registerPlugin(ScrollTrigger);

const ROWS = ["1", "2", "3", "4"] as const;
const SEP = " · ";
const ARROW = "→";

/**
 * v4 landing flow (web): the hero's arched door grows into ONE full-screen scene that walks through one
 * salon (street → front desk drowning → calm → treatment area features → back office), then the
 * before/after with the time-saved card, business types and switching.
 * Native and reduced motion use StoryStatic.
 */
export function Flow({
  nav,
  desktop,
  width,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
}) {
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

      <Journey nav={nav} desktop={desktop} width={width} />
      <BeforeAfter />

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
