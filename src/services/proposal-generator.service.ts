import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Icon set — must match inline SVGs in templates                     */
/* ------------------------------------------------------------------ */

export const ICON_NAMES = [
  'phone',
  'calendar',
  'globe',
  'message',
  'clock',
  'star',
  'shield',
  'zap',
  'mail',
  'mapPin',
] as const;

export type IconName = typeof ICON_NAMES[number];

/* ------------------------------------------------------------------ */
/*  Site content schema (Claude output contract)                       */
/* ------------------------------------------------------------------ */

const IconSchema = z.enum(ICON_NAMES);

export const SiteContentSchema = z.object({
  brand: z.object({
    tagline:     z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    manifesto:   z.string().min(1).max(220).optional(),
  }),
  hero: z.object({
    imageQuery: z.string().min(1).max(80),
    ctaLabel:   z.string().min(1).max(40),
    ctaAction:  z.enum(['call', 'email', 'scroll-to-form']),
  }),
  stats: z.object({
    showRating:      z.boolean(),
    showReviewCount: z.boolean(),
  }).nullable(),
  services: z.array(z.object({
    icon:        IconSchema,
    title:       z.string().min(1).max(80),
    description: z.string().min(1).max(320),
  })).min(4).max(8),
  testimonials: z.array(z.object({
    quote:       z.string().min(1).max(400),
    attribution: z.string().min(1).max(120),
  })).max(4),
  contact: z.object({
    headline: z.string().min(1).max(60),
    address:  z.string().nullable(),
    phone:    z.string().nullable(),
    whatsapp: z.string().nullable(),
    hours:    z.string().nullable(),
  }),
  // proposalIntro is intentionally optional — the visible template no longer
  // renders it (the draft-preview banner replaced "Hi [team]..." framing).
  // Kept in the schema for backward compat with stored proposals; Claude is
  // instructed to omit it.
  proposalIntro: z.object({
    salutation: z.string().min(1).max(120),
    pitch:      z.string().min(1).max(1000),
  }).optional(),
  diagnosis: z.object({
    bullets: z.array(z.object({
      icon:     IconSchema,
      label:    z.string().min(1).max(120),
      evidence: z.string().min(1).max(320),
    })).min(2).max(5),
  }),
  pricingPitch: z.object({
    headline:     z.string().min(1).max(160),
    valueBullets: z.array(z.string().min(1).max(160)).min(2).max(4),
  }),
  cta: z.object({
    primaryLabel: z.string().min(1).max(40),
    reassurance:  z.string().min(1).max(120),
  }),
});

export type SiteContent = z.infer<typeof SiteContentSchema>;

import { callAIWithProvider } from '../lib/ai.js';
import type { LeadStudy } from './lead-study.service.js';
import type { Strategy } from './lead-strategy.service.js';

/* ------------------------------------------------------------------ */
/*  Generator input                                                    */
/* ------------------------------------------------------------------ */

