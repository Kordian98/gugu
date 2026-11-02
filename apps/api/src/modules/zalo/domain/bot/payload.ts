/**
 * Button payloads the bot puts on Zalo buttons and reads back. Short, versioned, no personal data:
 *   gg|<seq>|<index>          option <index> of reply <seq>
 *   gg|g|<command>            global: menu | book | mine | staff
 *   gg|b|<action>|<bookingId> booking action from a reminder: confirm | cancel | resched
 */
export type ParsedPayload =
  | { kind: "option"; seq: number; index: number }
  | { kind: "global"; command: GlobalCommand }
  | { kind: "booking"; action: BookingAction; bookingId: string }
  | { kind: "unknown" };

export const GLOBAL_COMMANDS = ["menu", "book", "mine", "staff"] as const;
export type GlobalCommand = (typeof GLOBAL_COMMANDS)[number];
export const BOOKING_ACTIONS = ["confirm", "cancel", "resched"] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

const UUID = /^[0-9a-f-]{36}$/i;

export const optionPayload = (seq: number, index: number) => `gg|${String(seq)}|${String(index)}`;
export const globalPayload = (command: GlobalCommand) => `gg|g|${command}`;
export const bookingPayload = (action: BookingAction, bookingId: string) =>
  `gg|b|${action}|${bookingId}`;

export function parsePayload(raw: string): ParsedPayload {
  const parts = raw.trim().split("|");
  if (parts[0] !== "gg") return { kind: "unknown" };
  if (parts[1] === "g" && parts.length === 3) {
    const command = parts[2] as GlobalCommand;
    return GLOBAL_COMMANDS.includes(command) ? { kind: "global", command } : { kind: "unknown" };
  }
  if (parts[1] === "b" && parts.length === 4) {
    const action = parts[2] as BookingAction;
    const bookingId = parts[3] ?? "";
    return BOOKING_ACTIONS.includes(action) && UUID.test(bookingId)
      ? { kind: "booking", action, bookingId }
      : { kind: "unknown" };
  }
  if (parts.length === 3 && /^\d{1,9}$/.test(parts[1] ?? "") && /^\d{1,2}$/.test(parts[2] ?? "")) {
    return { kind: "option", seq: Number(parts[1]), index: Number(parts[2]) };
  }
  return { kind: "unknown" };
}

/** Lower-case, no diacritics, single spaces — for keyword matching of typed text. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}:\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KEYWORDS: readonly [GlobalCommand, readonly string[]][] = [
  ["book", ["dat lich", "dat hen", "book", "booking", "dat cho"]],
  ["mine", ["lich hen", "lich cua toi", "huy lich", "doi lich", "my appointments", "cancel"]],
  ["staff", ["nhan vien", "gap nguoi", "tu van", "staff", "human", "nguoi that"]],
  ["menu", ["menu", "bat dau", "start", "hi", "hello", "xin chao", "chao", "alo"]],
];

/** Global command a typed message asks for, if any. */
export function keywordCommand(text: string): GlobalCommand | null {
  const n = normalizeText(text);
  for (const [command, words] of KEYWORDS) {
    if (words.some((w) => n === w || n.startsWith(`${w} `) || n.endsWith(` ${w}`))) return command;
  }
  return null;
}
