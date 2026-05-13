export type Tier = 'Starter' | 'Pro' | 'Premium';

export const TIER_PRICE_CENTS: Record<Tier, number> = {
  Starter: 297_00,
  Pro:     597_00,
  Premium: 997_00,
};

/**
 * Suggest a tier based on Google review count as a business-size proxy.
 *  <  50 reviews → Starter
 *  50–299       → Pro
 *  300+         → Premium
 */
export function suggestTier(reviewCount: number | null | undefined): Tier {
  const r = reviewCount ?? 0;
  if (r >= 300) return 'Premium';
  if (r >=  50) return 'Pro';
  return 'Starter';
}

export function priceForTier(tier: Tier): number {
  return TIER_PRICE_CENTS[tier];
}

/* ---------------------------------------------------------------------------
 * Segment × difficulty pricing (new model — see PRODUCT.md "Pricing Model").
 *
 * Price = position within the segment's [min, max] range, set by a 0–1
 * difficulty score. The legacy Tier API above is kept intact so existing
 * proposals and tests don't break during the transition.
 * ------------------------------------------------------------------------- */

export type SizeBand = 'S' | 'M' | 'L';

/**
 * Free-form industry key. Matrix lookups for unknown industries fall back to
 * `other`. Calibrate the known set in PRICE_MATRIX as PRODUCT.md is filled in.
 */
export type Industry = string;

export interface PriceRange {
  minCents: number;
  maxCents: number;
}

export interface Segment {
  industry: Industry;
  size: SizeBand;
}

/**
 * Industry × size price matrix. Initial values are degenerate ranges
 * (min === max) that exactly mirror today's flat tier prices, so behaviour
 * is unchanged until the matrix is calibrated against PRODUCT.md.
 */
export const PRICE_MATRIX: Record<Industry, Record<SizeBand, PriceRange>> = {
  other: {
    S: { minCents: TIER_PRICE_CENTS.Starter, maxCents: TIER_PRICE_CENTS.Starter },
    M: { minCents: TIER_PRICE_CENTS.Pro,     maxCents: TIER_PRICE_CENTS.Pro     },
    L: { minCents: TIER_PRICE_CENTS.Premium, maxCents: TIER_PRICE_CENTS.Premium },
  },
};

export const KNOWN_INDUSTRIES: readonly Industry[] = Object.freeze(
  Object.keys(PRICE_MATRIX),
);

export function sizeBandForReviewCount(reviewCount: number | null | undefined): SizeBand {
  const r = reviewCount ?? 0;
  if (r >= 300) return 'L';
  if (r >=  50) return 'M';
  return 'S';
}

/**
 * Map a free-form lead category (e.g. "dental_clinic", "Family law attorney")
 * to a known industry key in PRICE_MATRIX. Falls back to "other" until the
 * matrix is expanded with concrete industries from PRODUCT.md.
 */
export function industryForLeadCategory(_category: string | null | undefined): Industry {
  return 'other';
}

export function suggestSegment(lead: {
  category: string | null | undefined;
  googleReviewCount: number | null | undefined;
}): Segment {
  return {
    industry: industryForLeadCategory(lead.category),
    size: sizeBandForReviewCount(lead.googleReviewCount),
  };
}

export function rangeForSegment(segment: Segment): PriceRange {
  return PRICE_MATRIX[segment.industry]?.[segment.size] ?? PRICE_MATRIX.other[segment.size];
}

/**
 * Final price = range.min + difficulty × (range.max − range.min), clamped to
 * [0, 1] on difficulty, rounded to the nearest cent.
 */
export function priceForSegment(segment: Segment, difficulty: number): number {
  const range = rangeForSegment(segment);
  const d = Math.max(0, Math.min(1, difficulty));
  return Math.round(range.minCents + d * (range.maxCents - range.minCents));
}
