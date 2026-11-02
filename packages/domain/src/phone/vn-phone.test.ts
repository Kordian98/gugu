import { describe, expect, it } from "vitest";
import { normalizeVnPhone } from "./vn-phone";

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
