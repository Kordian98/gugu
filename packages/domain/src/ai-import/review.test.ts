import { describe, expect, it } from "vitest";
import { type AiImportDraftService, serviceInputSchema } from "@gugu/contracts";
import { rowProblems, toReviewRows, toServiceInput } from "./review";

const draft = (patch: Partial<AiImportDraftService> = {}): AiImportDraftService => ({
  name: { vi: "Cắt tóc", en: "Haircut" },
  category: "hair",
  price: null,
  priceMax: null,
  durationMinutes: null,
  variants: [
    { name: { vi: "Tóc ngắn", en: "Short" }, price: 100000, priceMax: null, durationMinutes: 30 },
    { name: { vi: "Tóc dài", en: "Long" }, price: 150000, priceMax: 120000, durationMinutes: null },
  ],
  addOns: [
    {
      name: { vi: "Gội", en: "Wash" },
      extraPrice: 30000,
      extraPriceMax: null,
      extraDurationMinutes: null,
    },
  ],
  sourceImage: 1,
  confidence: "low",
  ...patch,
});

const cats = new Map([["hair", "0196f000-0000-7000-8000-00000000000a"]]);

describe("AI import review", () => {
  it("fills price and duration from variants and flags low confidence", () => {
    const [row] = toReviewRows([draft()]);
    expect(row).toMatchObject({ price: 100000, durationMinutes: 30, lowConfidence: true });
    expect(row && rowProblems(row)).toEqual([]);
  });

  it("reports missing name, price and duration", () => {
    const [row] = toReviewRows([
      draft({ name: { vi: " ", en: "" }, variants: [], durationMinutes: null }),
    ]);
    expect(row && rowProblems(row)).toEqual(["name", "price", "duration"]);
  });

  it("builds a catalogue input the API accepts", () => {
    const [row] = toReviewRows([draft()]);
    if (!row) throw new Error("no row");
    const input = toServiceInput(row, cats);
    expect(input.categoryId).toBe(cats.get("hair"));
    expect(input.variants?.[1]).toMatchObject({ durationMinutes: 30, priceMax: null });
    expect(input.addOns?.[0]).toMatchObject({ extraDurationMinutes: 0 });
    expect(serviceInputSchema.safeParse(input).success).toBe(true);
  });

  it("refuses rows that are not ready", () => {
    const [row] = toReviewRows([draft({ variants: [], price: 100000 })]);
    if (!row) throw new Error("no row");
    expect(() => toServiceInput(row, cats)).toThrow();
  });
});
