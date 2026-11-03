import { useLayoutEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import { gsap } from "gsap";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/services/i18n/useLocale";

import { HeroCopy } from "../StudioHero";
import { screen } from "../screens";
import type { LandingNavActions } from "../useLandingNav";
import { PHOTO } from "./media";
import { ChatStory } from "./ChatStory";
import { InsightsPanel } from "./Insights";
import {
  AI_STEPS,
  AiViz,
  CLIENT_STEPS,
  ClientStrip,
  ClientSystem,
  ViewTabs,
  type View,
} from "./Perspectives";
import { PayrollPanel } from "./Payroll";
import { FeaturesPanel, OfficePanel, SwitchPanel } from "./Rooms";
import { WalkPlayer, frameUrl, type Segment } from "./sequence";
import { book, type BookApi } from "./book";
import { StaticHero } from "./StaticHero";
import { PAGES, buildJourney, portalStyle, scrollParent } from "./timelines";

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
const NEXT_ARROW = "\u2192";
/**
 * Navigation chapters → pages (PAGES). The book starts at Front desk (its first bar fills while the intro
 * plays), then before | after, the treatment room's three facts, the office + Insights and switching.
 * `bars` = page ranges each segment fills over. The hero is not a chapter.
 */
const HUD = [
  {
    k: "c1",
    stops: [1, 2],
    bars: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    k: "c2",
    stops: [3, 4, 5],
    bars: [
      [2, 3],
      [3, 4],
      [4, 5],
    ],
  },
  {
    k: "c3",
    stops: [6, 7, 8],
    bars: [
      [5, 6],
      [6, 7],
      [7, 8],
    ],
  },
  { k: "c4", stops: [9], bars: [[8, 9]] },
] as const;
/** Next-button label per page: start the tour, see the after, finish, otherwise "Next". */
const LABELS = ["start", "next", "after", "finish"] as const;
const labelFor = (page: number) =>
  page === 0 ? "start" : page === 1 ? "after" : page === PAGES.length - 1 ? "finish" : "next";
/** Walk segments' journey-time ranges (must be loaded before a turn plays through them). */
const WALKS: [Segment, number, number][] = [
  ["w1", 0, 0.153],
  ["w2", 0.45, 0.558],
  ["w3", 0.781, 0.881],
];
const PREV = "\u2190";
const CENTER = "\u2195";

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
  reduce,
}: {
  nav: LandingNavActions;
  desktop: boolean;
  width: number;
  reduce: boolean;
}) {
  const { t } = useTranslation("landing");
  const locale = useLocale();
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLElement>(null);
  const heroBlock = useRef<HTMLDivElement>(null);
  const ch = useRef<BookApi | null>(null);
  const [view, setView] = useState<View>("salon");
  /** Switch perspective: the salon walk (book), the client's Zalo chat, or the owner's AI assistant. */
  const pick = (v: View) => {
    setView(v);
    ch.current?.setActive(v === "salon");
    if (v === "salon") ch.current?.start();
    else ch.current?.dock();
  };
  const exit = () => {
    ch.current?.exit();
  };
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
    const stage = el.querySelector<HTMLElement>(".jr-stage");
    const h = hud.current;
    const count = h?.querySelector<HTMLElement>(".hud-count");
    const sr = h?.querySelector<HTMLElement>(".hud-sr");
    const lbls = h?.querySelector<HTMLElement>(".hud-lbls");
    const nextBtn = h?.querySelector<HTMLButtonElement>(".hud-next");
    const prevBtn = h?.querySelector<HTMLButtonElement>(".hud-prev");
    // Page → the panel that is on screen; every other panel is inert (no focus, no AT) while hidden.
    const PANELS: [string, number[]][] = [
      [".sp", [1, 2]],
      [".ov-f", [3, 4, 5]],
      [".ov-o", [6]],
      [".ov-i", [7]],
      [".ov-p", [8]],
      [".ov-s", [9]],
    ];
    const chapterOf = (page: number) =>
      HUD.find((c) => (c.stops as readonly number[]).includes(page));
    // "Center view": book.ts onCenter shows it while the journey is partly out of the viewport. It is
    // appended to <body> so `position: fixed` is relative to the viewport (the RN Web scroll content would
    // otherwise be its containing block).
    // The salon owner's journey is always the default: once the story leaves the viewport, a client or AI
    // perspective resets, so scrolling back, the intro and Start always open "Chủ salon" (owner).
    const stageEl = el.querySelector<HTMLElement>(".jr-stage");
    const reset = new IntersectionObserver((es) => {
      if (es.some((e) => !e.isIntersecting)) {
        setView("salon");
        ch.current?.setActive(true);
      }
    });
    if (stageEl) reset.observe(stageEl);
    const centerBtn = document.createElement("button");
    centerBtn.type = "button";
    centerBtn.className = "jr-center";
    centerBtn.hidden = true;
    const centerIcon = document.createElement("i");
    centerIcon.setAttribute("aria-hidden", "true");
    centerIcon.textContent = CENTER;
    centerBtn.append(centerIcon, document.createTextNode(t("flow.hud.center")));
    centerBtn.addEventListener("click", () => {
      ch.current?.center();
    });
    document.body.append(centerBtn);
    // Book pages are 1..8 (the hero is not a page).
    const total = PAGES.length - 1;
    const hb = heroBlock.current;
    let lastLabel = "";
    // Page UI changes the moment a turn starts (label crossfade + width morph, chapter, counter).
    const onPage = (page: number, settled: boolean) => {
      if (!h) return;
      h.dataset["page"] = String(page);
      // First-view hints: on the hero "scroll or Start", on Front desk "Next or →"; gone after a turn.
      if (page > 1) h.classList.remove("hinted");
      h.querySelectorAll<HTMLElement>(".hud-s").forEach((b) => {
        const stops = (b.dataset["stops"] ?? "").split(",").map(Number);
        b.classList.toggle("on", stops.includes(page));
        b.setAttribute("aria-current", stops.includes(page) ? "step" : "false");
      });
      if (count) count.textContent = t("flow.hud.page", { n: Math.max(1, page), total });
      PANELS.forEach(([sel, pages]) => {
        const panel = el.querySelector<HTMLElement>(sel);
        if (panel) panel.inert = !pages.includes(page);
      });
      if (prevBtn) prevBtn.disabled = page <= 1;
      const key = labelFor(page);
      if (lbls && key !== lastLabel) {
        lastLabel = key;
        let w = 0;
        lbls.querySelectorAll<HTMLElement>("[data-k]").forEach((l) => {
          const on = l.dataset["k"] === key;
          l.classList.toggle("on", on);
          if (on) {
            w = l.offsetWidth;
            nextBtn?.setAttribute("aria-label", l.textContent);
          }
        });
        lbls.style.width = `${String(w)}px`;
      }
      if (settled) {
        h.dataset["settled"] = String(page);
        // Screen readers hear the page once it has settled (the visible counter is aria-hidden).
        const c = chapterOf(page);
        if (sr && page > 0 && c)
          sr.textContent = t("flow.hud.pageSr", {
            n: page,
            total,
            chapter: t(`flow.hud.${c.k}`),
          });
      }
    };
    // Static hero: the same door window as the stage at time 0 (clip, offset, first walk frame).
    const syncHero = () => {
      if (!hb) return;
      const st = portalStyle(0, player.mobile);
      const fr = hb.querySelector<HTMLElement>(".jr-frame");
      const md = hb.querySelector<HTMLElement>(".jr-media");
      const im = hb.querySelector<HTMLImageElement>(".jr-poster");
      if (fr) fr.style.clipPath = st.clip;
      if (md) md.style.transform = st.transform;
      if (im && !im.getAttribute("src")) im.src = frameUrl("w1", player.mobile, 0);
    };
    syncHero();
    window.addEventListener("resize", syncHero);
    const ready = (from: number, to: number) => {
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const need = WALKS.filter(([, a, b]) => lo < b && hi > a).map(([seg]) => seg);
      need.forEach((seg) => {
        player.load(seg);
      });
      const t0 = performance.now();
      return new Promise<void>((res) => {
        const check = () => {
          if (need.every((seg) => player.loaded(seg) >= 0.5) || performance.now() - t0 > 2500)
            res();
          else setTimeout(check, 50);
        };
        check();
      });
    };
    const sc = scrollParent(el);
    ch.current =
      sc instanceof HTMLElement && stage
        ? book({
            scroller: sc,
            hero: hb ?? el,
            track: el,
            stage,
            pages: PAGES,
            reduce,
            render: (time) => {
              render(time);
            },
            onPage,
            onIntroDone: () => {
              hb?.classList.add("done");
              el.classList.add("intro-done");
            },
            ready,
            exitTo: () => document.getElementById("fl-free"),
            onCenter: (show) => {
              centerBtn.hidden = !show;
            },
            onExited: (target) => {
              // After Finish, move focus to the section the visitor landed on.
              target?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
            },
          })
        : null;
    if (__DEV__) (window as unknown as { __book?: BookApi | null }).__book = ch.current;
    return () => {
      reset.disconnect();
      centerBtn.remove();
      window.removeEventListener("resize", syncHero);
      ch.current?.destroy();
      ch.current = null;
      ctx.revert();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      player.destroy();
    };
  }, [locale, reduce, t]);

  return (
    <>
      <StaticHero
        nav={nav}
        desktop={desktop}
        width={width}
        heroRef={heroBlock}
        onStart={() => {
          pick("salon");
        }}
      />
      <div className="jr" ref={track}>
        <div className={`jr-stage v-${view}`}>
          <ViewTabs view={view} onPick={pick} />
          {/* The stage's copy of the hero (time 0) only animates away in the intro; the static hero above
            is the interactive one. */}
          <div className="jr-hero" inert>
            <HeroCopy
              nav={nav}
              desktop={desktop}
              width={width}
              stacked={desktop}
              compact={!desktop}
              journey
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
                        <i aria-hidden>{CHECK}</i>
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
                        <i aria-hidden>{CHECK}</i>
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

              <div className="jr-foot">{t("flow.pain.src")}</div>
            </div>

            <div className="wk-cap cap-deeper">{t("flow.walk.deeper")}</div>
            <div className="wk-cap cap-office">{t("flow.walk.office")}</div>
            <FeaturesPanel />
            <OfficePanel />
            <InsightsPanel />
            <PayrollPanel />
            <SwitchPanel />
            {/* Last salon page: see the other two perspectives, or finish (owner). */}
            <div className="jr-end">
              <button
                type="button"
                className="cs-alt"
                onClick={() => {
                  pick("client");
                }}
              >
                {t("views.toClient")}
              </button>
              <button
                type="button"
                className="cs-alt"
                onClick={() => {
                  pick("ai");
                }}
              >
                {t("views.toAi")}
              </button>
            </div>
          </div>
          <ChatStory
            ns="views.client"
            kind="phone"
            steps={CLIENT_STEPS}
            active={view === "client"}
            reduce={reduce}
            bg={PHOTO.customer}
            onFinish={exit}
            side={(fired, latest) => <ClientSystem fired={fired} latest={latest} />}
            strip={(latest) => <ClientStrip latest={latest} />}
            ends={[
              {
                k: "views.toAi",
                go: () => {
                  pick("ai");
                },
              },
              {
                k: "views.toSalon",
                go: () => {
                  pick("salon");
                },
              },
              { k: "views.finish", go: exit, primary: true },
            ]}
          />
          <ChatStory
            ns="views.ai"
            kind="panel"
            steps={AI_STEPS}
            active={view === "ai"}
            reduce={reduce}
            bg={PHOTO.calm169}
            onFinish={exit}
            viz={(k) => <AiViz k={k} />}
            windowImg={Asset.fromModule(screen(locale, "overview")).uri}
            ends={[
              {
                k: "views.toClient",
                go: () => {
                  pick("client");
                },
              },
              {
                k: "views.toSalon",
                go: () => {
                  pick("salon");
                },
              },
              { k: "views.finish", go: exit, primary: true },
            ]}
          />

          <nav className="jr-hud hinted" ref={hud} aria-label={t("flow.hud.label")} data-page="0">
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
                    {c.bars.map((r) => (
                      <span key={r.join("-")} className="hud-bar">
                        <span className="hud-fill" data-range={r.join(",")} />
                      </span>
                    ))}
                  </span>
                  <em className="hud-name">{t(`flow.hud.${c.k}`)}</em>
                </button>
              ))}
            </div>
            <span className="hud-sr" aria-live="polite" />
            <span className="hud-count" aria-hidden>
              {t("flow.hud.page", { n: 1, total: PAGES.length - 1 })}
            </span>
            <button
              type="button"
              className="hud-prev"
              aria-label={t("flow.hud.prev")}
              onClick={() => {
                ch.current?.prev();
              }}
            >
              {PREV}
            </button>
            <button
              type="button"
              className="hud-next"
              onClick={() => {
                ch.current?.next();
              }}
            >
              <span className="hud-lbls">
                {LABELS.map((k) => (
                  <span key={k} data-k={k} aria-hidden className={k === "start" ? "on" : undefined}>
                    {t(`flow.hud.${k}`)}
                  </span>
                ))}
              </span>
              <i aria-hidden>{NEXT_ARROW}</i>
            </button>
            <span className="hud-hint">
              <span className="h1">
                <span className="k">{t("flow.hud.hintKeys")}</span>
                <span className="tc">{t("flow.hud.hintTouch")}</span>
              </span>
            </span>
          </nav>
        </div>
      </div>
    </>
  );
}
