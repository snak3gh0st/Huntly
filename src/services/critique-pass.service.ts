import { z } from 'zod';
import { callAIWithProvider } from '../lib/ai.js';
import type { SiteContent } from './proposal-generator.service.js';
import type { LeadStudy } from './lead-study.service.js';
import type { Strategy } from './lead-strategy.service.js';

/* ------------------------------------------------------------------ */
/*  Schema                                                              */
/* ------------------------------------------------------------------ */

export const CritiqueSchema = z.object({
  overallScore: z.number().min(0).max(10),
  issues: z.array(z.object({
    field:       z.string(),           // e.g. "brand.tagline", "services[1].title", "diagnosis.bullets[2].evidence"
    severity:    z.enum(['critical', 'important', 'minor']),
    issue:       z.string().max(200),
    suggestion:  z.string().max(400),
  })).max(8),
  applyFix: z.array(z.object({
    field:    z.string(),              // dot + index path, same format as issues[].field
    newValue: z.string().max(800),
  })).max(8),
});

export type Critique = z.infer<typeof CritiqueSchema>;

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                 */
/* ------------------------------------------------------------------ */

function buildCritiqueSystemPrompt(): string {
  return `You are reviewing a generated website proposal for a small US business. The content was created by an AI pipeline. Your job is to find the top issues (max 8) where the copy is generic, doesn't reflect the business's actual data, violates the project's copy bans, or could directly hurt conversion.

Only flag an issue if you have a clearly better specific replacement. Don't churn for the sake of it. If the content is already high quality and specific, return an empty issues array and overallScore 9+.

Copy bans that are automatic "critical" issues:
- Generic affirmation phrases: "your trusted partner", "committed to excellence", "we go above and beyond", "passionate about", "dedicated to providing", "second to none", "your one-stop shop"
- Fabricated trust signals: "trusted by thousands", "X+ happy customers", "since 19XX" (unless year is in Study data), "5-star rated" (unless Google rating is 5.0)
- SaaS triplet copy: "simple. powerful. modern." or any three-word stacked tagline with periods
- Em-dashes (—) or double hyphens (--)
- "the future of [vertical]" framing
- Any line that could apply to any business in the category rather than THIS specific business

"important" issues: copy that is technically legal but noticeably weaker than what the Study/Strategy data supports — vague service descriptions when specific evidence exists, testimonial quotes that don't feel like real customer language, diagnosis evidence that doesn't tie back to specific study data.

"minor" issues: small improvements that would tighten the copy or better reflect the brand voice.

For applyFix: only include fixes you are confident in. The path format is dot notation with array indices for arrays, e.g.:
  "brand.tagline"
  "services[2].description"
  "diagnosis.bullets[0].evidence"
  "pricingPitch.valueBullets[1]"
  "cta.primaryLabel"

Output STRICT JSON ONLY:
{
  "overallScore": number (0-10),
  "issues": [
    { "field": string, "severity": "critical"|"important"|"minor", "issue": string<=200, "suggestion": string<=400 }
  ],
  "applyFix": [
    { "field": string, "newValue": string<=800 }
  ]
}

Return ONLY the JSON object. No markdown. No prose.`;
}

function buildCritiqueUserPrompt(
  content: SiteContent,
  study: LeadStudy,
  strategy: Strategy,
): string {
  return `=== GENERATED SITE CONTENT ===
${JSON.stringify(content, null, 2)}

=== STUDY (Layer 1 — evidence base) ===
${JSON.stringify(study, null, 2)}

=== STRATEGY (Layer 2 — brand direction) ===
${JSON.stringify(strategy, null, 2)}`;
}

/* ------------------------------------------------------------------ */
/*  Deep path-set helper                                               */
/* ------------------------------------------------------------------ */

/**
 * Set a value at a dot-notation path with array index support.
 * e.g. "services[2].description", "brand.tagline", "diagnosis.bullets[0].evidence"
 *
 * Returns a new object (shallow-copies along the path) or the original
 * object if the path is invalid/out-of-bounds (defensive — never throws).
 */
function setAtPath(obj: unknown, path: string, value: string): unknown {
  try {
    // Parse path into segments: "services[2].description" → ["services", "2", "description"]
    const segments = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);

    if (segments.length === 0) return obj;

    function setDeep(current: unknown, segs: string[]): unknown {
      if (segs.length === 0) return value;

      const [head, ...rest] = segs as [string, ...string[]];

      if (Array.isArray(current)) {
        const idx = parseInt(head, 10);
        if (isNaN(idx) || idx < 0 || idx >= current.length) return current;
        const copy = [...current];
        copy[idx] = setDeep(copy[idx], rest);
        return copy;
      }

      if (current !== null && typeof current === 'object') {
        const rec = current as Record<string, unknown>;
        if (!(head in rec)) return current;  // path doesn't exist — skip silently
        return { ...rec, [head]: setDeep(rec[head], rest) };
      }

      return current;  // can't descend further
    }

    return setDeep(obj, segments);
  } catch {
    return obj;  // any error — return original unchanged
  }
}

/* ------------------------------------------------------------------ */
/*  Parse + validate helper                                            */
/* ------------------------------------------------------------------ */

function parseAndValidate(
  raw: string,
): { ok: true; value: Critique } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const result = CritiqueSchema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.message };
}

/* ------------------------------------------------------------------ */
/*  critiquePass                                                        */
/* ------------------------------------------------------------------ */

export async function critiquePass(
  content: SiteContent,
  study: LeadStudy,
  strategy: Strategy,
): Promise<{ critique: Critique; appliedContent: SiteContent }> {
  const systemPrompt = buildCritiqueSystemPrompt();
  const userPrompt = buildCritiqueUserPrompt(content, study, strategy);

  const raw = await callAIWithProvider('anthropic', { systemPrompt, userPrompt, json: true });
  let firstResult = parseAndValidate(raw);

  if (!firstResult.ok) {
    // One retry on parse/validation failure
    const correctiveRaw = await callAIWithProvider('anthropic', {
      systemPrompt: `${systemPrompt}\n\nIMPORTANT: Your previous response failed validation: ${firstResult.error}. Return ONLY valid JSON matching the schema.`,
      userPrompt,
      json: true,
    });
    firstResult = parseAndValidate(correctiveRaw);
  }

  // If critique fails even after retry, return original content unchanged
  if (!firstResult.ok) {
    console.warn('[critique-pass] validation failed twice — returning original content unchanged');
    const emptyCritique: Critique = { overallScore: 0, issues: [], applyFix: [] };
    return { critique: emptyCritique, appliedContent: content };
  }

  const critique = firstResult.value;

  // Apply fixes: deep-merge each applyFix path into the content
  let patched: unknown = content;
  for (const fix of critique.applyFix) {
    patched = setAtPath(patched, fix.field, fix.newValue);
  }

  // Validate the patched content against SiteContentSchema before using it
  // Import here to avoid circular dependency via index.ts
  const { SiteContentSchema } = await import('./proposal-generator.service.js');
  const validation = SiteContentSchema.safeParse(patched);
  if (!validation.success) {
    // Patched content broke schema — fall back to original
    console.warn('[critique-pass] patched content failed SiteContentSchema — using original');
    return { critique, appliedContent: content };
  }

  return { critique, appliedContent: validation.data };
}
