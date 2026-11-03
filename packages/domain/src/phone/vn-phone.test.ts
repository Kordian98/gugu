import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone, normalizeVnPhone } from "./vn-phone";

describe("normalizeVnPhone", () => {
  it.each([
    ["0912 345 678", "+84912345678"],
    ["+84 912.345.678", "+84912345678"],
    ["84912345678", "+84912345678"],
    ["028-3822-1234", "+842838221234"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeVnPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "+48 600 100 200", "0112345678", "09123456789"])("rejects %s", (input) => {
    expect(normalizeVnPhone(input)).toBeNull();
  });
});

describe("maskPhone", () => {
  it("keeps only the country code and the last 3 digits", () => {
    expect(maskPhone("+84912345678")).toBe("+84 ••• ••• 678");
    expect(maskPhone("+84912345678")).not.toContain("912");
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("lan.nguyen@example.vn")).toBe("l•••@example.vn");
    expect(maskEmail("broken")).toBe("•••");
  });
});
