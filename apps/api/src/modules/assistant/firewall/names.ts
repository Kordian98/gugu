/**
 * Diacritic- and case-insensitive name matching for the PII firewall. Folding is done character by
 * character so positions in the folded string equal positions in the original (NFC) string, which
 * lets the scrubber replace the exact original span.
 */
export function fold(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    const lower = (f.length === 1 ? f : ch).toLowerCase();
    // Keep a 1:1 code-unit mapping with the NFC original.
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

export interface NameSpan {
  start: number;
  end: number;
  name: string;
}

const LETTER = /[\p{L}\p{N}]/u;
const UPPER = /^\p{Lu}/u;
/** Words that announce a person ("anh Thu", "KTV Lan", "nhân viên Hà"). Folded. */
const CUES = [
  "anh",
  "chi",
  "em",
  "co",
  "chu",
  "ban",
  "ktv",
  "tho",
  "stylist",
  "nhan vien",
  "khach",
  "khach hang",
];

/**
 * Whole-word occurrences of any of `names` in `text`, longest names first, non-overlapping.
 * Names shorter than two letters are ignored. Many Vietnamese given names are ordinary words
 * ("Thu" in "doanh thu", "Xuân", "Minh"), so a **single-word** name only matches when it is written
 * with a capital letter or follows a cue word such as "anh", "chị", "KTV", "nhân viên".
 */
export function findNames(text: string, names: readonly string[]): NameSpan[] {
  const src = text.normalize("NFC");
  const hay = fold(src);
  const candidates = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  const taken: NameSpan[] = [];
  for (const name of candidates) {
    const needle = fold(name.normalize("NFC"));
    let from = 0;
    for (;;) {
      const i = hay.indexOf(needle, from);
      if (i < 0) break;
      const end = i + needle.length;
      from = i + 1;
      const before = i > 0 ? hay[i - 1] : "";
      const after = end < hay.length ? hay[end] : "";
      if ((before && LETTER.test(before)) || (after && LETTER.test(after))) continue;
      if (taken.some((t) => i < t.end && t.start < end)) continue;
      if (!name.includes(" ") && !UPPER.test(src.slice(i, i + 1)) && !hasCue(hay, i)) continue;
      taken.push({ start: i, end, name });
    }
  }
  return taken.sort((a, b) => a.start - b.start);
}

function hasCue(hay: string, index: number): boolean {
  const before = hay.slice(Math.max(0, index - 16), index).trimEnd();
  return CUES.some((cue) => before === cue || before.endsWith(` ${cue}`));
}
