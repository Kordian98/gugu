import { useLayoutEffect, useRef } from "react";
import { Asset } from "expo-asset";
import { gsap } from "gsap";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { HeroCopy } from "../StudioHero";
import { screen } from "../screens";
import type { LandingNavActions } from "../useLandingNav";
import { PHOTO } from "./media";
import { FeaturesPanel, OfficePanel, SwitchPanel } from "./Rooms";
import { WalkPlayer } from "./sequence";
import { scrollStory, type StoryApi } from "./story";
import { BEATS, WIPE, buildJourney, scrollParent } from "./timelines";

const NOTES = ["n1", "n2", "n3"] as const;
const ENTRIES = ["e1", "e2", "e3", "e4"] as const;
const BEFORE = ["b1", "b2", "b3", "b4"] as const;
const AFTER = ["a1", "a2", "a3", "a4", "a5"] as const;
const GAINS = ["g2", "g3"] as const;
const SAVED = ["r1", "r2", "r3"] as const;
const RING = 40;
const CIRC = 2 * Math.PI * RING;
const Z = "Z";
const PHONE = "☎";
const CHECK = "✓";
const SEP = " · ";
const ZERO = "0";
const DOWN = "↓";
/**
 * Navigation chapters → resting beats (BEATS): "front desk" spans before | after, the treatment room its
 * three facts; each beat is one segment of the chapter's bar.
 */
const HUD = [
  { k: "c0", stops: [0] },
  { k: "c1", stops: [1, 2] },
  { k: "c2", stops: [3, 4, 5] },
  { k: "c3", stops: [6] },
  { k: "c4", stops: [7] },
] as const;
const ARROWS = "\u25C0\u25B6";

