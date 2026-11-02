import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("strips Vietnamese diacritics and đ", () => {
    expect(slugify("Lotus Beauty Quận 1")).toBe("lotus-beauty-quan-1");
    expect(slugify("Tiệm Nail Đẹp")).toBe("tiem-nail-dep");
  });

  it("falls back for names without letters", () => {
    expect(slugify("!!!")).toBe("salon");
  });

  it("adds a random suffix", () => {
    expect(uniqueSlug("Lotus")).toMatch(/^lotus-[0-9a-f]{6}$/);
  });
});