export interface GeneratorInput {
  businessName: string;
  category: string;
  region: string;
  websiteUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  hasChatbot?: boolean | null;
  hasOnlineBooking?: boolean | null;
  hasWhatsapp?: boolean | null;
  ownerName?: string;
  painSignals: Array<{ signal: string; count: number; example: string }>;
  reviewSentimentSummary?: string;
  personalizedHook?: string;
  /** Free-form note the operator typed when clicking Generate. */
  operatorNotes?: string;
}

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(study?: LeadStudy, strategy?: Strategy): string {
  const studyStrategySection = (study && strategy) ? `

=== STUDY AND STRATEGY PROVIDED ===
You have been given a structured Study (Layer 1) and Strategy (Layer 2) for this lead.
Study summary:
- Current site has website: ${study.currentSite.hasWebsite}
- Design assessment: ${study.currentSite.designAssessment}
- Key weaknesses: ${study.currentSite.weaknesses.join('; ')}
- Missing features: ${study.currentSite.missingFeatures.join('; ')}
- Copy tone now: ${study.currentSite.copyToneNow}
- Actual services: ${study.business.actualServices.join(', ')}
- Target customers: ${study.business.targetCustomers}
- Unique angles: ${study.business.uniqueAngles.join('; ')}
- Location context: ${study.business.locationContext}
- Customer language: ${study.voice.customerLanguage.join('; ')}
- Key pain points: ${study.voice.keyPainPoints.join('; ')}
- Key aspirations: ${study.voice.keyAspirations.join('; ')}

Strategy summary:
- Hero angle: ${strategy.heroAngle}
- Copy tone: ${strategy.copyTone}
- Manifesto seed: ${strategy.manifestoSeed}
- Design priorities: ${strategy.designPriorities.join('; ')}
- Conversion opportunities: ${strategy.conversionOpportunities.map((c) => `[${c.gap}] → [${c.fix}]`).join('; ')}` : '';

  return `You are a senior B2B web designer drafting a real one-page website for a small business in the United States.${studyStrategySection}

Output STRICT JSON ONLY, matching this exact schema. No markdown. No prose around the JSON. No comments.

Schema:
{
  "brand": { "tagline": string<=120, "description": string<=500, "manifesto": string<=220 },
  "hero": { "imageQuery": string<=80, "ctaLabel": string<=40, "ctaAction": "call"|"email"|"scroll-to-form" },
  "stats": { "showRating": boolean, "showReviewCount": boolean } | null,
  "services": [ { "icon": IconName, "title": string<=80, "description": string<=320 } ]   // 4 to 8 items
  "testimonials": [ { "quote": string<=400, "attribution": string<=120 } ]                 // 0 to 4 items
  "contact": { "headline": string<=60, "address": string|null, "phone": string|null, "whatsapp": string|null, "hours": string|null },
  "proposalIntro": OMIT THIS FIELD (legacy, no longer rendered — saves your output budget)
  "diagnosis": { "bullets": [ { "icon": IconName, "label": string<=120, "evidence": string<=320 } ] },  // 2 to 5
  "pricingPitch": { "headline": string<=160, "valueBullets": [ string<=160 ] },                          // 2 to 4 bullets
  "cta": { "primaryLabel": string<=40, "reassurance": string<=120 }
}

Where IconName is one of: phone, calendar, globe, message, clock, star, shield, zap, mail, mapPin.

Rules:
1. PRICING MODEL — this proposal sells a one-time bundle: implementation plus 12 months hosting/maintenance, paid as a single payment. Do NOT use the phrases "per month", "subscription", "monthly billing", "recurring", "annual fee". Frame the pricing copy as "a one-time investment" or "the year-one package".
2. SERVICES describe what the BUSINESS does (e.g. "Sedation dentistry", "Same-day crowns"), not what Huntly or any vendor does for them.
3. DIAGNOSIS describes what is broken about the business's current online presence (e.g. "No online booking — 5 reviewers asked for it"). Tie each bullet to evidence from the data provided.
4. TESTIMONIALS may quote ONLY snippets that appear in the data you are given. NEVER fabricate. If no review snippets are provided, return an empty testimonials array.
5. CONTACT fields use null (not empty string) when unknown.
6. LANGUAGE — English only.
7. NEVER make medical, legal, financial, or other regulated-industry claims (no "best dentist", no "guaranteed weight loss", no "results guaranteed").
8. Keep tone confident and specific. Avoid generic web-design fluff.
9. COPY BANS (per project anti-references — these are the single fastest tell that a page was templated):
   - No generic affirmation phrases. Forbidden: "your trusted partner", "committed to excellence", "we go above and beyond", "passionate about", "dedicated to providing", "second to none", "your one-stop shop", "the difference is in the details".
   - No fabricated trust signals. Forbidden: "trusted by thousands", "X+ happy customers", "since 19XX" unless that year appears in the data, "5-star rated" unless their actual Google rating is provided and is 5.0.
   - No SaaS triplet copy. Forbidden: "simple. powerful. modern.", "fast. reliable. affordable.", any three-word stacked tagline with periods.
   - No em-dashes (—) or double hyphens (--). Use commas, colons, semicolons, periods, or parentheses.
   - No "the future of [vertical]" framing.
10. SPECIFIC OVER GENERIC — every line of copy must tie to a concrete signal in the lead's data: their actual review quotes, their actual service category, their actual location, their actual rating. If you cannot ground a line in real data, cut it. A line that could apply to any business in this category is wrong.
11. CHARACTER LIMITS ARE HARD CONSTRAINTS. Every \`string<=N\` in the schema is enforced by validation — exceeding N causes the entire response to be rejected and rewritten. If a field would naturally exceed its limit, CONDENSE it: cut connective tissue, drop a sub-clause, trim adjectives. Do this BEFORE returning the JSON, not after. NEVER return a field that exceeds its limit. Count characters carefully on the longest fields (\`description\`, \`pitch\`, \`evidence\`).
12. HERO IMAGE QUERY — \`hero.imageQuery\` is a 2-5 word search phrase for Unsplash, specific to the business's vertical AND location when possible. Good examples: "modern dental office Austin", "Italian restaurant kitchen", "law firm conference room". Avoid people-focused queries (no "smiling dentist", no "happy customer"). Aim for interior/exterior spaces, tools of the trade, or professional environments.
13. CTA ACTION — \`hero.ctaAction\` is one of:
    - "call" if the business has a phone number AND the vertical is one where calling is the natural action (medical, legal, home services, auto, restaurants for reservations)
    - "email" if email is the natural primary channel (B2B services, consultants, freelancers)
    - "scroll-to-form" for everything else — scrolls to the accept form
    The \`ctaLabel\` should match: "Call Now", "Book Appointment", "Get a Quote", etc.
14. STATS STRIP — set \`stats: null\` if Google rating < 4.0 OR review count < 25 (not impressive enough to lead with). Otherwise set \`{"showRating": true, "showReviewCount": true}\` — both render together as a star rating strip.
15. BRAND.MANIFESTO — a single powerful sentence (max 220 chars) that captures the core brand promise. It is different from the tagline (tagline is punchy/short; manifesto is the deeper why). When a Strategy is provided, crystallize the Strategy's manifestoSeed into this field. When no Strategy is provided, derive it from the business's strongest unique angle. Never use clichés.
18. STUDY + STRATEGY ARE THE FOUNDATION. When a Study and Strategy are provided (see the section above), EVERY field you generate must trace back to these documents:
    - \`brand.tagline\` and \`brand.description\` must reflect the Strategy's \`heroAngle\` and copyTone.
    - \`brand.manifesto\` must crystallize the Strategy's \`manifestoSeed\` into one strong sentence.
    - \`diagnosis.bullets\` must come from the Study's \`currentSite.weaknesses\` and Strategy's \`conversionOpportunities.gap\`. Each bullet's \`evidence\` is the customer language or specific gap, not generic.
    - \`services\` must come from the Study's \`business.actualServices\` — these are the lead's REAL services as evidenced by their site/reviews, not invented.
    - \`testimonials\` may include short snippets from the Study's \`voice.customerLanguage\` arrays.
    - \`hero.eyebrow\` references the Study's \`business.locationContext\`.
    - If the Study says \`currentSite.hasWebsite: false\`, the diagnosis bullets focus on the absence of a site rather than its weaknesses.
    If a field cannot be grounded in the Study/Strategy, cut it or set it to an array's minimum allowed length. Never fabricate.

Return ONLY the JSON object.`;
}

