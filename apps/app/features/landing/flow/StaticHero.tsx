import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { HeroCopy } from "../StudioHero";
import type { LandingNavActions } from "../useLandingNav";

const ARROW = "→";

/**
 * The hero as a STATIC block above the story stage (web): the same copy and the arched door window as the
 * stage at journey time 0, doors closed, never animated. The first small scroll (or Start) jumps to the
 * identical stage and plays the intro once; afterwards scrolling up just shows this block again and Start
 * becomes "Continue the journey". Journey.tsx sets the door frame's clip, offset and image (it knows the
 * walk player's desktop/mobile frames).
 */
export function StaticHero({
  nav,
  desktop,
  width,
  heroRef,
  onStart,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
  heroRef: Ref<HTMLDivElement>;
  onStart: () => void;
}) {
  const { t } = useTranslation("landing");
  return (
    <div className="jr-static" ref={heroRef}>
      <div className="jr-hero">
        <HeroCopy nav={nav} desktop={desktop} width={width} stacked={desktop} compact={!desktop} />
      </div>
      <div className="jr-frame">
        <div className="jr-media">
          <img className="jr-poster" alt="" decoding="async" />
        </div>
      </div>
      <div className="jr-hud jr-hud-static hinted" data-page="0">
        <button type="button" className="hud-next" onClick={onStart}>
          <span className="l-start">{t("flow.hud.start")}</span>
          <span className="l-resume">{t("flow.hud.resume")}</span>
          <i aria-hidden>{ARROW}</i>
        </button>
        <span className="hud-hint">
          <span className="h0">
            <span className="k">{t("flow.hud.hintStartKeys")}</span>
            <span className="tc">{t("flow.hud.hintStartTouch")}</span>
          </span>
        </span>
      </div>
    </div>
  );
}
