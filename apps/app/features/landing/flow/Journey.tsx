import { useLayoutEffect, useRef } from "react";

import type { Chapters } from "./chapters";
import { gsap } from "gsap";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { HeroCopy } from "../StudioHero";
import type { LandingNavActions } from "../useLandingNav";
import { PHOTO } from "./media";
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
const ZERO = "0";
const DOWN = "\u2193";
const HUD = ["c0", "c1", "c2", "c3", "c4"] as const;

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
  const hud = useRef<HTMLElement>(null);
  const ch = useRef<Chapters | null>(null);

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
      buildJourney(el, gsap.utils.selector(el), player, hud.current);
    }, el);
    const sc = scrollParent(el);
    ch.current = sc instanceof HTMLElement ? chapterScroller(sc, el, STOPS, DURATIONS) : null;
    return () => {
      ch.current?.destroy();
      ch.current = null;
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
          <HeroCopy nav={nav} desktop={desktop} width={width} stacked={desktop} compact={!desktop} />
        </div>
        <div className="jr-frame">
          <div className="jr-media">
            <img className="jr-poster" src={PHOTO.exterior} alt="" decoding="async" />
            <canvas ref={canvas} aria-hidden />
            <img className="jr-calm" src={PHOTO.calm169} alt="" decoding="async" />
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
                <span className="big">
                  <b className="pn-num">{t("flow.pain.statNum")}</b>
                  <small>{t("flow.pain.statUnit")}</small>
                </span>
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
            <div className="pn-badge">
              <b className="pn-count">{ZERO}</b>
              {t("flow.pain.unread")}
            </div>
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

        <nav className="jr-hud" ref={hud} aria-label={t("flow.hud.label")}>
          <div className="hud-steps">
            {HUD.map((k, i) => (
              <button
                key={k}
                type="button"
                className="hud-s"
                onClick={() => {
                  ch.current?.goTo(i);
                }}
              >
                <span className="hud-bar">
                  <span className="hud-fill" />
                </span>
                <em>{t(`flow.hud.${k}`)}</em>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="hud-next"
            onClick={() => {
              ch.current?.next();
            }}
          >
            <span className="l-start">{t("flow.hud.start")}</span>
            <span className="l-next">{t("flow.hud.next")}</span>
            <span className="l-cont">{t("flow.hud.cont")}</span>
            <i>{DOWN}</i>
          </button>
        </nav>
        <button
          type="button"
          className="jr-skip"
          onClick={() => {
            ch.current?.skipTo(document.getElementById("fl-biz"));
          }}
        >
          {t("flow.hud.skip")}
        </button>
      </div>
    </div>
  );
}