export function buildUserPrompt(input: GeneratorInput, study?: LeadStudy, strategy?: Strategy): string {
  const lines: string[] = [];
  lines.push(`Business: ${input.businessName}`);
  lines.push(`Category: ${input.category}`);
  lines.push(`Region: ${input.region}`);
  if (input.websiteUrl) lines.push(`Website: ${input.websiteUrl}`);
  if (input.ownerName) lines.push(`Owner: ${input.ownerName}`);

  const reviews = input.googleReviewCount ?? 0;
  const rating = input.googleRating ?? null;
  lines.push(`Google: ${rating ?? 'N/A'} stars, ${reviews} reviews`);

  lines.push(`Has chatbot: ${input.hasChatbot ?? 'unknown'}`);
  lines.push(`Has online booking: ${input.hasOnlineBooking ?? 'unknown'}`);
  lines.push(`Has WhatsApp: ${input.hasWhatsapp ?? 'unknown'}`);

  if (input.reviewSentimentSummary) {
    lines.push(`Review sentiment: ${input.reviewSentimentSummary}`);
  }

  if (input.painSignals.length > 0) {
    lines.push('Pain signals:');
    for (const p of input.painSignals) {
      lines.push(`  - ${p.signal} (${p.count}x): "${p.example}"`);
    }
  } else {
    lines.push('Pain signals: none detected');
  }

  if (input.personalizedHook) {
    lines.push(`Earlier qualifier hook: ${input.personalizedHook}`);
  }

  if (input.operatorNotes && input.operatorNotes.trim() !== '') {
    lines.push(`Operator notes: ${input.operatorNotes.trim()}`);
  }

  if (study) {
    lines.push('');
    lines.push('=== STUDY (Layer 1 — full JSON) ===');
    lines.push(JSON.stringify(study, null, 2));
  }

  if (strategy) {
    lines.push('');
    lines.push('=== STRATEGY (Layer 2 — full JSON) ===');
    lines.push(JSON.stringify(strategy, null, 2));
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

export async function generateSiteContent(
  input: GeneratorInput,
  study?: LeadStudy,
  strategy?: Strategy,
): Promise<SiteContent> {
  const raw = await callAIWithProvider('anthropic', {
    systemPrompt: buildSystemPrompt(study, strategy),
    userPrompt: buildUserPrompt(input, study, strategy),
    json: true,
  });

  const parsed = parseAndValidate(raw);
  if (parsed.ok) return parsed.value;

  // First validation failure — retry once with a corrective system message
  const correctiveRaw = await callAIWithProvider('anthropic', {
    systemPrompt: `${buildSystemPrompt(study, strategy)}\n\nIMPORTANT: Your previous response failed validation: ${parsed.error}. Return ONLY valid JSON matching the schema exactly.`,
    userPrompt: buildUserPrompt(input, study, strategy),
    json: true,
  });

  const retried = parseAndValidate(correctiveRaw);
  if (retried.ok) return retried.value;

  throw new Error(`Proposal generation failed validation twice: ${retried.error}`);
}

function parseAndValidate(
  raw: string,
): { ok: true; value: SiteContent } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const parsed = SiteContentSchema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}
