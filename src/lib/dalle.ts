import OpenAI from 'openai';
import { env } from '../config.js';

let _openai: OpenAI | null = null;

function openaiClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Generate an image using DALL-E 3.
 *
 * Returns the CDN URL from OpenAI, or null if OPENAI_API_KEY is absent or the
 * call fails. The URL is temporary (~60 min) per OpenAI policy — for v1 we
 * accept that limitation; a v2 fix would download and host the image on
 * Huntly's static assets or Cloudflare R2 before the proposal is stored.
 *
 * @param size - Image size. Defaults to 1792x1024 (landscape, hero-ready).
 *               Use '1024x1024' for square images (about, services-featured) to halve cost.
 */
export async function generateHeroImage(
  prompt: string,
  size: '1792x1024' | '1024x1024' | '1024x1792' = '1792x1024',
): Promise<{ url: string } | null> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const res = await openaiClient().images.generate({
      model: 'dall-e-3',
      prompt,
      size,
      quality: 'standard',
      n: 1,
    });
    const url = res.data?.[0]?.url ?? null;
    return url ? { url } : null;
  } catch (err) {
    console.warn('[dalle] failed:', (err as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Color mood lookup — shared by all prompt builders                  */
/* ------------------------------------------------------------------ */

const COLOR_MOOD_MAP: Record<string, string> = {
  warmNeutral:       'warm neutral tones, terracotta and beige accents, soft morning light',
  coolNeutral:       'cool crisp tones, navy and white, natural daylight, professional atmosphere',
  forestNeutral:     'natural green tones, soft organic light, earthy and fresh atmosphere',
  rosePaper:         'soft rose and blush tones, gentle warm light, elegant and refined',
  charcoalLuxe:      'rich warm grays, burnished gold accents, dramatic moody lighting',
  oceanProfessional: 'clean aqua and teal tones, bright professional light, fresh atmosphere',
  desertWarm:        'warm amber and sand tones, golden hour light, textured earthy surfaces',
  midnightAccent:    'deep indigo and slate tones, creative studio lighting, modern atmosphere',
};

/**
 * Build a DALL-E 3 prompt for a business hero image.
 * Focuses on interior/exterior spaces — no people, no stock photography clichés.
 * Follows PRODUCT.md anti-references: no smiling professionals facing the camera.
 */
export function buildHeroImagePrompt(
  locationContext: string,
  copyTone: string,
  paletteKey: string,
): string {
  const colorMood = COLOR_MOOD_MAP[paletteKey] ?? 'neutral professional tones, natural light';

  // Extract the core location/vertical context (first sentence or phrase)
  const locationShort = locationContext.split(/[.,]/)[0].trim();

  return `Editorial photograph, ${locationShort}, ${colorMood}, no people, no text, magazine-quality composition, 16:9 landscape orientation, high resolution`;
}

/**
 * Build a DALL-E 3 prompt for the about-section portrait / detail image.
 * Square format (1024x1024), more intimate — a single tool, workspace detail,
 * or textural close-up that communicates the vertical without showing people.
 */
export function buildAboutImagePrompt(
  category: string,
  heroAngle: string,
  paletteKey: string,
): string {
  const colorMood = COLOR_MOOD_MAP[paletteKey] ?? 'neutral professional tones, natural light';
  const verticalShort = category.replace(/_/g, ' ').trim();
  // Pull first key phrase from hero angle (up to 8 words)
  const angleKeywords = heroAngle.split(/[.,]/, 1)[0].trim().split(' ').slice(0, 8).join(' ');

  return `${verticalShort} detail shot, ${angleKeywords}, soft daylight, no people, editorial photography, magazine quality, square format, ${colorMood}`;
}

/**
 * Build a DALL-E 3 prompt for the featured services card image.
 * Atmospheric editorial image tied to the lead's primary service.
 */
export function buildFeaturedServiceImagePrompt(
  serviceQuery: string,
  paletteKey: string,
): string {
  const colorMood = COLOR_MOOD_MAP[paletteKey] ?? 'neutral professional tones, natural light';

  return `${serviceQuery}, professional editorial photography, atmospheric, no people, no text, ${colorMood}, square format, magazine-quality composition`;
}

/**
 * Build a DALL-E 3 prompt for the CTA banner background image.
 * Full-bleed landscape, mood-driven — golden hour, no people, motion implied.
 */
export function buildCtaBannerImagePrompt(
  category: string,
  locationContext: string,
): string {
  const verticalShort = category.replace(/_/g, ' ').trim();
  const locationShort = locationContext.split(/[.,]/)[0].trim();

  return `${verticalShort} workshop or studio atmospheric shot, ${locationShort}, golden hour lighting, no people, motion implied, editorial photography, cinematic, 16:9 landscape, high resolution`;
}
