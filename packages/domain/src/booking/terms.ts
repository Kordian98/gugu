/**
 * Effective duration, buffers and price of one booked service (spec 06 G13, §3.12).
 * Resolution order: staff override → variant → service; add-ons extend the duration and price.
 * Money is in minor units of the salon currency (VND has none) as safe integers.
 */

export interface ServiceTermsSource {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceMinor: number;
  priceMaxMinor: number | null;
}

export interface VariantTermsSource {
  durationMinutes: number | null;
  priceMinor: number | null;
  priceMaxMinor: number | null;
}

export interface StaffOverrideSource {
  durationMinutes: number | null;
  priceMinor: number | null;
}

export interface AddOnTermsSource {
  extraDurationMinutes: number;
  extraPriceMinor: number;
  extraPriceMaxMinor: number | null;
}

export interface ServiceTerms {
  /** Service (or variant / staff override) duration without add-ons. */
  baseDurationMinutes: number;
  /** Customer-visible appointment length: base + Σ add-on extra durations. */
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  /** Base price without add-ons. */
  basePriceMinor: number;
  basePriceMaxMinor: number | null;
  /** Estimated total: base + Σ add-on extra prices (a range when any part is a range). */
  priceMinor: number;
  priceMaxMinor: number | null;
}

/** A fixed staff or variant price drops the service's range unless the variant has its own. */
function basePrice(
  service: ServiceTermsSource,
  variant: VariantTermsSource | null | undefined,
  staffOverride: StaffOverrideSource | null | undefined,
): { basePriceMinor: number; basePriceMaxMinor: number | null } {
  if (staffOverride?.priceMinor != null) {
    return { basePriceMinor: staffOverride.priceMinor, basePriceMaxMinor: null };
  }
  if (variant?.priceMinor != null) {
    return { basePriceMinor: variant.priceMinor, basePriceMaxMinor: variant.priceMaxMinor };
  }
  return { basePriceMinor: service.priceMinor, basePriceMaxMinor: service.priceMaxMinor };
}

export function resolveServiceTerms(input: {
  service: ServiceTermsSource;
  variant?: VariantTermsSource | null;
  staffOverride?: StaffOverrideSource | null;
  addOns?: readonly AddOnTermsSource[];
}): ServiceTerms {
  const { service, variant, staffOverride } = input;
  const addOns = input.addOns ?? [];
  const baseDurationMinutes =
    staffOverride?.durationMinutes ?? variant?.durationMinutes ?? service.durationMinutes;
  const { basePriceMinor, basePriceMaxMinor } = basePrice(service, variant, staffOverride);

  const extraDuration = addOns.reduce((s, a) => s + a.extraDurationMinutes, 0);
  const extraMin = addOns.reduce((s, a) => s + a.extraPriceMinor, 0);
  const hasRange = basePriceMaxMinor != null || addOns.some((a) => a.extraPriceMaxMinor != null);
  const extraMax = addOns.reduce((s, a) => s + (a.extraPriceMaxMinor ?? a.extraPriceMinor), 0);

  return {
    baseDurationMinutes,
    durationMinutes: baseDurationMinutes + extraDuration,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    basePriceMinor,
    basePriceMaxMinor,
    priceMinor: basePriceMinor + extraMin,
    priceMaxMinor: hasRange ? (basePriceMaxMinor ?? basePriceMinor) + extraMax : null,
  };
}
