import { describe, it, expect } from 'vitest';
import {
  TIER_PRICE_CENTS,
  suggestTier,
  priceForTier,
  type Tier,
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
