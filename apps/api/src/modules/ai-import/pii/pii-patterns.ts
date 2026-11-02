/**
 * Text patterns the AI import gate redacts from OCR output before an image reaches the LLM
 * (topic 08 §4.5): phone numbers, emails, links, social handles and "honorific + Name" labels.
 * Recall beats precision here — a blacked-out price is fixed by the owner in the review table,
 * a leaked phone number is not fixable.
 */

export type PiiKind = "phone" | "email" | "url" | "handle" | "name";

export interface PiiMatch {
  kind: PiiKind;
  /** Character offsets in the scanned string, `end` exclusive. */
  start: number;
  end: number;
}

// Vietnamese mobile/landline: 0 or +84/84, then 8–10 more digits, with spaces, dots or dashes.
const PHONE = /(?<![\d])(?:\+?84|0)(?:[\s.\-()]*\d){8,10}(?![\d])/g;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const URL =
  /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|vn|net|org|me|io|co|link|shop|store|page|site|online|info|biz)(?:\.vn)?(?:\/\S*)?/giu;
const HANDLE = /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}._]{2,}/gu;

/**
 * Words that introduce a person's name on Vietnamese price lists ("anh Tuấn", "KTV Lan",
 * "Stylist Minh"). Lowercase, without the following name.
 */
export const NAME_PREFIXES = [
  "anh",
  "chị",
  "chi",
  "em",
  "cô",
  "chú",
  "bác",
  "thầy",
  "ông",
  "bà",
  "ktv",
  "kỹ thuật viên",
  "stylist",
  "thợ",
  "master",
  "artist",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
  "miss",
] as const;

const UPPER_START = /^\p{Lu}/u;

/** All contact-detail matches (phone, email, url, handle) in one string. */
export function findContactDetails(text: string): PiiMatch[] {
  const out: PiiMatch[] = [];
  const scan = (re: RegExp, kind: PiiKind) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      out.push({ kind, start: m.index, end: m.index + m[0].length });
    }
  };
  scan(EMAIL, "email");
  scan(PHONE, "phone");
  scan(URL, "url");
  scan(HANDLE, "handle");
  return out;
}

/**
 * Indices of words that form "prefix + Capitalised name" (1–3 name words). `words` are the OCR words
 * of one line in reading order.
 */
export function findNameWords(words: readonly string[]): number[] {
  const hits = new Set<number>();
  const norm = words.map((w) => w.toLowerCase().replace(/[:,;]+$/u, ""));
  const at = (k: number) => norm[k] ?? "";
  for (let i = 0; i < words.length; i++) {
    const two = i + 1 < words.length ? `${at(i)} ${at(i + 1)}` : "";
    const three = i + 2 < words.length ? `${two} ${at(i + 2)}` : "";
    const prefixLen = (NAME_PREFIXES as readonly string[]).includes(three)
      ? 3
      : (NAME_PREFIXES as readonly string[]).includes(two)
        ? 2
        : (NAME_PREFIXES as readonly string[]).includes(norm[i] ?? "")
          ? 1
          : 0;
    if (prefixLen === 0) continue;
    let j = i + prefixLen;
    let names = 0;
    while (j < words.length && names < 3 && UPPER_START.test(words[j] ?? "")) {
      hits.add(j);
      j++;
      names++;
    }
    if (names > 0) for (let k = i; k < i + prefixLen; k++) hits.add(k);
  }
  return [...hits].sort((a, b) => a - b);
}

/** True when the text still contains a contact detail (used to verify a redacted image). */
export function containsContactDetails(text: string): boolean {
  return findContactDetails(text).length > 0;
}
