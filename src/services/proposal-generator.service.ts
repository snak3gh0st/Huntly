import { z } from 'zod';
import type { DesignDirection } from './design-direction.service.js';

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
    tagline:     z.string().min(1).max(160),
    description: z.string().min(1).max(800),
    manifesto:   z.string().min(1).max(280).optional(),
  }),
  hero: z.object({
    imageQuery:          z.string().min(1).max(80),
    ctaLabel:            z.string().min(1).max(40),
    ctaAction:           z.enum(['call', 'email', 'scroll-to-form']),
    secondaryCtaLabel:   z.string().min(1).max(40).optional(),
  }),
  stats: z.object({
    showRating:      z.boolean(),
    showReviewCount: z.boolean(),
    thirdMetric:     z.string().min(1).max(60).optional(),
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
  // New sections generated when Design Direction includes them
  process: z.object({
    title: z.string().min(1).max(120),
    steps: z.array(z.object({
      number:      z.string().min(1).max(3),
      title:       z.string().min(1).max(80),
      description: z.string().min(1).max(320),
    })).min(3).max(5),
  }).optional(),
  hoursLocations: z.object({
    headline:     z.string().min(1).max(80),
    addressLines: z.array(z.string().min(1).max(200)).max(4),
    hours:        z.array(z.object({
      day:   z.string().min(1).max(20),
      range: z.string().min(1).max(40),
    })).max(7),
  }).optional(),
  faq: z.object({
    headline: z.string().min(1).max(120),
    items:    z.array(z.object({
      question: z.string().min(1).max(200),
      answer:   z.string().min(1).max(400),
    })).min(3).max(6),
  }).optional(),
  ctaBanner: z.object({
    headline:     z.string().min(1).max(160),
    subheadline:  z.string().min(1).max(240),
    ctaLabel:     z.string().min(1).max(40),
    ctaAction:    z.enum(['call', 'email', 'scroll-to-form']),
  }).optional(),
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
      label:    z.string().min(1).max(200),
      evidence: z.string().min(1).max(400),
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
- Design era: ${study.currentSite.designAudit.era}
- Design hierarchy issues: ${study.currentSite.designAudit.hierarchy}
- Layout failures: ${study.currentSite.designAudit.layoutFailures.join('; ')}
- Copy headline: ${study.currentSite.copyAudit.headline}
- CTA quality: ${study.currentSite.copyAudit.ctaQuality}
- Weasel words found: ${study.currentSite.copyAudit.weasel_words.join(', ')}
- Missing messaging: ${study.currentSite.copyAudit.missingMessaging.join('; ')}
- Trust gaps: ${study.currentSite.conversionAudit.trustGaps.join('; ')}
- Conversion booking flow: ${study.currentSite.conversionAudit.bookingFlow}
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
  "brand": { "tagline": string<=160, "description": string<=800, "manifesto": string<=280 },
  "hero": { "imageQuery": string<=80, "ctaLabel": string<=40, "ctaAction": "call"|"email"|"scroll-to-form", "secondaryCtaLabel": string<=40 (optional, default "See why") },
  "stats": { "showRating": boolean, "showReviewCount": boolean, "thirdMetric": string<=60 (optional, e.g. "12 years in Austin" or "Bilingual service") } | null,
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
    - \`diagnosis.bullets\` must come from the Study's \`currentSite.designAudit.layoutFailures\`, \`copyAudit.weasel_words\`, \`conversionAudit.trustGaps\`, \`currentSite.weaknesses\`, and Strategy's \`conversionOpportunities.gap\`. Each bullet's \`evidence\` is the concrete observation from the forensic audit — quote specific failures (e.g. "Hero headline reads 'Your trusted partner since 2010' — a phrase that matches zero actual customer motivations") not generic copy.
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
/*  Per-section sub-schemas for 3-call split                          */
/* ------------------------------------------------------------------ */

/** Section 1: top-of-page brand + hero content */
const HeroAndBrandSchema = z.object({
  brand: z.object({
    tagline:     z.string().min(1).max(160),
    description: z.string().min(1).max(800),
    manifesto:   z.string().min(1).max(280).optional(),
  }),
  hero: z.object({
    imageQuery:        z.string().min(1).max(80),
    ctaLabel:          z.string().min(1).max(40),
    ctaAction:         z.enum(['call', 'email', 'scroll-to-form']),
    secondaryCtaLabel: z.string().min(1).max(40).optional(),
  }),
  stats: z.object({
    showRating:      z.boolean(),
    showReviewCount: z.boolean(),
    thirdMetric:     z.string().min(1).max(60).optional(),
  }).nullable(),
});
type HeroAndBrand = z.infer<typeof HeroAndBrandSchema>;

/** Section 2: middle-of-page services + social proof */
const MidSectionsSchema = z.object({
  services: z.array(z.object({
    icon:        z.enum(ICON_NAMES),
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
});
type MidSections = z.infer<typeof MidSectionsSchema>;

/** Section 3: bottom-of-page sales chrome */
const ClosingSectionsSchema = z.object({
  diagnosis: z.object({
    bullets: z.array(z.object({
      icon:     z.enum(ICON_NAMES),
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
type ClosingSections = z.infer<typeof ClosingSectionsSchema>;

/** Section 4: extended sections driven by Design Direction plan */
const ExtendedSectionsSchema = z.object({
  process: z.object({
    title: z.string().min(1).max(120),
    steps: z.array(z.object({
      number:      z.string().min(1).max(3),
      title:       z.string().min(1).max(80),
      description: z.string().min(1).max(320),
    })).min(3).max(5),
  }).optional(),
  hoursLocations: z.object({
    headline:     z.string().min(1).max(80),
    addressLines: z.array(z.string().min(1).max(200)).max(4),
    hours:        z.array(z.object({
      day:   z.string().min(1).max(20),
      range: z.string().min(1).max(40),
    })).max(7),
  }).optional(),
  faq: z.object({
    headline: z.string().min(1).max(120),
    items:    z.array(z.object({
      question: z.string().min(1).max(200),
      answer:   z.string().min(1).max(400),
    })).min(3).max(6),
  }).optional(),
  ctaBanner: z.object({
    headline:    z.string().min(1).max(160),
    subheadline: z.string().min(1).max(240),
    ctaLabel:    z.string().min(1).max(40),
    ctaAction:   z.enum(['call', 'email', 'scroll-to-form']),
  }).optional(),
});
type ExtendedSections = z.infer<typeof ExtendedSectionsSchema>;

/* ------------------------------------------------------------------ */
/*  Shared rules block (injected into every section prompt)            */
/* ------------------------------------------------------------------ */

function sharedRules(): string {
  return `Global rules that apply to ALL sections:
- LANGUAGE: English only.
- COPY BANS: No "your trusted partner", "committed to excellence", "we go above and beyond", "passionate about", "dedicated to providing", "second to none", "your one-stop shop", "the difference is in the details". No "trusted by thousands", fabricated stats, or "since 19XX" unless year is in the data. No SaaS triplet copy (e.g. "simple. powerful. modern."). No em-dashes (—) or double hyphens (--). No "the future of [vertical]" framing.
- SPECIFIC OVER GENERIC: every copy line must tie to a concrete signal from the lead's data. A line that could apply to any business in this category is wrong.
- CHARACTER LIMITS ARE HARD CONSTRAINTS enforced by validation. Condense before returning — never exceed a field's limit.
- NEVER make medical, legal, financial, or regulated-industry claims.
- Return ONLY the JSON object. No markdown. No prose around the JSON. No comments.`;
}

function studyStrategySummary(study?: LeadStudy, strategy?: Strategy): string {
  if (!study || !strategy) return '';
  return `
=== STUDY + STRATEGY (foundation for all copy) ===
Business: ${study.business.actualServices.join(', ')}
Target customers: ${study.business.targetCustomers}
Unique angles: ${study.business.uniqueAngles.join('; ')}
Location: ${study.business.locationContext}
Customer language: ${study.voice.customerLanguage.join('; ')}
Key pain points: ${study.voice.keyPainPoints.join('; ')}
Key aspirations: ${study.voice.keyAspirations.join('; ')}
Design era: ${study.currentSite.designAudit.era}
Layout failures: ${study.currentSite.designAudit.layoutFailures.join('; ')}
Weasel words: ${study.currentSite.copyAudit.weasel_words.join(', ')}
Trust gaps: ${study.currentSite.conversionAudit.trustGaps.join('; ')}
Current weaknesses: ${study.currentSite.weaknesses.join('; ')}
Missing features: ${study.currentSite.missingFeatures.join('; ')}
Hero angle: ${strategy.heroAngle}
Copy tone: ${strategy.copyTone}
Manifesto seed: ${strategy.manifestoSeed}
Conversion opportunities: ${strategy.conversionOpportunities.map((c) => `[${c.gap}] → [${c.fix}]`).join('; ')}`;
}

/* ------------------------------------------------------------------ */
/*  Generic retry wrapper for per-section calls                       */
/* ------------------------------------------------------------------ */

function makeSectionParser<T>(
  schema: z.ZodType<T>,
): (raw: string) => { ok: true; value: T } | { ok: false; error: string } {
  return (raw) => {
    let json: unknown;
    try { json = JSON.parse(raw); } catch (err) {
      return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
    }
    const result = schema.safeParse(json);
    if (result.success) return { ok: true, value: result.data };
    return { ok: false, error: result.error.message };
  };
}

async function callWithRetry<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  sectionName: string,
): Promise<T> {
  const parse = makeSectionParser(schema);

  const raw = await callAIWithProvider('anthropic', { systemPrompt, userPrompt, json: true });
  const first = parse(raw);
  if (first.ok) return first.value;

  const correctiveRaw = await callAIWithProvider('anthropic', {
    systemPrompt: `${systemPrompt}\n\nIMPORTANT: Your previous response failed validation: ${first.error}. Return ONLY valid JSON matching the schema exactly.`,
    userPrompt,
    json: true,
  });
  const second = parse(correctiveRaw);
  if (second.ok) return second.value;

  throw new Error(`${sectionName} generation failed validation twice: ${second.error}`);
}

/* ------------------------------------------------------------------ */
/*  Section 1 — Hero + Brand                                          */
/* ------------------------------------------------------------------ */

function directionSummary(direction?: DesignDirection): string {
  if (!direction) return '';
  const sectionList = direction.sectionsInOrder.map((s) => `  - ${s.type}: ${s.contentEmphasis}`).join('\n');
  return `
=== DESIGN DIRECTION (Layer 2.7) ===
Section plan (in order): ${direction.sectionsInOrder.map((s) => s.type).join(', ')}
Microcopy direction: ${direction.microcopyDirection}
Signature moves: ${direction.signatureMoves.join('; ')}
Per-section content emphases:
${sectionList}`;
}

async function generateHeroAndBrand(
  input: GeneratorInput,
  study?: LeadStudy,
  strategy?: Strategy,
  direction?: DesignDirection,
): Promise<HeroAndBrand> {
  const systemPrompt = `You are writing the top-of-page content (brand identity + hero) for a small US business website.
${studyStrategySummary(study, strategy)}${directionSummary(direction)}

Output STRICT JSON matching this schema:
{
  "brand": { "tagline": string<=160, "description": string<=800, "manifesto": string<=280 (optional) },
  "hero": { "imageQuery": string<=80, "ctaLabel": string<=40, "ctaAction": "call"|"email"|"scroll-to-form", "secondaryCtaLabel": string<=40 (optional) },
  "stats": { "showRating": boolean, "showReviewCount": boolean, "thirdMetric": string<=60 (optional) } | null
}

Section rules:
- brand.tagline: punchy, specific to this business, not generic. Grounded in Strategy heroAngle.
- brand.description: 2-3 sentences expanding the tagline. Mirror Strategy copyTone and Study voice.customerLanguage. The Design Direction's microcopyDirection should inform the voice.
- brand.manifesto: crystallize Strategy manifestoSeed into one powerful sentence. Optional but preferred.
- hero.imageQuery: 2-5 word Unsplash search phrase, vertical+location specific. No people queries.
- hero.ctaAction: "call" for high-intent phone verticals, "email" for B2B/consultants, "scroll-to-form" otherwise.
- hero.ctaLabel: follow the Design Direction's microcopyDirection — avoid "Get started", "Learn more", "Click here".
- stats: null if Google rating < 4.0 OR review count < 25. Otherwise include showRating+showReviewCount=true.
- PRICING MODEL: one-time investment, never "per month", "subscription", "monthly billing".

${sharedRules()}`;

  const userPrompt = buildUserPrompt(input, study, strategy);
  return callWithRetry(HeroAndBrandSchema, systemPrompt, userPrompt, 'Section 1 (hero+brand)');
}

/* ------------------------------------------------------------------ */
/*  Section 2 — Mid-page: Services + Testimonials + Contact           */
/* ------------------------------------------------------------------ */

async function generateMidSections(
  input: GeneratorInput,
  study?: LeadStudy,
  strategy?: Strategy,
  direction?: DesignDirection,
): Promise<MidSections> {
  const systemPrompt = `You are writing the middle sections (services, testimonials, contact) for a small US business website.
${studyStrategySummary(study, strategy)}${directionSummary(direction)}

Output STRICT JSON matching this schema:
{
  "services": [ { "icon": IconName, "title": string<=80, "description": string<=320 } ],  // 4 to 8 items
  "testimonials": [ { "quote": string<=400, "attribution": string<=120 } ],               // 0 to 4 items
  "contact": { "headline": string<=60, "address": string|null, "phone": string|null, "whatsapp": string|null, "hours": string|null }
}
Where IconName is one of: phone, calendar, globe, message, clock, star, shield, zap, mail, mapPin.

Section rules:
- services: use Study business.actualServices as the source. These are the lead's REAL services. 4 minimum, 8 maximum.
- services.description: what the service does for the customer, in customer language. No generic "We offer..." opener. Follow the Design Direction's contentEmphasis for the services section.
- testimonials: ONLY quote snippets that appear in the Study voice.customerLanguage data. NEVER fabricate. Empty array if none.
- contact: use null (not empty string) for unknown fields. Pull from input data (phone, address, hours).

${sharedRules()}`;

  const userPrompt = buildUserPrompt(input, study, strategy);
  return callWithRetry(MidSectionsSchema, systemPrompt, userPrompt, 'Section 2 (mid-page)');
}

/* ------------------------------------------------------------------ */
/*  Section 3 — Closing: Diagnosis + Pricing + CTA                   */
/* ------------------------------------------------------------------ */

async function generateClosingSections(
  input: GeneratorInput,
  study?: LeadStudy,
  strategy?: Strategy,
): Promise<ClosingSections> {
  const systemPrompt = `You are writing the bottom-of-page sales sections (diagnosis, pricing pitch, CTA) for a small US business website proposal.
${studyStrategySummary(study, strategy)}

Output STRICT JSON matching this schema:
{
  "diagnosis": { "bullets": [ { "icon": IconName, "label": string<=120, "evidence": string<=320 } ] },  // 2 to 5 bullets
  "pricingPitch": { "headline": string<=160, "valueBullets": [ string<=160 ] },                          // 2 to 4 bullets
  "cta": { "primaryLabel": string<=40, "reassurance": string<=120 }
}
Where IconName is one of: phone, calendar, globe, message, clock, star, shield, zap, mail, mapPin.

Section rules:
- diagnosis.bullets: each bullet exposes a specific flaw in the lead's CURRENT online presence. Use Study weaknesses and Strategy conversionOpportunities.gap as the source. Each evidence field is the customer-observable consequence of that flaw. 2 minimum, 5 maximum.
  - If Study says hasWebsite: false, focus bullets on absence of a site, not weaknesses.
- pricingPitch.headline: frame as a one-time investment or year-one package. Never "per month", "subscription", "recurring".
- pricingPitch.valueBullets: 2-4 short lines each <=160 chars. What the lead gets for their money.
- cta: primaryLabel is the button text (action-oriented). reassurance is the quiet sub-line reducing friction.

${sharedRules()}`;

  const userPrompt = buildUserPrompt(input, study, strategy);
  return callWithRetry(ClosingSectionsSchema, systemPrompt, userPrompt, 'Section 3 (closing)');
}

/* ------------------------------------------------------------------ */
/*  Section 4 — Extended sections (process / hoursLocations / faq /   */
/*              ctaBanner) — only called when direction includes them  */
/* ------------------------------------------------------------------ */

async function generateExtendedSections(
  input: GeneratorInput,
  study: LeadStudy | undefined,
  strategy: Strategy | undefined,
  direction: DesignDirection,
): Promise<ExtendedSections> {
  const neededTypes = direction.sectionsInOrder.map((s) => s.type);
  const needsProcess        = neededTypes.includes('process');
  const needsHoursLocations = neededTypes.includes('hours-locations');
  const needsFaq            = neededTypes.includes('faq');
  const needsCtaBanner      = neededTypes.includes('cta-banner');

  const sectionSchemas: string[] = [];
  if (needsProcess) {
    sectionSchemas.push(`  "process": { "title": string<=120, "steps": [ { "number": string (e.g. "01"), "title": string<=80, "description": string<=320 } ] }  // 3-5 steps`);
  }
  if (needsHoursLocations) {
    sectionSchemas.push(`  "hoursLocations": { "headline": string<=80, "addressLines": string[] (max 4, each <=200), "hours": [ { "day": string<=20, "range": string<=40 } ] }  // 0-7 day entries`);
  }
  if (needsFaq) {
    sectionSchemas.push(`  "faq": { "headline": string<=120, "items": [ { "question": string<=200, "answer": string<=400 } ] }  // 3-6 items`);
  }
  if (needsCtaBanner) {
    sectionSchemas.push(`  "ctaBanner": { "headline": string<=160, "subheadline": string<=240, "ctaLabel": string<=40, "ctaAction": "call"|"email"|"scroll-to-form" }`);
  }

  const systemPrompt = `You are writing extended sections for a small US business website proposal.
${studyStrategySummary(study, strategy)}${directionSummary(direction)}

Generate ONLY the sections requested below. Omit any section not listed.

Output STRICT JSON matching this schema:
{
${sectionSchemas.join(',\n')}
}

Section rules:
- process: describe how this specific business works — their actual methodology. 3 to 5 numbered steps. Numbers as strings: "01", "02", etc. Ground each step in what the Study tells us about their services and workflow.
- hoursLocations: derive from Study business.locationContext and contact data. addressLines: street, city, state, zip on separate lines. hours: each entry is one day-range pair (e.g. { "day": "Mon – Fri", "range": "8am – 6pm" }). If hours data is unavailable, use an empty array.
- faq: 3 to 6 Q&A pairs that a real customer of this business would ask. Ground questions in Study voice.keyPainPoints and voice.keyAspirations. Answers should be specific to this business, not generic.
- ctaBanner: a mid-page conversion moment. headline should be the strongest action statement for this lead. subheadline adds one line of context. ctaLabel follows the Design Direction microcopyDirection voice.

${sharedRules()}`;

  const userPrompt = buildUserPrompt(input, study, strategy);
  return callWithRetry(ExtendedSectionsSchema, systemPrompt, userPrompt, 'Section 4 (extended)');
}

