import { z } from 'zod';
import { callAIWithProvider } from '../lib/ai.js';
import type { LeadStudy } from './lead-study.service.js';
import type { Strategy } from './lead-strategy.service.js';

/* ------------------------------------------------------------------ */
/*  Curated palettes — Claude picks ONE                                */
/*  Each is an OKLCH-compatible scheme; all tokens follow DESIGN.md    */
/* ------------------------------------------------------------------ */

export const PALETTES = {
  /** Default warm neutral with terracotta accent */
  warmNeutral:         { bg: 'oklch(0.985 0.005 60)',  surface: 'oklch(0.965 0.007 65)',  border: 'oklch(0.905 0.010 65)',  ink: 'oklch(0.22 0.015 50)',  accent: 'oklch(0.62 0.16 35)' },
  /** Cool neutral with navy accent */
  coolNeutral:         { bg: 'oklch(0.985 0.003 240)', surface: 'oklch(0.96 0.006 240)',  border: 'oklch(0.90 0.008 240)',  ink: 'oklch(0.22 0.02 240)',  accent: 'oklch(0.58 0.18 235)' },
  /** Forest green tones */
  forestNeutral:       { bg: 'oklch(0.98 0.006 130)',  surface: 'oklch(0.955 0.008 130)', border: 'oklch(0.895 0.012 130)', ink: 'oklch(0.22 0.015 130)', accent: 'oklch(0.50 0.13 145)' },
  /** Muted rose */
  rosePaper:           { bg: 'oklch(0.985 0.005 20)',  surface: 'oklch(0.96 0.008 20)',   border: 'oklch(0.90 0.012 20)',   ink: 'oklch(0.22 0.015 20)',  accent: 'oklch(0.52 0.18 15)' },
  /** Burnished gold */
  charcoalLuxe:        { bg: 'oklch(0.97 0.004 80)',   surface: 'oklch(0.94 0.006 80)',   border: 'oklch(0.85 0.008 80)',   ink: 'oklch(0.18 0.012 80)',  accent: 'oklch(0.55 0.14 60)' },
  /** Ocean teal */
  oceanProfessional:   { bg: 'oklch(0.985 0.004 200)', surface: 'oklch(0.95 0.007 200)',  border: 'oklch(0.88 0.010 200)',  ink: 'oklch(0.20 0.018 220)', accent: 'oklch(0.58 0.15 215)' },
  /** Warm sand */
  desertWarm:          { bg: 'oklch(0.97 0.007 70)',   surface: 'oklch(0.94 0.010 70)',   border: 'oklch(0.88 0.013 70)',   ink: 'oklch(0.22 0.015 50)',  accent: 'oklch(0.62 0.17 50)' },
  /** Electric indigo */
  midnightAccent:      { bg: 'oklch(0.97 0.005 250)',  surface: 'oklch(0.93 0.010 250)',  border: 'oklch(0.85 0.012 250)',  ink: 'oklch(0.16 0.020 260)', accent: 'oklch(0.50 0.20 270)' },
} as const;

export type PaletteKey = keyof typeof PALETTES;
const PALETTE_KEYS = Object.keys(PALETTES) as [PaletteKey, ...PaletteKey[]];

/* ------------------------------------------------------------------ */
/*  Curated font pairings — Claude picks ONE                           */
/*  Each font must be loadable from Google Fonts                       */
/* ------------------------------------------------------------------ */

export const FONT_PAIRINGS = {
  /** Humanist serif + geometric sans — the current default */
  fraunces_inter:        { display: 'Fraunces', body: 'Inter' },
  /** Old-style editorial + geometric sans */
  cormorant_dmsans:      { display: 'Cormorant Garamond', body: 'DM Sans' },
  /** Trustworthy matching serif + sans from Adobe */
  sourceSerif_sourceSans:{ display: 'Source Serif 4', body: 'Source Sans 3' },
  /** Approachable editorial + modern friendly sans */
  newsreader_outfit:     { display: 'Newsreader', body: 'Outfit' },
  /** Luxury high-contrast serif + utilitarian sans */
  playfair_workSans:     { display: 'Playfair Display', body: 'Work Sans' },
  /** Grounded slab + neutral humanist sans */
  domine_notoSans:       { display: 'Domine', body: 'Noto Sans' },
} as const;

export type FontPairingKey = keyof typeof FONT_PAIRINGS;
const FONT_PAIRING_KEYS = Object.keys(FONT_PAIRINGS) as [FontPairingKey, ...FontPairingKey[]];

