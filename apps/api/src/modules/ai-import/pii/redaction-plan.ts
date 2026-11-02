import { findContactDetails, findNameWords, type PiiKind } from "./pii-patterns";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  bbox: Box;
}

/** OCR output: words grouped by line, in reading order. */
export type OcrLines = readonly (readonly OcrWord[])[];

export interface Redaction {
  kind: PiiKind;
  box: Box;
}

/**
 * Maps OCR words to the boxes that must be blacked out. Each line is rebuilt as "w1 w2 w3" with
 * known word offsets, so a phone number OCR'd as "0912" "345" "678" still matches as one number and
 * every overlapping word is redacted.
 */
export function planRedactions(lines: OcrLines): Redaction[] {
  const out: Redaction[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    const offsets: { start: number; end: number }[] = [];
    let text = "";
    for (const w of line) {
      if (text) text += " ";
      offsets.push({ start: text.length, end: text.length + w.text.length });
      text += w.text;
    }
    const kinds = new Map<number, PiiKind>();
    for (const m of findContactDetails(text)) {
      offsets.forEach((o, i) => {
        if (o.start < m.end && m.start < o.end && !kinds.has(i)) kinds.set(i, m.kind);
      });
    }
    for (const i of findNameWords(line.map((w) => w.text))) {
      if (!kinds.has(i)) kinds.set(i, "name");
    }
    for (const [i, kind] of kinds) {
      const word = line[i];
      if (word) out.push({ kind, box: word.bbox });
    }
  }
  return out;
}

/** Grows a box by `pad` pixels, clamped to the image. */
export function padBox(b: Box, pad: number, width: number, height: number): Box {
  return {
    x0: Math.max(0, Math.floor(b.x0 - pad)),
    y0: Math.max(0, Math.floor(b.y0 - pad)),
    x1: Math.min(width, Math.ceil(b.x1 + pad)),
    y1: Math.min(height, Math.ceil(b.y1 + pad)),
  };
}
