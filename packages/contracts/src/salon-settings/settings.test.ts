import { describe, expect, it } from "vitest";
import { salonProfileInputSchema } from "./settings";

describe("optional salon contact details", () => {
  const provinceId = "01912345-1234-7123-8123-123456789abc";
  const wardId = "01912345-1234-7123-8123-123456789abd";
  it("accepts name-only updates without implicitly clearing other fields", () => {
    expect(salonProfileInputSchema.parse({ name: "Lotus" })).toEqual({ name: "Lotus" });
  });
  it("accepts explicit contact removal and complete addresses", () => {
    expect(
      salonProfileInputSchema.safeParse({
        name: "Lotus",
        phone: null,
        streetAddress: null,
        provinceId: null,
        wardId: null,
      }).success,
    ).toBe(true);
    expect(
      salonProfileInputSchema.safeParse({
        name: "Lotus",
        streetAddress: "123 Test",
        provinceId,
        wardId,
      }).success,
    ).toBe(true);
  });
  it("rejects partial addresses and invalid supplied phone values", () => {
    for (const address of [
      { streetAddress: "123 Test" },
      { provinceId, wardId },
      { streetAddress: null, provinceId, wardId },
    ]) {
      expect(salonProfileInputSchema.safeParse({ name: "Lotus", ...address }).success).toBe(false);
    }
    expect(salonProfileInputSchema.safeParse({ name: "Lotus", phone: "123" }).success).toBe(false);
  });
});
