import { describe, expect, it } from "vitest";
import { cursorQuerySchema, localeSchema, problemSchema, uuidV7Schema } from "../index";

describe("common contracts", () => {
  it("accepts a valid problem document", () => {
    const parsed = problemSchema.parse({
      title: "Slot taken",
      status: 409,
      code: "booking.slot_taken",
    });
    expect(parsed.type).toBe("about:blank");
  });

  it("rejects non-snake problem codes", () => {
    expect(problemSchema.safeParse({ title: "x", status: 400, code: "Bad Code" }).success).toBe(
      false,
    );
  });

  it("caps page size at 100 and defaults to 20", () => {
    expect(cursorQuerySchema.parse({}).limit).toBe(20);
    expect(cursorQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("accepts only UUIDv7", () => {
    expect(uuidV7Schema.safeParse("0190f5e2-7b1c-7c3a-9d2e-1a2b3c4d5e6f").success).toBe(true);
    expect(uuidV7Schema.safeParse("6f1c2c9e-4b1a-4c2e-9d2e-1a2b3c4d5e6f").success).toBe(false);
  });

  it("supports vi and en only", () => {
    expect(localeSchema.options).toEqual(["vi", "en"]);
  });
});
