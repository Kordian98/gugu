import { describe, expect, it } from "vitest";
import { checkClaims } from "./id-token-verifier";

const iss = ["https://accounts.google.com"];
const aud = ["client-1"];
const now = 1_800_000_000;
const base = {
  iss: iss[0],
  aud: "client-1",
  exp: now + 600,
  sub: "123",
  email: "A@B.vn",
  email_verified: true,
};

describe("ID token claims", () => {
  it("accepts a valid token and lower-cases the email", () => {
    expect(checkClaims(base, iss, aud, now)).toEqual({
      subject: "123",
      email: "a@b.vn",
      emailVerified: true,
    });
  });

  it.each([
    ["wrong audience", { aud: "other" }],
    ["wrong issuer", { iss: "https://evil.example" }],
    ["expired", { exp: now - 3600 }],
    ["missing subject", { sub: "" }],
  ])("rejects %s", (_, patch) => {
    expect(checkClaims({ ...base, ...patch }, iss, aud, now)).toBeNull();
  });

  it("accepts Apple's string email_verified and array audiences", () => {
    expect(
      checkClaims({ ...base, aud: ["x", "client-1"], email_verified: "true" }, iss, aud, now)
        ?.emailVerified,
    ).toBe(true);
  });
});
