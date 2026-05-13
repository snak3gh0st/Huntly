import { describe, it, expect } from 'vitest';
import {
  TIER_PRICE_CENTS,
  suggestTier,
  priceForTier,
  PRICE_MATRIX,
  KNOWN_INDUSTRIES,
  sizeBandForReviewCount,
  industryForLeadCategory,
  suggestSegment,
  rangeForSegment,
  priceForSegment,
} from '../../src/lib/pricing-tiers.js';

describe('TIER_PRICE_CENTS', () => {
  it('has the three expected tiers at the expected prices', () => {
    expect(TIER_PRICE_CENTS.Starter).toBe(297_00);
    expect(TIER_PRICE_CENTS.Pro).toBe(597_00);
    expect(TIER_PRICE_CENTS.Premium).toBe(997_00);
  });
});

describe('suggestTier', () => {
  it('returns Starter for under 50 reviews', () => {
    expect(suggestTier(0)).toBe('Starter');
    expect(suggestTier(49)).toBe('Starter');
  });

  it('returns Pro for 50 to 299 reviews', () => {
    expect(suggestTier(50)).toBe('Pro');
    expect(suggestTier(150)).toBe('Pro');
    expect(suggestTier(299)).toBe('Pro');
  });

  it('returns Premium for 300+ reviews', () => {
    expect(suggestTier(300)).toBe('Premium');
    expect(suggestTier(1000)).toBe('Premium');
  });

  it('treats null and undefined as zero', () => {
    expect(suggestTier(null)).toBe('Starter');
    expect(suggestTier(undefined)).toBe('Starter');
  });
});

describe('priceForTier', () => {
  it('returns the cents price for each tier', () => {
    expect(priceForTier('Starter')).toBe(297_00);
    expect(priceForTier('Pro')).toBe(597_00);
    expect(priceForTier('Premium')).toBe(997_00);
  });
});

describe('sizeBandForReviewCount', () => {
  it('maps review count to S/M/L on the same cutoffs as the legacy tiers', () => {
    expect(sizeBandForReviewCount(0)).toBe('S');
    expect(sizeBandForReviewCount(49)).toBe('S');
    expect(sizeBandForReviewCount(50)).toBe('M');
    expect(sizeBandForReviewCount(299)).toBe('M');
    expect(sizeBandForReviewCount(300)).toBe('L');
    expect(sizeBandForReviewCount(null)).toBe('S');
    expect(sizeBandForReviewCount(undefined)).toBe('S');
  });
});

describe('industryForLeadCategory', () => {
  it('returns "other" for now (matrix has not been calibrated yet)', () => {
    expect(industryForLeadCategory('dental_clinic')).toBe('other');
    expect(industryForLeadCategory('Family law attorney')).toBe('other');
    expect(industryForLeadCategory(null)).toBe('other');
  });
});

describe('PRICE_MATRIX', () => {
  it('exposes "other" as a registered industry with degenerate ranges that mirror the legacy tier prices', () => {
    expect(KNOWN_INDUSTRIES).toContain('other');
    expect(PRICE_MATRIX.other.S).toEqual({ minCents: 297_00, maxCents: 297_00 });
    expect(PRICE_MATRIX.other.M).toEqual({ minCents: 597_00, maxCents: 597_00 });
    expect(PRICE_MATRIX.other.L).toEqual({ minCents: 997_00, maxCents: 997_00 });
  });
});

describe('suggestSegment', () => {
  it('combines industry mapping with the size band rule', () => {
    expect(suggestSegment({ category: 'restaurant', googleReviewCount: 12 }))
      .toEqual({ industry: 'other', size: 'S' });
    expect(suggestSegment({ category: 'dental_clinic', googleReviewCount: 120 }))
      .toEqual({ industry: 'other', size: 'M' });
    expect(suggestSegment({ category: null, googleReviewCount: 500 }))
      .toEqual({ industry: 'other', size: 'L' });
  });
});

describe('rangeForSegment', () => {
  it('returns the matrix cell for known industries', () => {
    expect(rangeForSegment({ industry: 'other', size: 'M' }))
      .toEqual({ minCents: 597_00, maxCents: 597_00 });
  });

  it('falls back to the "other" row for unknown industries', () => {
    expect(rangeForSegment({ industry: 'not-in-matrix-yet', size: 'L' }))
      .toEqual(PRICE_MATRIX.other.L);
  });
});

describe('priceForSegment', () => {
  it('returns the floor at difficulty=0 and the ceiling at difficulty=1', () => {
    // Degenerate range for the only-currently-defined industry: min === max,
    // so difficulty has no visible effect. Verified end-to-end here.
    expect(priceForSegment({ industry: 'other', size: 'S' }, 0)).toBe(297_00);
    expect(priceForSegment({ industry: 'other', size: 'S' }, 1)).toBe(297_00);
    expect(priceForSegment({ industry: 'other', size: 'M' }, 0.5)).toBe(597_00);
  });

  it('interpolates linearly on a non-degenerate range', () => {
    // Inject a non-degenerate range via the public matrix so the test
    // doesn't rely on internals.
    const original = PRICE_MATRIX.other.S;
    try {
      PRICE_MATRIX.other.S = { minCents: 100_00, maxCents: 200_00 };
      expect(priceForSegment({ industry: 'other', size: 'S' }, 0)).toBe(100_00);
      expect(priceForSegment({ industry: 'other', size: 'S' }, 0.5)).toBe(150_00);
      expect(priceForSegment({ industry: 'other', size: 'S' }, 1)).toBe(200_00);
      // Interpolation rounded to nearest cent.
      expect(priceForSegment({ industry: 'other', size: 'S' }, 0.333)).toBe(133_30);
    } finally {
      PRICE_MATRIX.other.S = original;
    }
  });

  it('clamps difficulty to [0, 1]', () => {
    const original = PRICE_MATRIX.other.S;
    try {
      PRICE_MATRIX.other.S = { minCents: 100_00, maxCents: 200_00 };
      expect(priceForSegment({ industry: 'other', size: 'S' }, -5)).toBe(100_00);
      expect(priceForSegment({ industry: 'other', size: 'S' },  5)).toBe(200_00);
    } finally {
      PRICE_MATRIX.other.S = original;
    }
  });
});
