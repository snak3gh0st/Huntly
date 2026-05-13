import { env } from '../config.js';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface UnsplashPhoto {
  url: string;           // urls.regular
  alt: string;           // alt_description, fallback to description
  attribution: string;   // "Photo by {user.name} on Unsplash"
  attributionUrl: string; // user.links.html
}

/* ------------------------------------------------------------------ */
/*  Vertical fallback queries                                           */
/* ------------------------------------------------------------------ */

export const VERTICAL_FALLBACK_QUERY: Record<string, string> = {
  dental_clinic:   'modern dental office',
  med_spa:         'modern medical spa interior',
  veterinary:      'modern veterinary clinic',
  law_firm:        'modern law office interior',
  real_estate:     'modern real estate office',
  restaurant:      'restaurant dining room interior',
  auto_service:    'auto repair shop',
  fitness_studio:  'modern fitness studio',
  accountant:      'modern accounting office',
  _default:        'modern professional office',
};

/* ------------------------------------------------------------------ */
/*  In-memory cache (24-h TTL — acceptable for dev/staging volume)     */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  photo: UnsplashPhoto;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Fetch helper                                                        */
/* ------------------------------------------------------------------ */

async function searchUnsplash(query: string): Promise<UnsplashPhoto | null> {
  const accessKey = env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;

  let data: unknown;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const results = (data as { results?: unknown[] }).results;
  if (!Array.isArray(results) || results.length === 0) return null;

  const photo = results[0] as {
    urls?: { regular?: string };
    alt_description?: string | null;
    description?: string | null;
    user?: { name?: string; links?: { html?: string } };
  };

  const photoUrl = photo.urls?.regular;
  if (!photoUrl) return null;

  const alt =
    photo.alt_description ||
    photo.description ||
    `Photo related to ${query}`;

  const userName = photo.user?.name ?? 'Photographer';
  const userUrl  = photo.user?.links?.html ?? 'https://unsplash.com';

  return {
    url: photoUrl,
    alt,
    attribution: `Photo by ${userName} on Unsplash`,
    attributionUrl: userUrl,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetch one landscape photo from Unsplash matching `query`.
 *
 * Falls back in order:
 *   1. Cache hit (24-h TTL)
 *   2. Primary query search
 *   3. Vertical fallback query search
 *   4. null  (caller renders CSS-only hero)
 *
 * Never throws — all errors return null so the renderer degrades
 * gracefully without crashing a proposal generation.
 */
export async function fetchUnsplash(
  query: string,
  vertical?: string,
): Promise<UnsplashPhoto | null> {
  // 1. Cache hit
  const cached = cache.get(query);
  if (cached && Date.now() < cached.expiresAt) return cached.photo;

  // 2. Primary search
  const primary = await searchUnsplash(query);
  if (primary) {
    cache.set(query, { photo: primary, expiresAt: Date.now() + TTL_MS });
    return primary;
  }

  // 3. Vertical fallback
  const fallbackQuery = vertical
    ? (VERTICAL_FALLBACK_QUERY[vertical] ?? VERTICAL_FALLBACK_QUERY['_default']!)
    : VERTICAL_FALLBACK_QUERY['_default']!;

  if (fallbackQuery === query) return null; // avoid duplicate request

  const fallbackCached = cache.get(fallbackQuery);
  if (fallbackCached && Date.now() < fallbackCached.expiresAt) return fallbackCached.photo;

  const fallback = await searchUnsplash(fallbackQuery);
  if (fallback) {
    cache.set(fallbackQuery, { photo: fallback, expiresAt: Date.now() + TTL_MS });
    return fallback;
  }

  return null;
}
