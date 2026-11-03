import { describe, expect, it } from "vitest";
import { BUSINESS_TYPES, serviceInputSchema } from "@gugu/contracts";
import { starterServices } from "./starter-services";

describe("starterServices", () => {
  it.each(BUSINESS_TYPES)(
    "%s: valid service inputs with vi + en names and a sane range",
    (type) => {
      const list = starterServices(type);
      expect(list.length).toBeGreaterThanOrEqual(5);
      expect(new Set(list.map((s) => s.key)).size).toBe(list.length);
      for (const s of list) {
        expect(s.name.vi.length).toBeGreaterThan(1);
        expect(s.name.en.length).toBeGreaterThan(1);
        expect(s.price % 1000).toBe(0);
        if (s.priceMax !== null) expect(s.priceMax).toBeGreaterThan(s.price);
        const parsed = serviceInputSchema.safeParse({
          name: s.name,
          price: s.price,
          priceMax: s.priceMax,
          durationMinutes: s.durationMinutes,
        });
        expect(parsed.success).toBe(true);
      }
    },
  );

  it("returns fresh objects (editing one list never changes the next)", () => {
    const a = starterServices("nails");
    const first = a[0];
    if (!first) throw new Error("empty");
    first.name.vi = "changed";
    expect(starterServices("nails")[0]?.name.vi).not.toBe("changed");
  });
});
