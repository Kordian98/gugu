import { useCallback, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { Asset } from "expo-asset";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { screen } from "../screens";
import { PHOTO } from "./media";
import { chapterScroller } from "./chapters";
import { BA_DURATIONS, BA_STOPS, buildBeforeAfter, scrollParent, trackTimeline } from "./timelines";

const BEFORE = ["b1", "b2", "b3", "b4"] as const;
const AFTER = ["a1", "a2", "a3", "a4", "a5"] as const;
const SAVED = ["r1", "r2", "r3"] as const;
const SEP = " · ";
const R = 40;
const C = 2 * Math.PI * R;

function useTrack(
  build: (tl: gsap.core.Timeline, q: (s: string) => Element[]) => void,
  dep: unknown,
) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const ctx = gsap.context(() => {
      build(trackTimeline(el, 0.3), gsap.utils.selector(el));
    }, el);
    const sc = scrollParent(el);
    const stop =
      sc instanceof HTMLElement ? chapterScroller(sc, el, BA_STOPS, BA_DURATIONS) : () => undefined;
    return () => {
      stop();
      ctx.revert();
    };
  }, [build, dep]);
  return ref;
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
                <circle
                  className="fg"
                  cx="50"
                  cy="50"
                  r={R}
                  strokeDasharray={C}
                  strokeDashoffset={C}
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
                <img
                  src={Asset.fromModule(screen(locale, "timeline")).uri}
                  alt=""
                  decoding="async"
                />
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
