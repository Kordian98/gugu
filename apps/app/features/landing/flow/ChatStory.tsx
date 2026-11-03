import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * A stepped, scripted chat (web) for the extra perspectives of the story: the client's Zalo chat with
 * the salon (phone) and the owner's assistant "Gu" (panel over the real CRM screen). Left: the benefit
 * of the current step; middle: the device; optionally right: a live system panel (`side`) reacting to
 * effects (`fx`) attached to messages. Steps move only by Next/Prev, ← / → (while shown) and horizontal
 * swipes. New messages type in one by one; reduced motion shows them at once. Illustrative copy only;
 * nothing is sent anywhere.
 */
export type ChatMsg = {
  /** me = the person on this device, them = the other side (salon bot / Gu), staff, sys = note */
  from: "me" | "them" | "staff" | "sys";
  k: string;
  /** i18n keys of quick-reply buttons under the message */
  buttons?: readonly string[];
  /** render as a confirmation card */
  card?: boolean;
  /** source chip under an assistant answer */
  source?: string;
  /** small timestamp under the bubble (i18n key) */
  time?: string;
  /** a visual rendered inside the answer (assistant) */
  viz?: string;
  /** an effect the side panel reacts to once this message is shown */
  fx?: string;
};
export type ChatStep = { k: string; msgs: readonly ChatMsg[] };

const ARROW_R = "→";
const ARROW_L = "←";
const DOTS = ["d1", "d2", "d3"] as const;
const BACK = "‹";
const SEND = "↑";
const OA = "OA";

