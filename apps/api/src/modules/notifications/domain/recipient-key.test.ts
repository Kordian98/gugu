import { describe, expect, it } from "vitest";
import { canonicalEmail, recipientKey } from "./recipient-key";

describe("canonical recipient key", () => {
  it("folds Gmail aliases into one mailbox", () => {
    for (const alias of [
      "Lan.Nguyen@gmail.com",
      "lannguyen+spa@gmail.com",
      "l.a.n.nguyen@googlemail.com",
      " LANNGUYEN+x+y@GMAIL.COM ",
    ]) {
      expect(canonicalEmail(alias)).toBe("lannguyen@gmail.com");
      expect(recipientKey(alias)).toBe(recipientKey("lannguyen@gmail.com"));
    }
  });
  it("strips +tags elsewhere but keeps dots outside Gmail", () => {
    expect(canonicalEmail("lan.nguyen+a@example.vn")).toBe("lan.nguyen@example.vn");
    expect(recipientKey("lan.nguyen@example.vn")).not.toBe(recipientKey("lannguyen@example.vn"));
    expect(recipientKey("x@example.vn")).toMatch(/^[0-9a-f]{64}$/);
  });
});
