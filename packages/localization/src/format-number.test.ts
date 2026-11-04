import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("uses the locale's separators and caps decimals", () => {
    expect(formatNumber(1234.567, "vi", 1)).toBe("1.234,6");
    expect(formatNumber(1234.567, "en", 2)).toBe("1,234.57");
    expect(formatNumber(4.33, "vi")).toBe("4");
  });
});