export function ChatStory({
  ns,
  kind,
  steps,
  active,
  reduce,
  bg,
  onFinish,
  ends,
  side,
  strip,
  viz,
  windowImg,
}: {
  /** i18n prefix, e.g. "views.client" */
  ns: string;
  kind: "phone" | "panel";
  steps: readonly ChatStep[];
  active: boolean;
  reduce: boolean;
  bg: string;
  onFinish: () => void;
  /** buttons on the last step: label key + action */
  ends: readonly { k: string; go: () => void; primary?: boolean }[];
  /** live system panel next to the device (desktop), from the effects fired so far */
  side?: (fired: ReadonlySet<string>, latest: string | null) => ReactNode;
  /** compact one-line version of `side` under the device (phones) */
  strip?: (latest: string | null) => ReactNode;
  /** renders a visual inside an answer */
  viz?: (k: string) => ReactNode;
  /** the app screen behind the assistant panel */
  windowImg?: string;
}) {
  const { t: typed } = useTranslation("landing");
  // Keys are built from the script (`${ns}.m3`), so they are plain strings here.
  const t = typed as unknown as (k: string, o?: Record<string, unknown>) => string;
  const [step, setStep] = useState(0);
  const [count, setShown] = useState(0);
  /** The step whose copy is on screen; it follows `step` through one out → swap → in transition. */
  const [copyStep, setCopyStep] = useState(0);
  const copy = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;
  const upTo = (i: number) => steps.slice(0, i + 1).reduce((n, s) => n + s.msgs.length, 0);
  const all = steps.flatMap((s) => s.msgs);

  // Reveal the current step's messages one by one (typing dots before the other side's messages).
  const target = upTo(step);
  const shown = reduce ? target : Math.min(count, target);
  const nextMsg = all[shown];
  const typing =
    active &&
    !reduce &&
    shown < target &&
    nextMsg !== undefined &&
    nextMsg.from !== "me" &&
    nextMsg.from !== "sys";
  useEffect(() => {
    if (!active || reduce || shown >= target) return;
    const id = window.setTimeout(
      () => {
        setShown(shown + 1);
      },
      typing ? 1000 : 520,
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [active, reduce, shown, target, typing]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [shown, typing, reduce]);

  const fired = new Set(
    all
      .slice(0, shown)
      .map((m) => m.fx)
      .filter((x): x is string => Boolean(x)),
  );
  const latest = [...all.slice(0, shown)].reverse().find((m) => m.fx)?.fx ?? null;

  const go = (d: 1 | -1) => {
    if (d > 0) {
      // A press while messages are still typing completes the step first (one press, one step).
      if (shown < target) {
        setShown(target);
        return;
      }
      if (step >= last) {
        onFinish();
        return;
      }
      setShown(target);
      setStep(step + 1);
    } else if (step > 0) {
      setStep(step - 1);
      setShown(upTo(step - 1));
    }
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  // ← / → while this perspective is shown; one horizontal swipe = one step.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? "") || e.altKey || e.metaKey || e.ctrlKey)
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goRef.current(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goRef.current(-1);
      }
    };
    const r = root.current;
    let sx = 0;
    let sy = 0;
    let swiped = false;
    const ts = (e: TouchEvent) => {
      sx = e.touches[0]?.clientX ?? 0;
      sy = e.touches[0]?.clientY ?? 0;
      swiped = false;
    };
    const tm = (e: TouchEvent) => {
      const dx = (e.touches[0]?.clientX ?? sx) - sx;
      const dy = (e.touches[0]?.clientY ?? sy) - sy;
      if (!swiped && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
        swiped = true;
        goRef.current(dx < 0 ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    r?.addEventListener("touchstart", ts, { passive: true });
    r?.addEventListener("touchmove", tm, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      r?.removeEventListener("touchstart", ts);
      r?.removeEventListener("touchmove", tm);
    };
  }, [active]);

  // Step copy, two clear phases (owner): OUT (number → title → body, 30 ms apart, 220 ms: up 16 px,
  // fade, slight blur), a 70 ms beat where only the progress bar moves (it follows `copyStep`), then IN
  // (number, title +60 ms, body +120 ms, 320 ms: from 16 px below, ease-out, no overshoot). A click while
  // it runs jumps straight to the newest step's final state. Height is reserved by invisible ghosts of
  // every step's copy, so nothing reflows. Reduced motion: a 150 ms crossfade.
  const running = useRef(false);
  const pendingIn = useRef(false);
  const shownRef = useRef(copyStep);
  useLayoutEffect(() => {
    shownRef.current = copyStep;
  }, [copyStep]);
  const parts = () => Array.from(copy.current?.children ?? []) as HTMLElement[];
  const stopAll = () => {
    parts().forEach((el) => {
      el.getAnimations().forEach((an) => {
        an.cancel();
      });
    });
    copy.current?.getAnimations().forEach((an) => {
      an.cancel();
    });
  };
  useEffect(() => {
    if (step === shownRef.current) return;
    const el = copy.current;
    if (running.current || !el || typeof el.animate !== "function") {
      // quick second click (or no animation support): straight to the newest step
      stopAll();
      running.current = false;
      pendingIn.current = false;
      const id = window.setTimeout(() => {
        setCopyStep(step);
      }, 0);
      return () => {
        window.clearTimeout(id);
      };
    }
    running.current = true;
    let alive = true;
    let beat = 0;
    if (reduce) {
      pendingIn.current = true;
      beat = window.setTimeout(() => {
        if (alive) setCopyStep(step);
      }, 0);
      return () => {
        alive = false;
        window.clearTimeout(beat);
      };
    }
    const outs = parts().map((part, i) =>
      part.animate(
        [
          { opacity: 1, transform: "none", filter: "blur(0)" },
          { opacity: 0, transform: "translateY(-16px)", filter: "blur(3px)" },
        ],
        { duration: 220, delay: i * 30, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
      ),
    );
    void Promise.all(outs.map((an) => an.finished))
      .then(() => {
        if (!alive) return;
        beat = window.setTimeout(() => {
          if (!alive) return;
          pendingIn.current = true;
          setCopyStep(step);
        }, 70);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      window.clearTimeout(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reduce]);
  useLayoutEffect(() => {
    if (!pendingIn.current) return;
    pendingIn.current = false;
    stopAll();
    const el = copy.current;
    if (!el) {
      running.current = false;
      return;
    }
    if (reduce) {
      const an = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "linear" });
      void an.finished.then(() => {
        running.current = false;
      });
      return;
    }
    const ins = parts().map((part, i) =>
      part.animate(
        [
          { opacity: 0, transform: "translateY(16px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 320, delay: i * 60, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" },
      ),
    );
    void Promise.all(ins.map((an) => an.finished))
      .then(() => {
        running.current = false;
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyStep]);
  const shownCopy = steps[copyStep];
  const messages = (
    <div className="cs-log" ref={log} aria-live="polite">
      {kind === "phone" ? <div className="cs-day">{t(`${ns}.day`)}</div> : null}
      {all.slice(0, shown).map((m, i) => (
        <div
          key={`${m.k}-${String(i)}`}
          className={`cs-msg ${m.from}${m.card ? " card" : ""}${m.viz ? " has-viz" : ""}`}
        >
          {kind === "panel" && m.from === "them" ? (
            <span className="cs-gu" aria-hidden>
              {t(`${ns}.avatar`)}
            </span>
          ) : null}
          <div className="cs-col">
            <div className="cs-bubble">
              {t(`${ns}.${m.k}`)}
              {m.viz && viz ? <div className="cs-viz">{viz(m.viz)}</div> : null}
            </div>
            {m.source ? (
              <span className="cs-src">
                <i aria-hidden />
                {t(`${ns}.${m.source}`)}
              </span>
            ) : null}
            {m.buttons ? (
              <div className="cs-btns" aria-hidden>
                {m.buttons.map((b) => (
                  <span key={b}>{t(`${ns}.${b}`)}</span>
                ))}
              </div>
            ) : null}
            {m.time ? <span className="cs-time">{t(`${ns}.${m.time}`)}</span> : null}
          </div>
        </div>
      ))}
      {typing ? (
        <div className="cs-msg them">
          {kind === "panel" ? (
            <span className="cs-gu" aria-hidden>
              {t(`${ns}.avatar`)}
            </span>
          ) : null}
          <div className="cs-col">
            <div className="cs-bubble cs-typing" aria-hidden>
              {DOTS.map((d) => (
                <i key={d} />
              ))}
              {kind === "panel" ? <span>{t(`${ns}.thinking`)}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={`cs cs-${kind}${side ? " has-side" : ""}`} ref={root} inert={!active}>
      <img className="cs-bg" src={bg} alt="" decoding="async" loading="lazy" />
      <div className="cs-veil" />
      <div className="cs-copy">
        <div className="fl-eye">{t(`${ns}.eyebrow`)}</div>
        <h2 className="fl-h">{t(`${ns}.title`)}</h2>
        <div className="cs-step">
          <span className="cs-stepbar" aria-hidden>
            <i style={{ width: `${String(((copyStep + 1) / steps.length) * 100)}%` }} />
          </span>
          <div className="cs-stepcopy">
            {/* ghosts reserve the tallest step's height */}
            {steps.map((g) => (
              <div key={g.k} className="cs-ghost" aria-hidden>
                <span className="cs-stepn">00</span>
                <b>{t(`${ns}.${g.k}.h`)}</b>
                <p>{t(`${ns}.${g.k}.b`)}</p>
              </div>
            ))}
            <div className="cs-live" ref={copy} aria-live="polite">
              <span className="cs-stepn" aria-hidden>
                {String(copyStep + 1).padStart(2, "0")}
              </span>
              <b>{t(`${ns}.${shownCopy?.k ?? "s1"}.h`)}</b>
              <p>{t(`${ns}.${shownCopy?.k ?? "s1"}.b`)}</p>
            </div>
          </div>
        </div>
        <p className="cs-note">{t(`${ns}.note`)}</p>
      </div>

      {kind === "phone" ? (
        <div className="cs-devicecol">
          <div className="cs-phoneframe">
            <span className="cs-island" aria-hidden />
            <div className="cs-screen">
              <div className="cs-status" aria-hidden>
                <b>{t(`${ns}.clock`)}</b>
                <span className="cs-sig">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="cs-top">
                <span className="cs-back" aria-hidden>
                  {BACK}
                </span>
                <i className="cs-ava" aria-hidden>
                  {t(`${ns}.avatar`)}
                  <em>{OA}</em>
                </i>
                <div className="cs-who">
                  <b>{t(`${ns}.who`)}</b>
                  <small>{t(`${ns}.whoSub`)}</small>
                </div>
              </div>
              {messages}
              <div className="cs-input" aria-hidden>
                <span className="cs-field">{t(`${ns}.input`)}</span>
                <span className="cs-send">{SEND}</span>
              </div>
            </div>
          </div>
          {strip ? <div className="cs-strip">{strip(latest)}</div> : null}
        </div>
      ) : (
        <div className="cs-window">
          {windowImg ? <img className="cs-app" src={windowImg} alt="" decoding="async" /> : null}
          <div className="cs-assist">
            <div className="cs-top">
              <i className="cs-ava" aria-hidden>
                {t(`${ns}.avatar`)}
              </i>
              <div className="cs-who">
                <b>
                  {t(`${ns}.who`)}
                  <em className="cs-plan">{t(`${ns}.plan`)}</em>
                </b>
                <small>{t(`${ns}.whoSub`)}</small>
              </div>
            </div>
            {messages}
            <div className="cs-input" aria-hidden>
              <span className="cs-field">{t(`${ns}.input`)}</span>
              <span className="cs-send">{SEND}</span>
            </div>
            <p className="cs-privacy">{t(`${ns}.privacy`)}</p>
          </div>
        </div>
      )}

      {side ? <div className="cs-side">{side(fired, latest)}</div> : null}

      <nav className="cs-nav" aria-label={t(`${ns}.title`)}>
        <span className="cs-bars" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.k} className={i <= step ? "on" : undefined} />
          ))}
        </span>
        <span className="cs-count" aria-hidden>
          {t("flow.hud.page", { n: step + 1, total: steps.length })}
        </span>
        <button
          type="button"
          className="hud-prev"
          aria-label={t("flow.hud.prev")}
          disabled={step === 0}
          onClick={() => {
            go(-1);
          }}
        >
          {ARROW_L}
        </button>
        {step < last || shown < target ? (
          <button
            type="button"
            className="hud-next"
            onClick={() => {
              go(1);
            }}
          >
            {t("flow.hud.next")}
            <i aria-hidden>{ARROW_R}</i>
          </button>
        ) : (
          ends.map((e) => (
            <button
              key={e.k}
              type="button"
              className={e.primary ? "hud-next" : "cs-alt"}
              onClick={e.go}
            >
              {t(e.k)}
            </button>
          ))
        )}
      </nav>
    </div>
  );
}
