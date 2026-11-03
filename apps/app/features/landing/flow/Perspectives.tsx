import { useTranslation } from "react-i18next";

import { formatVND } from "@gugu/localization";

import { useLocale } from "@/services/i18n/useLocale";

import type { ChatStep } from "./ChatStory";

export type View = "salon" | "client" | "ai";
export const VIEWS: readonly View[] = ["salon", "client", "ai"];

/**
 * The client's side (owner, 2026-11-04): booking inside the salon's own Zalo OA (rule-based bot that
 * speaks as the salon, X24), real free slots, phone share, confirmation, 24 h / 2 h reminders with
 * "I'll come / change / cancel", hand-off to staff. Customers have no account and pay at the salon.
 * `fx` drive the live GuGu Studio panel next to the phone.
 */
export const CLIENT_STEPS: readonly ChatStep[] = [
  {
    k: "s1",
    msgs: [
      { from: "me", k: "m1" },
      { from: "them", k: "m2", buttons: ["b1", "b2", "b3", "b4"], time: "t1", fx: "inbox" },
    ],
  },
  {
    k: "s2",
    msgs: [
      { from: "me", k: "m3" },
      { from: "them", k: "m4", buttons: ["b5", "b6", "b7"] },
      { from: "me", k: "m5" },
      { from: "them", k: "m6", buttons: ["b8", "b9", "b10"], time: "t2", fx: "slots" },
    ],
  },
  {
    k: "s3",
    msgs: [
      { from: "me", k: "m7", fx: "hold" },
      { from: "them", k: "m8", buttons: ["b11"] },
      { from: "me", k: "m9" },
      { from: "them", k: "m10", card: true, time: "t3", fx: "booked" },
    ],
  },
  {
    k: "s4",
    msgs: [
      { from: "sys", k: "m11", fx: "remSent" },
      { from: "them", k: "m12", buttons: ["b12", "b13", "b14"], time: "t4" },
      { from: "me", k: "m13", fx: "confirmed" },
      { from: "them", k: "m14", time: "t5" },
    ],
  },
  {
    k: "s5",
    msgs: [
      { from: "me", k: "m15", fx: "handoff" },
      { from: "them", k: "m16" },
      { from: "staff", k: "m17", time: "t6", fx: "taken" },
    ],
  },
];

/**
 * The owner's assistant "Gu" (Pro): only what the read tools really do: bookings count, utilization,
 * revenue summary, month profit as salon totals. Answers carry a visual (`viz`) and a source chip, as in
 * the CRM panel. Illustrative numbers; nothing is sent to a model from the landing page.
 */
export const AI_STEPS: readonly ChatStep[] = [
  {
    k: "s1",
    msgs: [
      { from: "me", k: "m1" },
      { from: "them", k: "m2", source: "src1", viz: "kpis" },
    ],
  },
  {
    k: "s2",
    msgs: [
      { from: "me", k: "m3" },
      { from: "them", k: "m4", source: "src2", viz: "util" },
    ],
  },
  {
    k: "s3",
    msgs: [
      { from: "me", k: "m5" },
      { from: "them", k: "m6", source: "src3", viz: "rev" },
    ],
  },
  {
    k: "s4",
    msgs: [
      { from: "me", k: "m7" },
      { from: "them", k: "m8", source: "src4", viz: "profit" },
    ],
  },
];

/** Illustrative figures behind the assistant's answers (formatted per locale). */
const WEEK = [9, 8, 10, 7, 12, 18, 0] as const;
const DAYS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"] as const;
const UTIL = [
  { k: "p1", v: 0.92 },
  { k: "p2", v: 0.78 },
  { k: "p3", v: 0.61 },
] as const;
const REV = { estimated: 64_150_000, recorded: 10_904_000 } as const;
const PROFIT = [
  { k: "w1", v: 64_390_000 },
  { k: "w2", v: -9_905_000 },
  { k: "w3", v: -26_952_000 },
  { k: "w4", v: -15_133_000 },
] as const;
const NET = 12_400_000;
const KPI_KEYS = ["k1", "k2", "k3", "k4"] as const;
/** Waterfall bars (start + width as a share of revenue), computed once. */
const FALL = PROFIT.reduce<{ k: string; v: number; start: number; run: number }[]>((acc, s) => {
  const run = acc.length ? (acc[acc.length - 1]?.run ?? 0) : 0;
  const start = s.v > 0 ? 0 : run + s.v;
  acc.push({ k: s.k, v: s.v, start, run: run + s.v });
  return acc;
}, []);

