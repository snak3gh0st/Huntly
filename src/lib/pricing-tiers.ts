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
