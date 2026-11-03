import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useLocale } from "@/services/i18n/useLocale";

import type { LandingNavActions } from "../useLandingNav";
import { FLOW_CSS } from "./flow.css";
import { FreeYear } from "./FreeYear";
import { Journey } from "./Journey";
import { Businesses } from "./Rooms";

gsap.registerPlugin(ScrollTrigger);

/**
 * v4 landing flow (web): the hero's arched door grows into ONE full-screen scene that walks through one
 * salon (street → front desk drowning → calm → treatment area features → back office), then the
 * before/after with the time-saved card, business types and switching.
 * Reduced motion: the same book, page turns crossfade (no door scrub). Native uses StoryStatic.
 */
export function Flow({
  nav,
  desktop,
  width,
  reduce,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
  reduce: boolean;
}) {
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

      <Journey nav={nav} desktop={desktop} width={width} reduce={reduce} />

      <FreeYear nav={nav} />

      <Businesses />
    </div>
  );
}