export function AiViz({ k }: { k: string }) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as (key: string, o?: Record<string, unknown>) => string;
  const locale = useLocale();
  const vnd = (v: number) => formatVND(v, locale);
  const pct = (v: number) => `${String(Math.round(v * 100))}%`;
  if (k === "kpis") {
    const max = Math.max(...WEEK);
    return (
      <div className="av-kpis">
        <div className="av-tiles">
          {KPI_KEYS.map((x) => (
            <div key={x} className={`av-tile ${x}`}>
              <b>{t(`views.ai.viz.${x}n`)}</b>
              <small>{t(`views.ai.viz.${x}`)}</small>
            </div>
          ))}
        </div>
        <div className="av-week" aria-hidden>
          {WEEK.map((v, i) => (
            <span key={DAYS[i]} className={v === max ? "top" : undefined}>
              <i style={{ height: `${String(Math.max(6, (v / max) * 100))}%` }} />
              <em>{t(`views.ai.viz.${DAYS[i] ?? "d1"}`)}</em>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (k === "util") {
    return (
      <div className="av-util">
        {UTIL.map((u) => (
          <div key={u.k} className="av-row">
            <span>{t(`views.ai.viz.${u.k}`)}</span>
            <span className="av-bar">
              <i style={{ width: pct(u.v) }} />
            </span>
            <b>{pct(u.v)}</b>
          </div>
        ))}
      </div>
    );
  }
  if (k === "rev") {
    return (
      <div className="av-rev">
        <div>
          <small>{t("views.ai.viz.r1")}</small>
          <b>{vnd(REV.estimated)}</b>
          <em>{t("views.ai.viz.r1tag")}</em>
        </div>
        <div>
          <small>{t("views.ai.viz.r2")}</small>
          <b>{vnd(REV.recorded)}</b>
          <em className="rec">{t("views.ai.viz.r2tag")}</em>
        </div>
      </div>
    );
  }
  const top = PROFIT[0].v;
  return (
    <div className="av-fall">
      {FALL.map((s) => (
        <div key={s.k} className={`av-row ${s.v < 0 ? "neg" : "pos"}`}>
          <span>{t(`views.ai.viz.${s.k}`)}</span>
          <span className="av-bar">
            <i
              style={{
                left: `${String((s.start / top) * 100)}%`,
                width: `${String((Math.abs(s.v) / top) * 100)}%`,
              }}
            />
          </span>
          <b>{vnd(s.v)}</b>
        </div>
      ))}
      <div className="av-row net">
        <span>{t("views.ai.viz.w5")}</span>
        <span className="av-bar">
          <i style={{ left: "0%", width: `${String((NET / top) * 100)}%` }} />
        </span>
        <b>{vnd(NET)}</b>
      </div>
    </div>
  );
}

const CHECK = "✓";
const SLOT_ROWS = ["13", "14", "15", "16"] as const;
const FX_CONFIRMED = "confirmed";
const FX_REMSENT = "remSent";
const FX_TAKEN = "taken";
const FX_BOOKED = "booked";
const FX_HOLD = "hold";

/**
 * The salon's side, live, next to the client's phone ("dopamine", owner): each chat step makes GuGu
 * Studio react: inbox ping, the slot held then booked on the calendar, the reminder sent, the client's
 * "I'll come" flipping the status, the hand-off landing in the staff inbox.
 */
export function ClientSystem({
  fired,
  latest,
}: {
  fired: ReadonlySet<string>;
  latest: string | null;
}) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as (k: string) => string;
  const on = (k: string) => (fired.has(k) ? " on" : "");
  const has = (k: string) => fired.has(k);
  const confirmed = has(FX_CONFIRMED);
  const remSent = has(FX_REMSENT);
  const taken = has(FX_TAKEN);
  const slot = has(FX_BOOKED) ? "booked" : has(FX_HOLD) ? "hold" : "";
  return (
    <div className="sy" aria-label={t("views.client.sys.title")}>
      <div className="sy-head">
        <b>{t("views.client.sys.title")}</b>
        <span className="sy-live">{t("views.client.sys.live")}</span>
      </div>
      <div className={`sy-card sy-inbox${on("inbox")}`}>
        <i className="sy-dot zalo" aria-hidden />
        <div>
          <b>{t("views.client.sys.inbox")}</b>
          <small>{t("views.client.sys.inboxSub")}</small>
        </div>
      </div>
      <div className={`sy-cal${on("slots")}`}>
        <div className="sy-calhead">
          <span>{t("views.client.sys.day")}</span>
          <span>{t("views.client.sys.staff1")}</span>
          <span>{t("views.client.sys.staff2")}</span>
        </div>
        {SLOT_ROWS.map((r) => (
          <div key={r} className="sy-calrow">
            <span>{`${r}:00`}</span>
            <span className="sy-cell">
              {r === "14" ? (
                <i className={`sy-slot ${slot}${confirmed ? " sure" : ""}`}>
                  <b>{t("views.client.sys.slot")}</b>
                  <em className="sy-chip">
                    {confirmed
                      ? t("views.client.sys.coming")
                      : slot === "booked"
                        ? t("views.client.sys.booked")
                        : t("views.client.sys.holding")}
                  </em>
                </i>
              ) : null}
            </span>
            <span className="sy-cell">
              {r === "15" ? <i className="sy-slot other">{t("views.client.sys.other")}</i> : null}
            </span>
          </div>
        ))}
      </div>
      <div className={`sy-card sy-rem${on("booked")}${on("remSent")}`}>
        <i className="sy-dot" aria-hidden>
          {remSent ? CHECK : ""}
        </i>
        <div>
          <b>{t("views.client.sys.rem")}</b>
          <small>
            {remSent ? t("views.client.sys.remSent") : t("views.client.sys.remPlanned")}
          </small>
        </div>
      </div>
      <div className={`sy-card sy-hand${on("handoff")}${on("taken")}`}>
        <i className="sy-dot alert" aria-hidden />
        <div>
          <b>{t("views.client.sys.hand")}</b>
          <small>{taken ? t("views.client.sys.handTaken") : t("views.client.sys.handSub")}</small>
        </div>
      </div>
      {latest ? (
        <div className="sy-toast" key={latest}>
          {t(`views.client.fx.${latest}`)}
        </div>
      ) : null}
    </div>
  );
}

/** Phones: the latest system reaction as one animated line under the phone. */
export function ClientStrip({ latest }: { latest: string | null }) {
  const { t: typed } = useTranslation("landing");
  const t = typed as unknown as (k: string) => string;
  return (
    <span className="sy-stripin" key={latest ?? "none"}>
      <i aria-hidden />
      {latest ? t(`views.client.fx.${latest}`) : t("views.client.sys.waiting")}
    </span>
  );
}

/** Perspective tabs at the top of the story: the salon owner's walk, the client's chat, the AI. */
export function ViewTabs({ view, onPick }: { view: View; onPick: (v: View) => void }) {
  const { t } = useTranslation("landing");
  return (
    <div className="jr-views" role="tablist" aria-label={t("views.label")}>
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          className={view === v ? "on" : undefined}
          onClick={() => {
            onPick(v);
          }}
        >
          {t(`views.tab.${v}`)}
        </button>
      ))}
    </div>
  );
}
