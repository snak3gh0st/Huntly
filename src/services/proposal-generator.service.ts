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
  proposalIntro: z.object({
    salutation: z.string().min(1).max(120),
    pitch:      z.string().min(1).max(1000),
  }),
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

export function buildSystemPrompt(): string {
  return `You are a senior B2B web designer drafting a real one-page website for a small business in the United States.

Output STRICT JSON ONLY, matching this exact schema. No markdown. No prose around the JSON. No comments.

Schema:
{
  "brand": { "tagline": string<=120, "description": string<=500 },
  "hero": { "imageQuery": string<=80, "ctaLabel": string<=40, "ctaAction": "call"|"email"|"scroll-to-form" },
  "stats": { "showRating": boolean, "showReviewCount": boolean } | null,
  "services": [ { "icon": IconName, "title": string<=80, "description": string<=320 } ]   // 4 to 8 items
  "testimonials": [ { "quote": string<=400, "attribution": string<=120 } ]                 // 0 to 4 items
  "contact": { "headline": string<=60, "address": string|null, "phone": string|null, "whatsapp": string|null, "hours": string|null },
  "proposalIntro": { "salutation": string<=120, "pitch": string<=1000 },
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

Return ONLY the JSON object.`;
}

export function buildUserPrompt(input: GeneratorInput): string {
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

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

export async function generateSiteContent(
  input: GeneratorInput,
): Promise<SiteContent> {
  const raw = await callAIWithProvider('anthropic', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
    json: true,
  });

  const parsed = parseAndValidate(raw);
  if (parsed.ok) return parsed.value;

  // First validation failure — retry once with a corrective system message
  const correctiveRaw = await callAIWithProvider('anthropic', {
    systemPrompt: `${buildSystemPrompt()}\n\nIMPORTANT: Your previous response failed validation: ${parsed.error}. Return ONLY valid JSON matching the schema exactly.`,
    userPrompt: buildUserPrompt(input),
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
