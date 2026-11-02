import { ENTITY_TOKEN_RE, PII_FREE_ENUM_VALUES } from "@gugu/contracts";
import { findContactDetails } from "../../ai-import/ai-import.facade";
import { findNames, fold, type NameList } from "./names";
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
  for (const n of findNames(src, maskLists(directory))) {
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
 * Egress **block** check over user-typed text after scrubbing (security review 08-A2): true when it
 * still contains a contact detail or a directory name. Independent and stricter than masking so a
 * customer cannot disable the assistant by booking under a common word: customer/salon names that
 * are fixed vocabulary or common Vietnamese/English words are ignored here, and single-word ones
 * need a capital **and** a cue word. Never run it over server-made content (context line, tool
 * results); those are guarded by the tool-result allowlist.
 */
export function containsPersonalData(text: string, directory: Directory): boolean {
  if (findContactDetails(text).length > 0) return true;
  return findNames(text, egressLists(directory)).length > 0;
}

/** Masking: everyone capital-or-cue (over-masking is safe). */
function maskLists(directory: Directory): NameList[] {
  return [
    {
      names: [...directory.staff.map((s) => s.name), ...directory.customers, ...directory.salon],
      singleWord: "capital_or_cue",
    },
  ];
}

function egressLists(directory: Directory): NameList[] {
  const blockable = (name: string) => !isFixedVocabulary(name) && !isCommonWord(name);
  return [
    { names: directory.staff.map((s) => s.name).filter(blockable), singleWord: "capital_or_cue" },
    {
      names: [...directory.customers, ...directory.salon].filter(blockable),
      singleWord: "capital_and_cue",
    },
  ];
}

/** Words the firewall itself or the tools emit; never treated as a name by the egress block. */
const PLACEHOLDERS = [
  "redacted_name",
  "redacted_phone",
  "redacted_email",
  "redacted_link",
  "salon",
];
const FIXED = new Set(
  [...PII_FREE_ENUM_VALUES, ...PLACEHOLDERS].flatMap((v) => [fold(v), fold(v.replace(/_/g, " "))]),
);

/** Fixed vocabulary (statuses, sources, revenue kinds, periods, placeholders) or a token shape. */
export function isFixedVocabulary(name: string): boolean {
  const n = fold(name.trim());
  return ENTITY_TOKEN_RE.test(n) || FIXED.has(n) || FIXED.has(n.replace(/\s+/g, "_"));
}

/**
 * Everyday words likely in salon questions (folded). A customer named exactly like one of them is
 * still masked in the input, but never makes the egress check block a question.
 */
const COMMON_WORDS = new Set(
  [
    "lịch",
    "lịch hẹn",
    "hẹn",
    "hôm nay",
    "hôm qua",
    "ngày mai",
    "tuần",
    "tháng",
    "năm",
    "doanh",
    "doanh thu",
    "thu",
    "chi",
    "khách",
    "khách hàng",
    "nhân viên",
    "dịch vụ",
    "salon",
    "tiệm",
    "giá",
    "tiền",
    "đặt",
    "hủy",
    "huỷ",
    "mới",
    "cũ",
    "nay",
    "mai",
    "sáng",
    "chiều",
    "tối",
    "tổng",
    "bao nhiêu",
    "nhiều",
    "ít",
    "tốt",
    "đẹp",
    "vui",
    "an",
    "bình",
    "xuân",
    "hạ",
    "thu",
    "đông",
    "minh",
    "hoa",
    "mai",
    "lan",
    "today",
    "tomorrow",
    "yesterday",
    "week",
    "month",
    "revenue",
    "booking",
    "bookings",
    "client",
    "clients",
    "staff",
    "service",
    "services",
    "context",
    "reply",
    "vietnamese",
    "english",
    "answer",
    "busy",
    "free",
    "how",
    "many",
    "what",
    "who",
  ].map(fold),
);

export function isCommonWord(name: string): boolean {
  return COMMON_WORDS.has(fold(name.trim()));
}
