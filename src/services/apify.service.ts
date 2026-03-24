import { env } from '../config.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LeadSourceData {
  businessName: string;
  category: string;
  address: string;
  phone?: string;
  websiteUrl?: string;
  googleMapsPlaceId: string;
  googleRating?: number;
  googleReviewCount?: number;
  emails?: string[];
  whatsapps?: string[];
  linkedIns?: string[];
  instagrams?: string[];
  facebooks?: string[];
  raw: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  searchBusinesses                                                   */
/* ------------------------------------------------------------------ */

/**
 * Search Google Maps for businesses matching `query` using Apify's
 * Google Maps Scraper actor (compass/google-maps-scraper).
 *
 * Returns up to `limit` businesses with name, address, phone, website,
 * rating, and any emails found on the business website.
 */
export async function searchBusinesses(
  query: string,
  limit = 50,
): Promise<LeadSourceData[]> {
  const token = env.APIFY_API_TOKEN;

  // Actor: lukaskrivka/google-maps-with-contact-details
  // Returns emails, phones, WhatsApp, LinkedIn, Instagram, Facebook, etc.
  const response = await fetch(
    `https://api.apify.com/v2/acts/WnMxbsRLNbPeYL6ge/run-sync-get-dataset-items?token=${token}&timeout=300`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: limit,
        language: 'en',
        maxImages: 0,
        maxReviews: 10,
        includeHistogram: false,
        includeOpeningHours: false,
        includePeopleAlsoSearch: false,
        additionalInfo: false,
      }),
      signal: AbortSignal.timeout(310_000), // slightly above Apify's 300s
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const items = await response.json() as Record<string, unknown>[];

  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`[apify] No results for "${query}"`);
    return [];
  }

  const seen = new Set<string>();
  const leads: LeadSourceData[] = [];

  for (const item of items) {
    const placeId = item.placeId as string | undefined;
    if (!placeId || seen.has(placeId)) continue;
    seen.add(placeId);

    const toStrArr = (val: unknown) =>
      Array.isArray(val) ? (val as string[]).filter((s) => typeof s === 'string' && s.length > 0) : undefined;

    const emails = toStrArr(item.emails)?.filter((e) => e.includes('@'));

    leads.push({
      businessName: (item.title as string) ?? 'Unknown',
      category: (item.categoryName as string) ?? '',
      address: (item.address as string) ?? '',
      phone: (item.phone as string) ?? undefined,
      websiteUrl: (item.website as string) ?? undefined,
      googleMapsPlaceId: placeId,
      googleRating: item.totalScore != null ? Number(item.totalScore) : undefined,
      googleReviewCount: item.reviewsCount != null ? Number(item.reviewsCount) : undefined,
      emails: emails && emails.length > 0 ? emails : undefined,
      whatsapps: toStrArr(item.whatsapps),
      linkedIns: toStrArr(item.linkedIns),
      instagrams: toStrArr(item.instagrams),
      facebooks: toStrArr(item.facebooks),
      raw: item,
    });
  }

  return leads;
}