/* ------------------------------------------------------------------ */
/*  Generator — parallel calls                                        */
/* ------------------------------------------------------------------ */

export async function generateSiteContent(
  input: GeneratorInput,
  study?: LeadStudy,
  strategy?: Strategy,
  direction?: DesignDirection,
): Promise<SiteContent> {
  // Determine which extended sections the direction plan includes
  const sectionTypes = new Set(direction?.sectionsInOrder.map((s) => s.type) ?? []);
  const needsProcess        = sectionTypes.has('process');
  const needsHoursLocations = sectionTypes.has('hours-locations');
  const needsFaq            = sectionTypes.has('faq');
  const needsCtaBanner      = sectionTypes.has('cta-banner');

  // Run all sections in parallel via Promise.all — faster and fine at typical proposal volumes.
  // If any section fails after its retry, the whole generation fails — no partial state.
  const [heroAndBrand, midSections, closingSections, extendedSections] = await Promise.all([
    generateHeroAndBrand(input, study, strategy, direction),
    generateMidSections(input, study, strategy, direction),
    generateClosingSections(input, study, strategy),
    (needsProcess || needsHoursLocations || needsFaq || needsCtaBanner)
      ? generateExtendedSections(input, study, strategy, direction!)
      : Promise.resolve(null),
  ]);

  // Merge into the final SiteContent shape — validate the merged result
  const merged: SiteContent = {
    brand:        heroAndBrand.brand,
    hero:         heroAndBrand.hero,
    stats:        heroAndBrand.stats,
    services:     midSections.services,
    testimonials: midSections.testimonials,
    contact:      midSections.contact,
    diagnosis:    closingSections.diagnosis,
    pricingPitch: closingSections.pricingPitch,
    cta:          closingSections.cta,
  };

  // Merge extended sections when generated
  if (extendedSections) {
    if (needsProcess && extendedSections.process)               merged.process        = extendedSections.process;
    if (needsHoursLocations && extendedSections.hoursLocations) merged.hoursLocations = extendedSections.hoursLocations;
    if (needsFaq && extendedSections.faq)                       merged.faq            = extendedSections.faq;
    if (needsCtaBanner && extendedSections.ctaBanner)           merged.ctaBanner      = extendedSections.ctaBanner;
  }

  // Final full-schema validation as a safety net
  const validation = SiteContentSchema.safeParse(merged);
  if (!validation.success) {
    throw new Error(`Merged SiteContent failed final validation: ${validation.error.message}`);
  }
  return validation.data;
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

// Re-exported for tests that call parseAndValidate indirectly via generateSiteContent
export { parseAndValidate as _parseAndValidateForTesting };
