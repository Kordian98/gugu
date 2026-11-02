import type { AiImportDraftService, ServiceInput } from "@gugu/contracts";

/**
 * Review step of the AI price-list import (topic 08 IMP): AI drafts become editable rows; the
 * owner fixes them; included rows become catalogue inputs. Pure, shared by the app and tests.
 */
export interface ReviewRow {
  key: string;
  include: boolean;
  nameVi: string;
  nameEn: string;
  /** Global category slug from the draft (mapped to an id on save). */
  category: string | null;
  price: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  lowConfidence: boolean;
  sourceImage: number;
  variants: AiImportDraftService["variants"];
  addOns: AiImportDraftService["addOns"];
}

export type RowProblem = "name" | "price" | "duration";

export function toReviewRows(items: readonly AiImportDraftService[]): ReviewRow[] {
  return items.map((d, i) => ({
    key: `row-${String(i)}`,
    include: true,
    nameVi: d.name.vi.trim(),
    nameEn: d.name.en.trim(),
    category: d.category,
    price: d.price ?? lowestVariantPrice(d),
    priceMax: d.priceMax,
    durationMinutes: d.durationMinutes ?? shortestVariantDuration(d),
    lowConfidence: d.confidence === "low",
    sourceImage: d.sourceImage,
    variants: d.variants,
    addOns: d.addOns,
  }));
}

/** What still blocks saving this row (empty = ready). */
export function rowProblems(row: ReviewRow): RowProblem[] {
  const out: RowProblem[] = [];
  if (row.nameVi.trim() === "") out.push("name");
  if (row.price === null || (row.priceMax !== null && row.priceMax < row.price)) out.push("price");
  if (row.durationMinutes === null || row.durationMinutes < 5 || row.durationMinutes > 1440)
    out.push("duration");
  return out;
}

/**
 * Catalogue input for an included, valid row. Variants without their own duration inherit the
 * service duration; add-ons without one take no extra time.
 */
export function toServiceInput(
  row: ReviewRow,
  categoryIdBySlug: ReadonlyMap<string, string>,
): ServiceInput {
  if (rowProblems(row).length > 0) throw new Error(`row ${row.key} is not ready`);
  const duration = row.durationMinutes ?? 0;
  return {
    name: { vi: row.nameVi.trim(), en: row.nameEn.trim() },
    categoryId: (row.category && categoryIdBySlug.get(row.category)) ?? null,
    price: row.price ?? 0,
    priceMax: row.priceMax,
    durationMinutes: duration,
    variants: row.variants
      .filter((v) => v.name.vi.trim() !== "")
      .map((v) => ({
        name: { vi: v.name.vi.trim(), en: v.name.en.trim() },
        price: v.price,
        priceMax:
          v.priceMax !== null && v.price !== null && v.priceMax < v.price ? null : v.priceMax,
        durationMinutes: v.durationMinutes ?? duration,
      })),
    addOns: row.addOns
      .filter((a) => a.name.vi.trim() !== "")
      .map((a) => ({
        name: { vi: a.name.vi.trim(), en: a.name.en.trim() },
        extraPrice: a.extraPrice,
        extraPriceMax:
          a.extraPriceMax !== null && a.extraPriceMax < a.extraPrice ? null : a.extraPriceMax,
        extraDurationMinutes: a.extraDurationMinutes ?? 0,
      })),
  };
}

function lowestVariantPrice(d: AiImportDraftService): number | null {
  const prices = d.variants.map((v) => v.price).filter((p): p is number => p !== null);
  return prices.length ? Math.min(...prices) : null;
}

function shortestVariantDuration(d: AiImportDraftService): number | null {
  const ds = d.variants.map((v) => v.durationMinutes).filter((m): m is number => m !== null);
  return ds.length ? Math.min(...ds) : null;
}
