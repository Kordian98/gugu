import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS, redactRequest, redactUrl } from "./redaction";

describe("log redaction", () => {
  it("removes credentials, contact details, OTP and notes", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: "[Redacted]" } }, sink);
    log.info({
      req: { headers: { authorization: "Bearer abc", cookie: "sid=1" } },
      customer: { phone: "+84901234567", email: "lan@example.vn", notes: "allergic to latex" },
      auth: { otp: "123456", refreshToken: "rt" },
      problem: { code: "booking.slot_taken" },
    });
    const out = lines.join("");
    for (const secret of [
      "Bearer abc",
      "sid=1",
      "+84901234567",
      "lan@example.vn",
      "latex",
      "123456",
      '"rt"',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("booking.slot_taken");
  });

  it("redacts booking manage tokens in request URLs (topic 06 security review)", () => {
    expect(redactUrl("/api/v1/public/bookings/SeCrEt-token_123/cancel?x=1")).toBe(
      "/api/v1/public/bookings/[Redacted]/cancel?x=1",
    );
    expect(redactUrl("/api/v1/public/bookings/abc")).toBe("/api/v1/public/bookings/[Redacted]");
    expect(redactUrl("/api/v1/salons/1/bookings/2")).toBe("/api/v1/salons/1/bookings/2");
    expect(redactUrl(undefined)).toBeUndefined();
    const req = redactRequest({ method: "GET", url: "/api/v1/public/bookings/tok/x" });
    expect(req).toEqual({ method: "GET", url: "/api/v1/public/bookings/[Redacted]/x" });
  });

  it("redacts ad hoc service names in availability, earliest and booking-check request logs", () => {
    const custom = JSON.stringify({ name: "Linh 0933444555", priceMinor: 175000 });
    for (const route of ["availability", "availability/earliest", "booking-check"]) {
      const url = `/api/v1/salons/salon/${route}?customService=${encodeURIComponent(custom)}&durationMinutes=75&custom%53ervice=${encodeURIComponent(custom)}`;
      const safe = redactRequest({ method: "GET", url }).url;
      expect(decodeURIComponent(safe)).not.toContain("Linh");
      expect(safe).not.toContain("0933444555");
      const params = new URLSearchParams(safe.slice(safe.indexOf("?") + 1));
      expect(params.getAll("customService")).toEqual(["[Redacted]"]);
      expect(params.get("durationMinutes")).toBe("75");
    }
  });
});