/**
 * The whole visit as ONE full-screen scene (web): a single sticky stage. The hero's arched door grows to
 * full screen and we walk in; at the front desk the frame freezes into a before/after split (the same
 * receptionist drowning in Zalo + notebook vs calm with GuGu Studio, both whitened, UI on each half);
 * then we walk on into the treatment area (features of that room) and the back office (overview,
 * earnings calculator, assistant) and switching. The scroll position drives it continuously (story.ts);
 * the HUD shows progress and jumps between chapters on the same smooth path.
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
  const ch = useRef<StoryApi | null>(null);
  const zero = (d: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(0);

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
    let render: ReturnType<typeof buildJourney>["render"] = () => undefined;
    const ctx = gsap.context(() => {
      render = buildJourney(el, gsap.utils.selector(el), player, hud.current, locale).render;
    }, el);
    const sc = scrollParent(el);
    ch.current =
      sc instanceof HTMLElement
        ? scrollStory({
            scroller: sc,
            track: el,
            beats: BEATS,
            wipe: WIPE,
            render: (time, px, lay) => {
              render(time, px, lay);
            },
            exitTo: () => document.getElementById("fl-biz"),
          })
        : null;
    if (__DEV__) (window as unknown as { __story?: StoryApi | null }).__story = ch.current;
    // Before/after handle: dragging it scrubs the scroll through the sweep, so the divider, the story and
    // the scrollbar always agree (scrolling moves the divider too).
    const sp = el.querySelector<HTMLElement>(".sp");
    const knob = el.querySelector<HTMLElement>(".sp-knob");
    let dragging = false;
    const move = (e: PointerEvent) => {
      if (!dragging || !sp) return;
      const r = sp.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      ch.current?.scrubWipe(1 - x);
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      knob?.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const up = () => {
      dragging = false;
    };
    knob?.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      knob?.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
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
          <HeroCopy
            nav={nav}
            desktop={desktop}
            width={width}
            stacked={desktop}
            compact={!desktop}
          />
        </div>
        <div className="jr-frame">
          <div className="jr-media">
            <img className="jr-poster" src={PHOTO.exterior} alt="" decoding="async" />
            <canvas ref={canvas} aria-hidden />
          </div>
          <div className="jr-shade" />
          <div className="jr-veil" />

          <div className="jr-intro">
            <div className="fl-eye">{t("flow.walk.eyebrow")}</div>
            <h2 className="fl-h">{t("flow.walk.title")}</h2>
            <div className="wk-hint">{t("flow.walk.hint")}</div>
          </div>

          {/* front desk: before | after */}
          <div className="sp">
            {/* everything left of the divider is "before" (photo + content) */}
            <div className="sp-h sp-l">
              <img src={PHOTO.stress169} alt="" decoding="async" />
              <div className="sp-veil" />
              <div className="sp-ui sp-ui-l">
                <span className="sp-tag b">{t("flow.pain.before")}</span>
                <div className="sp-head">
                  <div className="fl-eye">{t("flow.pain.eyebrow")}</div>
                  <h2 className="fl-h">{t("flow.pain.title")}</h2>
                </div>
                <div className="pn-stat">
                  <span className="pre">{t("flow.pain.pre")}</span>
                  <span className="big">
                    <b className="pn-num">{t("flow.pain.statNum")}</b>
                    <small>{t("flow.pain.statUnit")}</small>
                  </span>
                  <p>{t("flow.pain.statLabel")}</p>
                </div>
                <ol className="sp-steps b">
                  {BEFORE.map((k, i) => (
                    <li key={k}>
                      <b>{String(i + 1)}</b>
                      {t(`flow.ba.${k}`)}
                    </li>
                  ))}
                </ol>
                <div className="sp-row">
                  <div className="pn-notes">
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
                  <div className="pn-book">
                    <div className="lbl">{t("flow.pain.book")}</div>
                    {ENTRIES.map((k, i) => (
                      <div key={k} className={`pn-e x${String(i + 1)}${i === 3 ? " hot" : ""}`}>
                        {t(`flow.pain.${k}`)}
                        <s />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* everything right of the divider is "after" (photo + content) */}
            <div className="sp-h sp-r">
              <img src={PHOTO.calm169} alt="" decoding="async" />
              <div className="sp-veil" />
              <div className="sp-ui sp-ui-r">
                <span className="sp-tag a">{t("flow.pain.after")}</span>
                <div className="sp-head">
                  <div className="fl-eye">{t("flow.pain.calmEyebrow")}</div>
                  <h2 className="fl-h">{t("flow.pain.calmTitle")}</h2>
                </div>
                <p className="pn-calm">{t("flow.pain.calmSub")}</p>
                <div className="pn-g">
                  {AFTER.map((k) => (
                    <div key={k} className="pn-gi">
                      <i>{CHECK}</i>
                      {t(`flow.ba.${k}`)}
                    </div>
                  ))}
                </div>
                <div className="sp-gains">
                  {GAINS.map((k) => (
                    <div key={k} className="sp-gain">
                      <b>{t(`flow.pain.${k}n`)}</b>
                      <span>{t(`flow.pain.${k}l`)}</span>
                    </div>
                  ))}
                </div>
                <div className="sp-app">
                  <div className="card sp-cal">
                    <img
                      src={Asset.fromModule(screen(locale, "timeline")).uri}
                      alt=""
                      decoding="async"
                    />
                    <div className="sp-booked">
                      <i>{CHECK}</i>
                      {t("flow.ba.booked")}
                    </div>
                  </div>
                  <div className="sp-rem">
                    <small>{t("flow.pain.zalo")}</small>
                    {t("flow.ba.remind")}
                    <span className="sp-come">{t("flow.ba.come")}</span>
                  </div>
                  <div className="card sv">
                    <div className="sv-ring">
                      <svg viewBox="0 0 100 100" aria-hidden>
                        <circle className="bg" cx="50" cy="50" r={RING} />
                        <circle
                          className="fg"
                          cx="50"
                          cy="50"
                          r={RING}
                          strokeDasharray={CIRC}
                          strokeDashoffset={CIRC}
                        />
                      </svg>
                      <div>
                        <span className="sv-num">{zero(1)}</span>
                        <span className="sv-unit">{t("flow.saved.unit")}</span>
                      </div>
                    </div>
                    <div>
                      <div className="sv-t">
                        {t("flow.saved.title")}
                        <em>{t("flow.saved.eg")}</em>
                      </div>
                      <div className="sv-rows">
                        {SAVED.map((k) => (
                          <div key={k}>
                            <b className={`sv-${k}`}>{zero(0)}</b>
                            <span>{t(`flow.saved.${k}`)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="sp-line" />
            <button type="button" className="sp-knob" aria-label={t("flow.pain.drag")}>
              {ARROWS}
            </button>

            <div className="jr-foot">{t("flow.pain.src")}</div>
          </div>

          <div className="wk-cap cap-deeper">{t("flow.walk.deeper")}</div>
          <div className="wk-cap cap-office">{t("flow.walk.office")}</div>
          <FeaturesPanel />
          <OfficePanel />
          <SwitchPanel />
        </div>

        <nav className="jr-hud" ref={hud} aria-label={t("flow.hud.label")}>
          <div className="hud-steps">
            {HUD.map((c) => (
              <button
                key={c.k}
                type="button"
                className="hud-s"
                data-stops={c.stops.join(",")}
                onClick={() => {
                  ch.current?.goTo(c.stops[0]);
                }}
              >
                <span className="hud-bars">
                  {c.stops.map((si) => (
                    <span key={si} className="hud-bar">
                      <span className="hud-fill" data-stop={si} />
                    </span>
                  ))}
                </span>
                <em>{t(`flow.hud.${c.k}`)}</em>
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
            <span className="l-after">{t("flow.hud.after")}</span>
            <span className="l-cont">{t("flow.hud.finish")}</span>
            <i>{DOWN}</i>
          </button>
        </nav>
        <button
          type="button"
          className="jr-skip"
          onClick={() => {
            ch.current?.exit();
          }}
        >
          {t("flow.hud.skip")}
        </button>
      </div>
    </div>
  );
}
