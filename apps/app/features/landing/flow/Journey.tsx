import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { HeroCopy } from "../StudioHero";
import type { LandingNavActions } from "../useLandingNav";
import { LOOP, PHOTO } from "./media";
import { FeaturesPanel, OfficePanel } from "./Rooms";
import { WalkPlayer } from "./sequence";
import { chapterScroller } from "./chapters";
import { DURATIONS, STOPS, buildJourney, scrollParent } from "./timelines";

const NOTES = ["n1", "n2", "n3", "n4"] as const;
const ENTRIES = ["e1", "e2", "e3", "e4"] as const;
const GUGU = ["g1", "g2", "g3"] as const;
const Z = "Z";
const PHONE = "☎";
const CHECK = "✓";
const SEP = " · ";

/**
 * The whole visit as ONE full-screen scene (web): a single sticky stage whose canvas walks in from the
 * street, through the doors to the front desk, where the drowning → calm story plays on the same frame
 * (Zalo pings, notebook, then the same receptionist calm), then walks on into the treatment area
 * (features of that room) and the back office (overview, cited stat, assistant). No section breaks: the
 * camera never leaves the stage. Desktop full-bleed frames, mobile portrait frames.
 */
export function Journey({
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
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const vStress = useRef<HTMLVideoElement>(null);
  const vCalm = useRef<HTMLVideoElement>(null);
  // Rendered client-only (Flow mounts after hydration), so matchMedia is safe here.
  const mobile = window.matchMedia("(max-width: 899px)").matches;

  useLayoutEffect(() => {
    const el = track.current;
    const cv = canvas.current;
    if (el === null || cv === null) return;
    const player = new WalkPlayer(cv);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          player.load("w1");
          io.disconnect();
        }
      },
      { rootMargin: "200% 0px 200% 0px" },
    );
    io.observe(el);
    const onResize = () => {
      player.resize();
    };
    onResize();
    window.addEventListener("resize", onResize);
    const ctx = gsap.context(() => {
      buildJourney(el, gsap.utils.selector(el), player, {
        stress: vStress.current,
        calm: vCalm.current,
      });
    }, el);
    const sc = scrollParent(el);
    const stopChapters =
      sc instanceof HTMLElement ? chapterScroller(sc, el, STOPS, DURATIONS) : () => undefined;
    return () => {
      stopChapters();
      ctx.revert();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      player.destroy();
    };
  }, [locale]);

  return (
    <div className="jr" ref={track}>
      <div className="jr-stage">
        <div className="jr-hero">
          <HeroCopy nav={nav} desktop={desktop} width={width} stacked={desktop} />
        </div>
        <div className="jr-frame">
          <div className="jr-media">
            <img className="jr-poster" src={PHOTO.exterior} alt="" decoding="async" />
            <canvas ref={canvas} aria-hidden />
            <video
              ref={vStress}
              className="jr-v"
              src={mobile ? LOOP.stressM : LOOP.stress}
              poster={mobile ? undefined : PHOTO.stress169}
              muted
              loop
              playsInline
              preload="none"
            />
            <video
              ref={vCalm}
              className="jr-v"
              src={mobile ? LOOP.calmM : LOOP.calm}
              poster={mobile ? undefined : PHOTO.calm169}
              muted
              loop
              playsInline
              preload="none"
            />
          </div>
          <div className="jr-shade" />
          <div className="jr-light" />
          <div className="jr-veil" />

          <div className="jr-intro">
            <div className="fl-eye">{t("flow.walk.eyebrow")}</div>
            <h2 className="fl-h">{t("flow.walk.title")}</h2>
            <div className="wk-hint">{t("flow.walk.hint")}</div>
          </div>

          <div className="jr-pain">
            <div className="jr-stack">
              <div className="pn-a">
                <div className="fl-eye">{t("flow.pain.eyebrow")}</div>
                <h2 className="fl-h">{t("flow.pain.title")}</h2>
              </div>
              <div className="pn-b">
                <div className="fl-eye">{t("flow.pain.calmEyebrow")}</div>
                <h2 className="fl-h">{t("flow.pain.calmTitle")}</h2>
              </div>
            </div>
            <div className="jr-stack">
              <div className="pn-sa pn-stat">
                <span className="pre">{t("flow.pain.pre")}</span>
                <span className="big">{t("flow.pain.stat")}</span>
                <p>{t("flow.pain.statLabel")}</p>
              </div>
              <div className="pn-sb">
                <p className="pn-calm">{t("flow.pain.calmSub")}</p>
                <div className="pn-g">
                  {GUGU.map((k) => (
                    <div key={k} className="pn-gi">
                      <i>{CHECK}</i>
                      {t(`flow.pain.${k}`)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lyr pn-notes">
            {NOTES.map((k) => (
              <div key={k} className="pn-n">
                <i>{Z}</i>
                <div>
                  <small>
                    {t("flow.pain.zalo")}
                    {SEP}
                    {t("flow.pain.now")}
                  </small>
                  {t(`flow.pain.${k}`)}
                </div>
              </div>
            ))}
            <div className="pn-n call">
              <i>{PHONE}</i>
              <div>{t("flow.pain.n5")}</div>
            </div>
          </div>
          <div className="lyr pn-book">
            <div className="lbl">{t("flow.pain.book")}</div>
            {ENTRIES.map((k, i) => (
              <div key={k} className={`pn-e x${String(i + 1)}${i === 3 ? " hot" : ""}`}>
                {t(`flow.pain.${k}`)}
                <s />
              </div>
            ))}
          </div>
          <div className="jr-foot">{t("flow.pain.note")}</div>

          <div className="wk-cap cap-deeper">{t("flow.walk.deeper")}</div>
          <div className="wk-cap cap-office">{t("flow.walk.office")}</div>
          <FeaturesPanel />
          <OfficePanel />
        </div>
      </div>
    </div>
  );
}
