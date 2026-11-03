import { useTranslation } from "react-i18next";

import type { ChatStep } from "./ChatStory";

export type View = "salon" | "client" | "ai";
export const VIEWS: readonly View[] = ["salon", "client", "ai"];

/**
 * The client's side (owner, 2026-11-04): booking inside the salon's own Zalo OA (rule-based bot that
 * speaks as the salon, X24), real free slots, phone share, confirmation, 24 h / 2 h reminders with
 * "I'll come / change / cancel", hand-off to staff. Customers have no account and pay at the salon.
 */
export const CLIENT_STEPS: readonly ChatStep[] = [
  {
    k: "s1",
    msgs: [
      { from: "me", k: "m1" },
      { from: "them", k: "m2", buttons: ["b1", "b2", "b3", "b4"] },
    ],
  },
  {
    k: "s2",
    msgs: [
      { from: "me", k: "m3" },
      { from: "them", k: "m4", buttons: ["b5", "b6", "b7"] },
      { from: "me", k: "m5" },
      { from: "them", k: "m6", buttons: ["b8", "b9", "b10"] },
    ],
  },
  {
    k: "s3",
    msgs: [
      { from: "me", k: "m7" },
      { from: "them", k: "m8", buttons: ["b11"] },
      { from: "me", k: "m9" },
      { from: "them", k: "m10", card: true },
    ],
  },
  {
    k: "s4",
    msgs: [
      { from: "sys", k: "m11" },
      { from: "them", k: "m12", buttons: ["b12", "b13", "b14"] },
      { from: "me", k: "m13" },
      { from: "them", k: "m14" },
    ],
  },
  {
    k: "s5",
    msgs: [
      { from: "me", k: "m15" },
      { from: "them", k: "m16" },
      { from: "staff", k: "m17" },
    ],
  },
];

/**
 * The owner's AI assistant (Pro): only what the read tools really do (bookings count, utilization,
 * revenue summary, month profit as salon totals) plus the PII firewall that refuses to send a client's
 * phone number. Illustrative numbers; nothing is sent to a model from the landing page.
 */
export const AI_STEPS: readonly ChatStep[] = [
  {
    k: "s1",
    msgs: [
      { from: "me", k: "m1" },
      { from: "them", k: "m2", source: "src1" },
    ],
  },
  {
    k: "s2",
    msgs: [
      { from: "me", k: "m3" },
      { from: "them", k: "m4", source: "src2" },
    ],
  },
  {
    k: "s3",
    msgs: [
      { from: "me", k: "m5" },
      { from: "them", k: "m6", source: "src3" },
    ],
  },
  {
    k: "s4",
    msgs: [
      { from: "me", k: "m7" },
      { from: "them", k: "m8", source: "src4" },
    ],
  },
  {
    k: "s5",
    msgs: [
      { from: "me", k: "m9" },
      { from: "sys", k: "m10" },
    ],
  },
];

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
