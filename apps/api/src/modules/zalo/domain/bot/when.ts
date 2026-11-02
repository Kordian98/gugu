/** Parts of the day used to group free times (salon-local hour). */
export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** morning < 12:00 ≤ afternoon < 17:00 ≤ evening. */
export function dayPartOf(minuteOfDay: number): DayPart {
  if (minuteOfDay < 12 * 60) return "morning";
  if (minuteOfDay < 17 * 60) return "afternoon";
  return "evening";
}

export interface ParsedWhen {
  /** YYYY-MM-DD (salon calendar). */
  date: string | null;
  /** Minutes after midnight. */
  minute: number | null;
  part: DayPart | null;
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

const WEEKDAYS: readonly [RegExp, number][] = [
  [/\b(chu nhat|cn|sun(day)?)\b/, 0],
  [/\b(thu (2|hai)|t2|mon(day)?)\b/, 1],
  [/\b(thu (3|ba)|t3|tue(sday)?)\b/, 2],
  [/\b(thu (4|tu)|t4|wed(nesday)?)\b/, 3],
  [/\b(thu (5|nam)|t5|thurs(day)?)\b/, 4],
  [/\b(thu (6|sau)|t6|fri(day)?)\b/, 5],
  [/\b(thu (7|bay)|t7|sat(urday)?)\b/, 6],
];

/**
 * Understands short typed times like "mai 15h", "thứ 7 sáng", "hôm nay 9h30", "15/11 14:00",
 * "3h chiều", "tomorrow 3pm". Returns null when the text names no day, time or part of day.
 * Pure; `today` is the salon-local date.
 */
export function parseWhen(text: string, today: string): ParsedWhen | null {
  const n = ` ${normalize(text)} `;
  let date: string | null = null;
  if (/\b(hom nay|today|nay)\b/.test(n)) date = today;
  if (/\b(ngay mai|mai|tomorrow)\b/.test(n)) date = addDays(today, 1);
  if (/\b(ngay mot|mot|ngay kia|kia)\b/.test(n)) date = addDays(today, 2);
  for (const [re, wd] of WEEKDAYS) {
    if (re.test(n)) {
      const diff = (wd - weekday(today) + 7) % 7;
      date = addDays(today, diff);
    }
  }
  const dm = /\b(\d{1,2})[/-](\d{1,2})\b/.exec(n);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = Number(today.slice(0, 4));
      let candidate = `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (candidate < today) candidate = `${String(year + 1)}${candidate.slice(4)}`;
      date = candidate;
    }
  }

  let part: DayPart | null = null;
  if (/\b(sang|morning)\b/.test(n)) part = "morning";
  if (/\b(trua|chieu|afternoon)\b/.test(n)) part = "afternoon";
  if (/\b(toi|evening|night)\b/.test(n)) part = "evening";

  let minute: number | null = null;
  const tm =
    /\b(\d{1,2})\s*(?:h|g|gio|:)\s*(\d{2})?\b/.exec(n) ?? /\b(\d{1,2})\s*(am|pm)\b/.exec(n);
  if (tm && !(dm && tm.index === dm.index)) {
    let h = Number(tm[1]);
    const m = tm[2] && /^\d{2}$/.test(tm[2]) ? Number(tm[2]) : 0;
    const pm = tm[2] === "pm" || ((part === "afternoon" || part === "evening") && h < 12);
    if (pm && h < 12) h += 12;
    if (tm[2] === "am" && h === 12) h = 0;
    if (h <= 23 && m <= 59) minute = h * 60 + m;
  }
  if (minute !== null && part === null) part = dayPartOf(minute);
  if (date === null && minute === null && part === null) return null;
  return { date, minute, part };
}

/** Lower case, no diacritics; keeps digits, ":", "/" and "-" for times and dates. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:/\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
