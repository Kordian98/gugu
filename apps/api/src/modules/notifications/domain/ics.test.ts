import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine } from "./ics";

const input = {
  method: "publish" as const,
  bookingId: "0190a1b2-0000-7000-8000-000000000001",
  version: 2,
  startsAt: new Date("2026-12-10T07:00:00Z"),
  endsAt: new Date("2026-12-10T07:45:00Z"),
  summary: "Sơn gel · Dài – Lotus, Nails; Spa",
  location: "12 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh",
  uidDomain: "gugu.local",
  now: new Date("2026-12-01T01:02:03.456Z"),
};

describe("ics", () => {
  it("builds a PUBLISH event with UTC times, stable UID and the booking version", () => {
    const ics = buildIcs(input);
    expect(ics).toContain("METHOD:PUBLISH\r\n");
    expect(ics).toContain(`UID:${input.bookingId}@gugu.local\r\n`);
    expect(ics).toContain("SEQUENCE:2\r\n");
    expect(ics).toContain("DTSTART:20261210T070000Z\r\n");
    expect(ics).toContain("DTEND:20261210T074500Z\r\n");
    expect(ics).toContain("DTSTAMP:20261201T010203Z\r\n");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/ORGANIZER|ATTENDEE|MAILTO/i);
  });

  it("cancels with the same UID", () => {
    const ics = buildIcs({ ...input, method: "cancel", version: 3 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain(`UID:${input.bookingId}@gugu.local`);
  });

  it("escapes text and folds long lines without splitting UTF-8 characters", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const line = `LOCATION:${"Đường Nguyễn Thị Minh Khai ".repeat(5)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split("\r\n"))
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n ").join("")).toBe(line);
  });
});
