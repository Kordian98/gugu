import { describe, expect, it } from "vitest";

import { createI18n } from "./i18n-core";
import { formatRating, formatVND } from "./format";
import { resources } from "./resources";

const keys = (obj: unknown, prefix = ""): string[] =>
  typeof obj === "object" && obj !== null
    ? Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  for (const ns of Object.keys(resources.vi) as (keyof typeof resources.vi)[]) {
    it(`${ns}: vi and en have identical keys and placeholders`, () => {
      const vi = resources.vi[ns];
      const en = resources.en[ns];
      expect(keys(en).sort()).toEqual(keys(vi).sort());
      const get = (o: unknown, path: string) =>
        path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o);
      for (const k of keys(vi)) {
        expect(placeholders(String(get(en, k)))).toEqual(placeholders(String(get(vi, k))));
      }
    });
  }
});

describe("i18n core", () => {
  it("translates with vi default and en", () => {
    expect(createI18n().t("nav.signIn")).toBe("Đăng nhập");
    expect(createI18n("en").t("marketing:home.spots.from", { price: "300,000đ" })).toBe(
      "From 300,000đ",
    );
  });
});

describe("formatters", () => {
  it("formats VND and ratings per locale", () => {
    expect(formatVND(300000, "vi")).toBe("300.000đ");
    expect(formatVND(300000, "en")).toBe("300,000đ");
    expect(formatRating(4.9, "vi")).toBe("4,9");
    expect(formatRating(4.9, "en")).toBe("4.9");
  });
});
