import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateTotpSecret,
  hotp,
  normalizeRecoveryCode,
  otpauthUri,
  totp,
  verifyTotp,
} from "./totp";

// RFC 6238 appendix B: ASCII "12345678901234567890", SHA-1; the 8-digit values end in these 6.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vectors", () => {
    for (const [seconds, code] of RFC_VECTORS) expect(totp(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    const secret = Buffer.from("12345678901234567890");
    expect(hotp(secret, 0)).toBe("755224");
    expect(hotp(secret, 9)).toBe("520489");
  });

  it("base32 round-trips", () => {
    const buf = Buffer.from("any bytes \u0000ÿ", "utf8");
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  it("accepts ±1 step and returns the matched step", () => {
    const now = 1_800_000_000_000;
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(step);
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(secret, totp(secret, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
  });

  it("rejects malformed codes", () => {
    const secret = generateTotpSecret();
    for (const bad of ["", "12345", "1234567", "abcdef", " 12345"]) {
      expect(verifyTotp(secret, bad, Date.now())).toBeNull();
    }
  });

  it("builds an otpauth URI", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "admin@gugu.local");
    expect(uri).toMatch(/^otpauth:\/\/totp\/GuGu%20Admin%3Aadmin%40gugu\.local\?/);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("are 2×5 Crockford characters and unique", () => {
    const codes = new Set(Array.from({ length: 200 }, generateRecoveryCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it("normalise case, separators and look-alikes", () => {
    expect(normalizeRecoveryCode("ab1cd-0ef2g")).toBe("AB1CD0EF2G");
    expect(normalizeRecoveryCode(" abIcd ofl2g ")).toBe("AB1CD0F12G");
  });
});