/* ------------------------------------------------------------------ */
/*  Schema + type                                                       */
/* ------------------------------------------------------------------ */

export const VisualSystemSchema = z.object({
  paletteKey: z.enum(PALETTE_KEYS),
  fontKey:    z.enum(FONT_PAIRING_KEYS),
  reasoning:  z.string().min(1).max(400),
});

export type VisualSystem = z.infer<typeof VisualSystemSchema>;

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                 */
/* ------------------------------------------------------------------ */

function buildVisualSystemPrompt(): string {
  const paletteList = (Object.entries(PALETTES) as [PaletteKey, (typeof PALETTES)[PaletteKey]][])
    .map(([key, p]) => `  "${key}": accent=${p.accent} — ${paletteDescription(key)}`)
    .join('\n');

  const fontList = (Object.entries(FONT_PAIRINGS) as [FontPairingKey, (typeof FONT_PAIRINGS)[FontPairingKey]][])
    .map(([key, f]) => `  "${key}": display=${f.display} + body=${f.body} — ${fontDescription(key)}`)
    .join('\n');

  return `You are picking the visual system (color palette + font pairing) for a small US business website.

Given the Study and Strategy for the lead, pick ONE palette and ONE font pairing that best match the business's vertical, target customers, location, and brand personality. Avoid the obvious first reflex — e.g. don't pick warmNeutral for a dental clinic just because it's the default. Pick the combo that makes this specific business feel like it belongs in its context.

Available palettes:
${paletteList}

Available font pairings:
${fontList}

Output STRICT JSON ONLY:
{
  "paletteKey": string,  // one of the palette keys above
  "fontKey": string,     // one of the font pairing keys above
  "reasoning": string    // <=400 chars: why this combo fits this specific business
}

Return ONLY the JSON object. No markdown. No prose.`;
}

function paletteDescription(key: PaletteKey): string {
  const map: Record<PaletteKey, string> = {
    warmNeutral:       'warm beige paper, terracotta accent — approachable, home-service, wellness',
    coolNeutral:       'cool off-white, navy accent — professional services, B2B, law, finance',
    forestNeutral:     'green-tinted neutrals, forest green accent — landscaping, vet, outdoors, health',
    rosePaper:         'blush paper, muted rose accent — beauty, spa, boutique, wedding, women-led brands',
    charcoalLuxe:      'warm gray, burnished gold accent — luxury services, jewelry, high-end hospitality',
    oceanProfessional: 'cool aqua neutrals, teal accent — medical, tech, clean-room, coastal',
    desertWarm:        'warm sand base, amber accent — Southwest, restaurant, artisan, construction',
    midnightAccent:    'soft indigo neutrals, electric indigo accent — creative studios, nightlife, tech-forward',
  };
  return map[key];
}

function fontDescription(key: FontPairingKey): string {
  const map: Record<FontPairingKey, string> = {
    fraunces_inter:        'humanist variable serif + geometric sans — warm, versatile, current default',
    cormorant_dmsans:      'old-style editorial serif + friendly geometric sans — sophisticated, editorial, premium',
    sourceSerif_sourceSans:'trustworthy transitional serif + matching humanist sans — professional, credible, pairs cleanly',
    newsreader_outfit:     'approachable editorial serif + modern rounded sans — local, accessible, community-focused',
    playfair_workSans:     'high-contrast luxury serif + utilitarian sans — luxury, law firms, high-end hospitality',
    domine_notoSans:       'grounded slab serif + neutral humanist sans — trades, construction, straightforward services',
  };
  return map[key];
}

function buildVisualSystemUserPrompt(study: LeadStudy, strategy: Strategy): string {
  return `=== STUDY ===
${JSON.stringify(study, null, 2)}

=== STRATEGY ===
${JSON.stringify(strategy, null, 2)}`;
}

/* ------------------------------------------------------------------ */
/*  Parse + validate helper                                            */
/* ------------------------------------------------------------------ */

function parseAndValidate(
  raw: string,
): { ok: true; value: VisualSystem } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const result = VisualSystemSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.message };
}

/* ------------------------------------------------------------------ */
/*  pickVisualSystem — single Sonnet call (small, cheap)              */
/* ------------------------------------------------------------------ */

