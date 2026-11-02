import { findContactDetails } from "../../ai-import/ai-import.facade";
import { findNames } from "./names";
import type { TokenVault } from "./token-vault";

/** People and labels the firewall knows by name in one salon (built per turn, never sent). */
export interface Directory {
  staff: readonly { id: string; name: string }[];
  /** Customer names from booking snapshots: always redacted (customers have no token in A1). */
  customers: readonly string[];
  /** The salon's own name (household businesses are often named after a person). */
  salon: readonly string[];
}

export interface ScrubResult {
  text: string;
  changed: boolean;
}

/**
 * Input side of the PII firewall (spec 08 §4.3 step 1): staff names become tokens, customer and
 * salon names `[redacted_name]` / `[salon]`, phone numbers and emails `[redacted_phone]` /
 * `[redacted_email]`, links and handles `[redacted_link]`. Names not in the directory pass
 * (owner decision q62: accepted risk, shown in the mask preview).
 */
export async function scrubUserText(
  text: string,
  directory: Directory,
  vault: TokenVault,
): Promise<ScrubResult> {
  const src = text.normalize("NFC");
  const spans: { start: number; end: number; replacement: () => Promise<string> }[] = [];
  for (const m of findContactDetails(src)) {
    const label =
      m.kind === "phone"
        ? "[redacted_phone]"
        : m.kind === "email"
          ? "[redacted_email]"
          : "[redacted_link]";
    spans.push({ start: m.start, end: m.end, replacement: () => Promise.resolve(label) });
  }
  const staffByName = new Map(directory.staff.map((s) => [s.name, s.id]));
  const names = [...directory.staff.map((s) => s.name), ...directory.customers, ...directory.salon];
  for (const n of findNames(src, names)) {
    if (spans.some((s) => n.start < s.end && s.start < n.end)) continue;
    const staffId = staffByName.get(n.name);
    const isSalon = directory.salon.includes(n.name);
    spans.push({
      start: n.start,
      end: n.end,
      replacement: () =>
        staffId
          ? vault.tokenFor("staff", staffId)
          : Promise.resolve(isSalon ? "[salon]" : "[redacted_name]"),
    });
  }
  if (spans.length === 0) return { text: src, changed: false };
  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let at = 0;
  for (const s of spans) {
    if (s.start < at) continue;
    out += src.slice(at, s.start) + (await s.replacement());
    at = s.end;
  }
  return { text: out + src.slice(at), changed: true };
}

/** Egress check helper: true when `text` still contains a contact detail or a directory name. */
export function containsPersonalData(text: string, directory: Directory): boolean {
  if (findContactDetails(text).length > 0) return true;
  const names = [...directory.staff.map((s) => s.name), ...directory.customers, ...directory.salon];
  return findNames(text, names).length > 0;
}
