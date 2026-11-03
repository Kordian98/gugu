import type { Ref } from "react";
import { useTranslation } from "react-i18next";

import { HeroCopy } from "../StudioHero";
import type { LandingNavActions } from "../useLandingNav";

const ARROW = "→";

/**
 * The hero as a STATIC block above the story stage (web): the same copy and the arched door window as the
 * stage at journey time 0, doors closed, never animated. The first small scroll (or Start) jumps to the
 * identical stage and plays the intro once; afterwards scrolling up just shows this block again, without
 * the plaque (the intro never replays). Journey.tsx sets the door frame's clip, offset and image (it knows the
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
      {/* The hero's one call to action, part of the shopfront: a brass-framed plaque at the foot of the
          arch. Gone for good after the first walk-in (intro once per visit). */}
      <div className="jr-plaque">
        <p>
          <span className="k">{t("flow.hud.walkIn")}</span>
          <span className="tc">{t("flow.hud.walkInTouch")}</span>
        </p>
        <button type="button" onClick={onStart}>
          {t("flow.hud.startShort")}
          <i aria-hidden>{ARROW}</i>
        </button>
      </div>
    </div>
  );
}
