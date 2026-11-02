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
});
