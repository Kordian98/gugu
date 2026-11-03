/**
 * Minimal iCalendar (RFC 5545) for one appointment, attached to customer emails so the customer
 * can add it to their calendar. Same UID for every email about one booking; SEQUENCE = booking
 * version, so a reschedule updates the event and a cancellation (METHOD:CANCEL) removes it.
 * No organizer/attendee addresses (nothing personal in the file).
 */
export interface IcsInput {
  method: "publish" | "cancel";
  bookingId: string;
  version: number;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location: string | null;
  /** Domain part of the UID, e.g. the MAIL_FROM domain. */
  uidDomain: string;
  now: Date;
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1: lines longer than 75 octets are folded (CRLF + space), never inside a UTF-8 char. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(input: IcsInput): string {
  const cancel = input.method === "cancel";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Salon booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancel ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${input.bookingId}@${input.uidDomain}`,
    `SEQUENCE:${String(input.version)}`,
    `DTSTAMP:${stamp(input.now)}`,
    `DTSTART:${stamp(input.startsAt)}`,
    `DTEND:${stamp(input.endsAt)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    ...(input.location ? [`LOCATION:${escapeIcsText(input.location)}`] : []),
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
