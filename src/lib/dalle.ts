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
 * Generate a hero image for a proposal using DALL-E 3.
 *
 * Returns the CDN URL from OpenAI, or null if OPENAI_API_KEY is absent or the
 * call fails. The URL is temporary (~60 min) per OpenAI policy — for v1 we
 * accept that limitation; a v2 fix would download and host the image on
 * Huntly's static assets or Cloudflare R2 before the proposal is stored.
 */
export async function generateHeroImage(prompt: string): Promise<{ url: string } | null> {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const res = await openaiClient().images.generate({
      model: 'dall-e-3',
      prompt,
      size: '1792x1024', // landscape, hero-ready
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
  // Map palette key to color mood description for DALL-E
  const colorMoodMap: Record<string, string> = {
    warmNeutral:       'warm neutral tones, terracotta and beige accents, soft morning light',
    coolNeutral:       'cool crisp tones, navy and white, natural daylight, professional atmosphere',
    forestNeutral:     'natural green tones, soft organic light, earthy and fresh atmosphere',
    rosePaper:         'soft rose and blush tones, gentle warm light, elegant and refined',
    charcoalLuxe:      'rich warm grays, burnished gold accents, dramatic moody lighting',
    oceanProfessional: 'clean aqua and teal tones, bright professional light, fresh atmosphere',
    desertWarm:        'warm amber and sand tones, golden hour light, textured earthy surfaces',
    midnightAccent:    'deep indigo and slate tones, creative studio lighting, modern atmosphere',
  };

  const colorMood = colorMoodMap[paletteKey] ?? 'neutral professional tones, natural light';

  // Extract the core location/vertical context (first sentence or phrase)
  const locationShort = locationContext.split(/[.,]/)[0].trim();

  return `Editorial photograph, ${locationShort}, ${colorMood}, no people, no text, magazine-quality composition, 16:9 landscape orientation, high resolution`;
}
