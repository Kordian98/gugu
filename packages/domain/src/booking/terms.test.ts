import { describe, expect, it } from "vitest";
import { resolveServiceTerms } from "./terms";

const service = {
  durationMinutes: 45,
  bufferBeforeMinutes: 5,
  bufferAfterMinutes: 10,
  priceMinor: 200_000,
  priceMaxMinor: 300_000,
};

describe("resolveServiceTerms", () => {
  it("uses the service when nothing overrides it", () => {
    expect(resolveServiceTerms({ service })).toEqual({
      baseDurationMinutes: 45,
      durationMinutes: 45,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      basePriceMinor: 200_000,
      basePriceMaxMinor: 300_000,
      priceMinor: 200_000,
      priceMaxMinor: 300_000,
    });
  });

  it("variant overrides duration and price; null inherits", () => {
    const t = resolveServiceTerms({
      service,
      variant: { durationMinutes: 60, priceMinor: 250_000, priceMaxMinor: null },
    });
    expect(t).toMatchObject({ durationMinutes: 60, priceMinor: 250_000, priceMaxMinor: null });
    const inherit = resolveServiceTerms({
      service,
      variant: { durationMinutes: null, priceMinor: null, priceMaxMinor: null },
    });
    expect(inherit).toMatchObject({
      durationMinutes: 45,
      priceMinor: 200_000,
      priceMaxMinor: 300_000,
    });
  });

  it("staff override wins over the variant", () => {
    const t = resolveServiceTerms({
      service,
      variant: { durationMinutes: 60, priceMinor: 250_000, priceMaxMinor: 280_000 },
      staffOverride: { durationMinutes: 50, priceMinor: 320_000 },
    });
    expect(t).toMatchObject({
      baseDurationMinutes: 50,
      basePriceMinor: 320_000,
      basePriceMaxMinor: null,
    });
  });

  it("add-ons extend duration and price, keeping ranges", () => {
    const t = resolveServiceTerms({
      service: { ...service, priceMaxMinor: null },
      addOns: [
        { extraDurationMinutes: 15, extraPriceMinor: 50_000, extraPriceMaxMinor: null },
        { extraDurationMinutes: 0, extraPriceMinor: 20_000, extraPriceMaxMinor: 40_000 },
      ],
    });
    expect(t).toMatchObject({
      baseDurationMinutes: 45,
      durationMinutes: 60,
      priceMinor: 270_000,
      priceMaxMinor: 290_000,
    });
  });
});