export async function pickVisualSystem(study: LeadStudy, strategy: Strategy): Promise<VisualSystem> {
  const systemPrompt = buildVisualSystemPrompt();
  const userPrompt = buildVisualSystemUserPrompt(study, strategy);

  const raw = await callAIWithProvider('anthropic', { systemPrompt, userPrompt, json: true });
  const first = parseAndValidate(raw);
  if (first.ok) return first.value;

  const correctiveRaw = await callAIWithProvider('anthropic', {
    systemPrompt: `${systemPrompt}\n\nIMPORTANT: Your previous response failed validation: ${first.error}. Return ONLY valid JSON matching the schema.`,
    userPrompt,
    json: true,
  });
  const second = parseAndValidate(correctiveRaw);
  if (second.ok) return second.value;

  // Fall back to default visual system rather than crashing the proposal
  console.warn('[visual-system] both attempts failed, falling back to defaults');
  return { paletteKey: 'warmNeutral', fontKey: 'fraunces_inter', reasoning: 'fallback' };
}

/* ------------------------------------------------------------------ */
/*  CSS injection helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Build a Google Fonts URL for the chosen font pairing.
 * Fraunces requires optical-size + italic axes; other fonts use weight only.
 */
export function buildGoogleFontsHref(fontKey: FontPairingKey): string {
  const pair = FONT_PAIRINGS[fontKey];

  // Special handling for fonts that need specific axes
  const displayParam = buildFontParam(pair.display);
  const bodyParam = buildFontParam(pair.body);

  return `https://fonts.googleapis.com/css2?${displayParam}&${bodyParam}&display=swap`;
}

function buildFontParam(fontName: string): string {
  const encoded = encodeURIComponent(fontName);
  switch (fontName) {
    case 'Fraunces':
      return `family=Fraunces:opsz,ital,wght@9..144,0,400;9..144,0,600;9..144,1,400;9..144,1,600`;
    case 'Cormorant Garamond':
      return `family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600`;
    case 'Playfair Display':
      return `family=Playfair+Display:ital,wght@0,400;0,700;1,400`;
    case 'Newsreader':
      return `family=Newsreader:opsz,ital,wght@6..72,0,400;6..72,0,600;6..72,1,400`;
    case 'Source Serif 4':
      return `family=Source+Serif+4:opsz,wght@8..60,400;8..60,600`;
    case 'Domine':
      return `family=Domine:wght@400;700`;
    case 'Inter':
      return `family=Inter:wght@400;500;600`;
    case 'DM Sans':
      return `family=DM+Sans:wght@400;500;600`;
    case 'Source Sans 3':
      return `family=Source+Sans+3:wght@400;500;600`;
    case 'Outfit':
      return `family=Outfit:wght@400;500;600`;
    case 'Work Sans':
      return `family=Work+Sans:wght@400;500;600`;
    case 'Noto Sans':
      return `family=Noto+Sans:wght@400;500;600`;
    default:
      return `family=${encoded}:wght@400;500;600`;
  }
}

/**
 * Build the inline CSS style override block.
 * Redefines palette color tokens and font variables in :root.
 * Also derives --ink-muted and --ink-quiet from the palette's ink and accent.
 */
export function buildVisualSystemCss(vs: VisualSystem): string {
  const palette = PALETTES[vs.paletteKey];
  const fonts = FONT_PAIRINGS[vs.fontKey];

  // Derive ink-muted and ink-quiet from the ink hue/chroma, lightened
  // We use a simple fixed offset that works across all palettes:
  // ink-muted is 45% lightness at same hue, ink-quiet is 62% lightness
  // Parse ink OKLCH to extract hue (last number)
  const inkMatch = palette.ink.match(/oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)/);
  const inkHue = inkMatch ? inkMatch[1] : '50';
  const inkChromaMatch = palette.ink.match(/oklch\([\d.]+\s+([\d.]+)/);
  const inkChroma = inkChromaMatch ? (parseFloat(inkChromaMatch[1]) * 0.85).toFixed(3) : '0.013';

  const lines = [
    `:root {`,
    `  --bg:           ${palette.bg};`,
    `  --surface:      ${palette.surface};`,
    `  --border:       ${palette.border};`,
    `  --ink:          ${palette.ink};`,
    `  --ink-muted:    oklch(0.45 ${inkChroma} ${inkHue});`,
    `  --ink-quiet:    oklch(0.62 ${(parseFloat(inkChroma) * 0.65).toFixed(3)} ${inkHue});`,
    `  --accent:       ${palette.accent};`,
    `  --accent-quiet: oklch(0.92 0.04 ${palette.accent.match(/oklch\([^)]+\s+([\d.]+)\)/)?.[1] ?? '35'});`,
    `  --font-display: '${fonts.display}', serif;`,
    `  --font-body:    '${fonts.body}', ui-sans-serif, system-ui, sans-serif;`,
    `}`,
  ];

  return lines.join('\n');
}
