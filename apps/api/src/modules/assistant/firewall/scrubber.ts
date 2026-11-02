import { findContactDetails } from "../../ai-import/ai-import.facade";
import { findNames, type NameList } from "./names";
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
  for (const n of findNames(src, nameLists(directory))) {
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

/**
 * Egress check helper: true when **user-typed text after scrubbing** still contains a contact
 * detail or a directory name. Never run it over server-made content (context lines, tool results):
 * those are fixed vocabulary protected by the tool-result allowlist, and a customer could otherwise
 * book under a name that matches them and block the salon's assistant (security review 08-A2).
 */
export function containsPersonalData(text: string, directory: Directory): boolean {
  if (findContactDetails(text).length > 0) return true;
  return findNames(text, nameLists(directory)).length > 0;
}

function nameLists(directory: Directory): NameList[] {
  return [
    { names: directory.staff.map((s) => s.name), singleWord: "capital_or_cue" },
    { names: [...directory.customers, ...directory.salon], singleWord: "capital_and_cue" },
  ];
}
