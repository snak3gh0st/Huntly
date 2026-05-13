import { z } from 'zod';
import { callAIWithProvider } from '../lib/ai.js';
import type { LeadStudy } from './lead-study.service.js';
import type { Strategy } from './lead-strategy.service.js';
import type { VisualSystem } from './visual-system.service.js';

/* ------------------------------------------------------------------ */
/*  Section types the renderer knows how to draw.                      */
/*  Adding more here requires new templates + renderer dispatch cases.  */
/*  Keep this list authoritative.                                       */
/* ------------------------------------------------------------------ */

export const SECTION_TYPES = [
  'hero',
  'about',
  'services',
  'why-us',
  'what-changes',
  'process',
  'testimonials',
  'hours-locations',
  'faq',
  'cta-banner',
  'contact',
] as const;

export type SectionType = typeof SECTION_TYPES[number];

/* ------------------------------------------------------------------ */
/*  Schema                                                              */
/* ------------------------------------------------------------------ */

export const DesignDirectionSchema = z.object({
  sectionsInOrder: z.array(z.object({
    type: z.enum(SECTION_TYPES),
    rationale: z.string().min(1).max(500),
    designNote: z.string().min(1).max(700),
    contentEmphasis: z.string().min(1).max(500),
  })).min(5).max(10),
  microcopyDirection: z.string().min(1).max(700),
  signatureMoves: z.array(z.string().min(1).max(450)).min(2).max(4),
});

export type DesignDirection = z.infer<typeof DesignDirectionSchema>;

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                 */
/* ------------------------------------------------------------------ */

function buildDesignDirectionSystemPrompt(): string {
  return `You are a senior web designer at a top boutique studio (think Pentagram, Wieden+Kennedy Digital, Locomotive). You have been briefed on a small business and asked to plan the website at the level of detail you would produce in a Figma exploration document.

You will receive a Study (Layer 1 — analysis of their current site + their voice + their business), a Strategy (Layer 2 — hero angle + copy tone + conversion opportunities), and a Visual System (palette + font pairing chosen for this lead).

Your job is the section plan, the design notes per section, and the signature moves that will make this site memorable.

Output strict JSON matching the schema. Specifically:

- sectionsInOrder: 5-10 sections in the order they should appear on the rendered page.
  Available section types:
  - hero: opening statement + image + CTA
  - about: short paragraph about the business (target ~100 words)
  - services: 4-8 services with optional service-detail expansion
  - why-us: 2-4 unique-position points from the Study's uniqueAngles
  - what-changes: the gap to fix list from Strategy's conversionOpportunities
  - process: 3-5 step methodology / how-we-work
  - testimonials: 0-4 quotes pulled from real review data
  - hours-locations: address + hours table (when business has location info)
  - faq: 3-6 Q&A pairs answering common customer questions
  - cta-banner: mid-page banner with a single CTA to break density
  - contact: full contact card + map

  Every section's rationale must reference a specific signal from the Study or Strategy. Every designNote must be specific ("asymmetric two-col grid, text-left bleeds below the image column, 80vh") not generic ("clean layout"). Every contentEmphasis says what the section should emphasize for THIS lead.

- microcopyDirection: 2-3 sentences on the voice for buttons / labels / hover messages. Concrete and lead-specific. Bans: "Get started", "Learn more", "Click here", generic CTAs unless meaningfully reframed.

- signatureMoves: 2-4 specific design moves that will make this site memorable. NOT abstract ("be bold"); specific ("oversized Fraunces 400 italic running counter to a 900 sans display in the hero", "service titles set in display-scale with their numbers and titles on alternate lines"). These are the moments a senior designer would polish until 2am.

Rules:
- Skip sections that do not have data. If the lead has no reviews, omit testimonials. If no hours/locations are known, omit hours-locations. Recommend exactly the sections this lead earns.
- Order sections by conversion path: hero to trust signals (about, why-us, testimonials) to information depth (services, process, faq) to conversion (what-changes, cta-banner, contact). Adapt order per lead — not template.
- NO clichés in microcopy direction or signature moves.
- If the lead has testimonials in the Study voice.customerLanguage, include testimonials in the plan. If the lead has an address, include hours-locations only if the Study also shows some evidence of regular hours or location-specific copy.
- The hero section must always be first.
- The contact section must always be last in the section plan (before the sales chrome which is not controlled by sectionsInOrder).
- services is required in every plan (the footer always needs it).
- Return ONLY the JSON object. No markdown. No prose around the JSON. No comments.

Schema:
{
  "sectionsInOrder": [
    {
      "type": string (one of the available section types above),
      "rationale": string (<=300 chars, specific signal from Study/Strategy),
      "designNote": string (<=400 chars, specific visual treatment),
      "contentEmphasis": string (<=300 chars, what content should fill it for THIS lead)
    }
  ],
  "microcopyDirection": string (<=400 chars),
  "signatureMoves": string[] (2-4 items, each <=220 chars)
}`;
}

function buildDesignDirectionUserPrompt(
  study: LeadStudy,
  strategy: Strategy,
  visualSystem: VisualSystem,
): string {
  return `=== STUDY (Layer 1) ===
${JSON.stringify(study, null, 2)}

=== STRATEGY (Layer 2) ===
${JSON.stringify(strategy, null, 2)}

=== VISUAL SYSTEM (Layer 2.5) ===
Palette: ${visualSystem.paletteKey}
Font pairing: ${visualSystem.fontKey}
Reasoning: ${visualSystem.reasoning}`;
}

/* ------------------------------------------------------------------ */
/*  Parse + validate helper                                            */
/* ------------------------------------------------------------------ */

function parseAndValidate(
  raw: string,
): { ok: true; value: DesignDirection } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const result = DesignDirectionSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.message };
}

/* ------------------------------------------------------------------ */
/*  Layer 2.7 — designDirection (between Visual System and Build)      */
/* ------------------------------------------------------------------ */

export async function designDirection(
  study: LeadStudy,
  strategy: Strategy,
  visualSystem: VisualSystem,
): Promise<DesignDirection> {
  const systemPrompt = buildDesignDirectionSystemPrompt();
  const userPrompt = buildDesignDirectionUserPrompt(study, strategy, visualSystem);

  const raw = await callAIWithProvider('anthropic', { systemPrompt, userPrompt, json: true });
  const first = parseAndValidate(raw);
  if (first.ok) return first.value;

  // One retry on validation failure
  const correctiveRaw = await callAIWithProvider('anthropic', {
    systemPrompt: `${systemPrompt}\n\nIMPORTANT: Your previous response failed validation: ${first.error}. Return ONLY valid JSON matching the schema exactly.`,
    userPrompt,
    json: true,
  });
  const second = parseAndValidate(correctiveRaw);
  if (second.ok) return second.value;

  throw new Error(`Design direction failed validation twice: ${second.error}`);
}
