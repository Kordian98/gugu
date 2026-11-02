import { useCallback, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen } from "../screens";
import { PHOTO, LOOP } from "./media";
import { buildBeforeAfter, buildPain, trackTimeline } from "./timelines";

const NOTES = ["n1", "n2", "n3", "n4"] as const;
const ENTRIES = ["e1", "e2", "e3", "e4"] as const;
const GUGU = ["g1", "g2", "g3"] as const;
const BEFORE = ["b1", "b2", "b3", "b4"] as const;
const AFTER = ["a1", "a2", "a3", "a4", "a5"] as const;
const SAVED = ["r1", "r2", "r3"] as const;
const Z = "Z";
const PHONE = "☎";
const CHECK = "✓";
const SEP = " · ";
const R = 40;
const C = 2 * Math.PI * R;

function useTrack(build: (tl: gsap.core.Timeline, q: (s: string) => Element[]) => void, dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const ctx = gsap.context(() => {
      build(trackTimeline(el, 0.5), gsap.utils.selector(el));
    }, el);
    return () => {
      ctx.revert();
    };
  }, [build, dep]);
  return ref;
}

/**
 * The front desk (pain → calm): bold type and one striking number over full-bleed photography of the
 * receptionist (subtle 5 s video loops, 4K-upscaled), Zalo pings and notebook entries layered on scroll,
 * then the same person and desk, calm. Fictional names; figures are illustrative.
 */
export function Pain() {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const ref = useTrack(buildPain, locale);
  return (
    <div className="pn" ref={ref}>
      <div className="pn-stage">
        <div className="pn-head">
          <div className="pn-l">
            <div className="pn-a">
              <div className="fl-eye">{t("flow.pain.eyebrow")}</div>
              <h2 className="fl-h">{t("flow.pain.title")}</h2>
            </div>
            <div className="pn-b" style={{ opacity: 0 }}>
              <div className="fl-eye">{t("flow.pain.calmEyebrow")}</div>
              <h2 className="fl-h">{t("flow.pain.calmTitle")}</h2>
            </div>
          </div>
          <div className="pn-r">
            <div className="pn-sa">
              <div className="pn-stat">
                <span className="pre">{t("flow.pain.pre")}</span>
                <span className="big">{t("flow.pain.stat")}</span>
                <p>{t("flow.pain.statLabel")}</p>
              </div>
            </div>
            <div className="pn-sb" style={{ opacity: 0 }}>
              <p className="pn-calm">{t("flow.pain.calmSub")}</p>
            </div>
          </div>
        </div>
        <div className="pn-band">
          <img className="po" src={PHOTO.stress} alt="" decoding="async" />
          <video src={LOOP.stress} poster={PHOTO.stress} autoPlay muted loop playsInline />
          <video className="pn-calmv" src={LOOP.calm} poster={PHOTO.calm} autoPlay muted loop playsInline />
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
          <div className="lyr pn-g">
            {GUGU.map((k) => (
              <div key={k} className="pn-gi">
                <i>{CHECK}</i>
                {t(`flow.pain.${k}`)}
              </div>
            ))}
          </div>
        </div>
        <div className="pn-foot">{t("flow.pain.note")}</div>
      </div>
    </div>
  );
}

/** Same booking, two days: Zalo + notebook vs Zalo OA + GuGu Studio, with the time-saved card. */
export function BeforeAfter() {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const build = useCallback(
    (tl: gsap.core.Timeline, q: (s: string) => Element[]) => {
      buildBeforeAfter(tl, q, (n, d) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n),
      );
    },
    [locale],
  );
  const ref = useTrack(build, locale);
  const zero = (d: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(0);
  return (
    <div className="ba-track" ref={ref}>
      <div className="ba-stage">
        <div className="ba-head">
          <div>
            <div className="fl-eye">{t("flow.ba.eyebrow")}</div>
            <h2 className="fl-h">{t("flow.ba.title")}</h2>
          </div>
          <div className="card sv">
            <div className="sv-ring">
              <svg viewBox="0 0 100 100" aria-hidden>
                <circle className="bg" cx="50" cy="50" r={R} />
                <circle className="fg" cx="50" cy="50" r={R} strokeDasharray={C} strokeDashoffset={C} />
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
        <div className="ba-split">
          <div className="ba-col b">
            <span className="ba-tag">{t("flow.ba.before")}</span>
            <ol className="ba-steps">
              {BEFORE.map((k, i) => (
                <li key={k} className={`bs${String(i + 1)}`}>
                  <b>{String(i + 1)}</b>
                  {t(`flow.ba.${k}`)}
                </li>
              ))}
            </ol>
            <div className="ba-scene b">
              <img className="ph" src={PHOTO.phone} alt="" decoding="async" />
              <div className="ba-card zalo bc-zalo" style={{ top: "6%" }}>
                {t("flow.ba.zaloIn")}
              </div>
              <div className="ba-card book bc-book" style={{ top: "30%" }}>
                {t("flow.ba.notebook")}
              </div>
              <div className="ba-card bc-call" style={{ top: "56%" }}>
                {t("flow.ba.call")}
              </div>
              <div className="ba-card warn bc-forgot" style={{ top: "76%" }}>
                {t("flow.ba.forgot")}
              </div>
            </div>
          </div>
          <div className="ba-col a">
            <span className="ba-tag">{t("flow.ba.after")}</span>
            <ol className="ba-steps">
              {AFTER.map((k, i) => (
                <li key={k} className={`as${String(i + 1)}`}>
                  <b>{String(i + 1)}</b>
                  {t(`flow.ba.${k}`)}
                </li>
              ))}
            </ol>
            <div className="ba-scene a">
              <img className="ph" src={PHOTO.customer} alt="" decoding="async" />
              <div className="ba-card zalo ac-zalo" style={{ top: "4%" }}>
                {t("flow.ba.zaloIn")}
              </div>
              <div className="ba-card ok ac-ok" style={{ top: "22%" }}>
                {t("flow.ba.booked")}
              </div>
              <div className="ba-card cal ac-cal" style={{ top: "36%", left: "4%", right: "4%" }}>
                <img src={Asset.fromModule(screen(locale, "timeline")).uri} alt="" decoding="async" />
              </div>
              <div className="ba-card zalo ac-rem" style={{ top: "68%" }}>
                {t("flow.ba.remind")}
                <div>
                  <span className="ba-btn ac-come">{t("flow.ba.come")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="ba-note">
          {t("flow.ba.oa")}
          {SEP}
          {t("flow.ba.note")}
          {SEP}
          {t("flow.saved.note")}
        </div>
      </div>
    </div>
  );
}
