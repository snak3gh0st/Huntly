import { z } from 'zod';
import { callAIWithProvider } from '../lib/ai.js';
import type { GeneratorInput } from './proposal-generator.service.js';
import type { LeadStudy } from './lead-study.service.js';

/* ------------------------------------------------------------------ */
/*  Schema                                                              */
/* ------------------------------------------------------------------ */

export const StrategySchema = z.object({
  heroAngle: z.string().min(1).max(220),
  conversionOpportunities: z.array(z.object({
    gap: z.string().min(1).max(200),
    fix: z.string().min(1).max(200),
  })).min(3).max(5),
  copyTone: z.string().min(1).max(300),
  designPriorities: z.array(z.string().max(200)).min(3).max(5),
  manifestoSeed: z.string().min(1).max(220),
});

export type Strategy = z.infer<typeof StrategySchema>;

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                 */
/* ------------------------------------------------------------------ */

function buildStrategySystemPrompt(): string {
  return `You are a senior brand strategist and conversion-rate-optimization specialist.

Given a deep study of a small business's current online presence and customer base, you will produce the strategic plan for their new website.

Output STRICT JSON ONLY matching this schema. No markdown. No prose around the JSON. No comments.

Schema:
{
  "heroAngle": string,                    // The single sentence anchoring the page — what makes this business worth hiring, <=220 chars
  "conversionOpportunities": [            // 3 to 5 items
    { "gap": string, "fix": string }      // gap: what's missing today (<=200 chars); fix: what the new site will do instead (<=200 chars)
  ],
  "copyTone": string,                     // 1-2 sentences on the voice that'll resonate with THEIR customers, <=300 chars
  "designPriorities": string[],           // 3 to 5 ordered design/UX priorities, most-impactful first, each <=200 chars
  "manifestoSeed": string                 // A seed sentence that Layer 3 will refine into the final one-line manifesto, <=220 chars
}

Rules:
1. HERO ANGLE — this is the single most important sentence. It must be specific to THIS business, grounded in the study's uniqueAngles and locationContext. BANNED phrases in heroAngle: "quality you can trust", "committed to excellence", "attention to detail", "trusted partner", "dedicated to", "passionate about", any generic affirmation.
2. CONVERSION OPPORTUNITIES — every "gap" must reference a specific weakness from the study's currentSite.weaknesses or missingFeatures. No generic gaps. 3 to 5 items required.
3. COPY TONE — must reference the actual language patterns from the study's voice.customerLanguage, not generic descriptors like "professional and friendly". Base it on how their customers actually talk.
4. DESIGN PRIORITIES — ordered by business impact. Ground each in the study's designAssessment or missingFeatures.
5. MANIFESTO SEED — a single compelling line that captures the core brand promise. Layer 3 will refine this into a one-sentence manifesto.
6. All string fields must respect their character limits — count carefully.
7. Return ONLY the JSON object.`;
}

function buildStrategyUserPrompt(input: GeneratorInput, study: LeadStudy): string {
  const lines: string[] = [];

  lines.push('=== BUSINESS BASICS ===');
  lines.push(`Name: ${input.businessName}`);
  lines.push(`Category: ${input.category}`);
  lines.push(`Region: ${input.region}`);
  const rating = input.googleRating ?? null;
  const reviewCount = input.googleReviewCount ?? 0;
  lines.push(`Google rating: ${rating ?? 'N/A'} stars, ${reviewCount} reviews`);

  lines.push('');
  lines.push('=== LEAD STUDY (Layer 1 output) ===');
  lines.push(JSON.stringify(study, null, 2));

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Parse + validate helper                                            */
/* ------------------------------------------------------------------ */

function parseAndValidateStrategy(
  raw: string,
): { ok: true; value: Strategy } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const parsed = StrategySchema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}

/* ------------------------------------------------------------------ */
/*  Layer 2 — strategize                                               */
/* ------------------------------------------------------------------ */

export async function strategize(input: GeneratorInput, study: LeadStudy): Promise<Strategy> {
  const systemPrompt = buildStrategySystemPrompt();
  const userPrompt = buildStrategyUserPrompt(input, study);

  const raw = await callAIWithProvider('anthropic', {
    systemPrompt,
    userPrompt,
    json: true,
  });

  const parsed = parseAndValidateStrategy(raw);
  if (parsed.ok) return parsed.value;

  // One retry on validation failure
  const correctiveRaw = await callAIWithProvider('anthropic', {
    systemPrompt: `${systemPrompt}\n\nIMPORTANT: Your previous response failed validation: ${parsed.error}. Return ONLY valid JSON matching the schema exactly.`,
    userPrompt,
    json: true,
  });

  const retried = parseAndValidateStrategy(correctiveRaw);
  if (retried.ok) return retried.value;

  throw new Error(`Lead strategy failed validation twice: ${retried.error}`);
}
