import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_PATHS } from "./redaction";

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
});
