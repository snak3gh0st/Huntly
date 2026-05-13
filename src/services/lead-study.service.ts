import { z } from 'zod';
import { callAnthropicVision } from '../lib/ai.js';
import { crawlWebsite } from './crawler.service.js';
import { captureScreenshot } from '../lib/screenshot.js';
import type { GeneratorInput } from './proposal-generator.service.js';

/* ------------------------------------------------------------------ */
/*  Schema                                                              */
/* ------------------------------------------------------------------ */

export const LeadStudySchema = z.object({
  currentSite: z.object({
    hasWebsite: z.boolean(),
    domain: z.string().nullable(),
    extractedHeadlines: z.array(z.string().max(200)).max(10),
    extractedServices: z.array(z.string().max(120)).max(15),
    designAssessment: z.string().min(1).max(800),
    weaknesses: z.array(z.string().max(200)).min(3).max(7),
    missingFeatures: z.array(z.string().max(120)).min(2).max(6),
    copyToneNow: z.string().min(1).max(200),
  }),
  business: z.object({
    actualServices: z.array(z.string().max(120)).min(2).max(10),
    targetCustomers: z.string().min(1).max(300),
    uniqueAngles: z.array(z.string().max(200)).min(2).max(5),
    locationContext: z.string().min(1).max(300),
  }),
  voice: z.object({
    customerLanguage: z.array(z.string().max(200)).max(6),
    keyPainPoints: z.array(z.string().max(200)).max(6),
    keyAspirations: z.array(z.string().max(200)).max(6),
  }),
});

export type LeadStudy = z.infer<typeof LeadStudySchema>;

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                 */
/* ------------------------------------------------------------------ */

function buildStudySystemPrompt(): string {
  return `You are a forensic investigator analyzing a small business's current online presence to inform a website rebuild.

You will receive their current website's content (if available) plus their Google reviews and enrichment data.
You may also receive a screenshot of the lead's current website as an image. If you do, analyze the visual style — name the design era specifically (e.g. "2015-era Bootstrap", "late-2000s template", "WordPress default"), describe the color palette ("navy + gold, lots of stock photography"), call out specific layout failures ("hero is a 400px stock image with no headline above the fold"). Feed these observations into currentSite.designAssessment and currentSite.weaknesses. Be specific — vague assessments like "dated design" are not useful.

Output STRICT JSON ONLY matching this schema. No markdown. No prose around the JSON. No comments.

Schema:
{
  "currentSite": {
    "hasWebsite": boolean,
    "domain": string | null,
    "extractedHeadlines": string[]   // h1/h2/hero copy directly from their site, max 10 items, each <=200 chars
    "extractedServices": string[]    // services they explicitly list on their site, max 15 items, each <=120 chars
    "designAssessment": string,      // 2-5 sentences on the design quality, era, color palette, layout issues — up to 800 chars; more specific when screenshot provided
    "weaknesses": string[],          // 3 to 7 specific weaknesses grounded in the crawled content or absence of it
    "missingFeatures": string[],     // 2 to 6 features absent from their site (booking, chat, social embeds, mobile UX, etc.)
    "copyToneNow": string            // 1 sentence describing current copy tone, <=200 chars
  },
  "business": {
    "actualServices": string[],      // 2 to 10 services evidenced by their site or reviews, each <=120 chars
    "targetCustomers": string,       // 1-2 sentences: who they serve, <=300 chars
    "uniqueAngles": string[],        // 2 to 5 things that genuinely set them apart, each <=200 chars
    "locationContext": string        // city/region context relevant to the website copy, <=300 chars
  },
  "voice": {
    "customerLanguage": string[],    // phrases customers actually use in reviews (direct quotes or close paraphrases), max 6, each <=200 chars
    "keyPainPoints": string[],       // frustrations customers mention in reviews, max 6, each <=200 chars
    "keyAspirations": string[]       // what customers want from this business, max 6, each <=200 chars
  }
}

Rules:
- Be specific and evidence-based. Never invent weaknesses or missing features without grounding in the data provided.
- Where evidence is missing: set "hasWebsite": false if no crawl data; leave arrays at their minimum length.
- "weaknesses" must be specific to THIS business's site, not generic observations.
- "extractedHeadlines" must be copied verbatim (or very close) from the crawled content — not invented.
- "extractedServices" must reflect services the business explicitly lists, not inferred guesses.
- "customerLanguage" must come from actual review text provided — no fabrication.
- All string fields must respect their character limits — count carefully.
- Return ONLY the JSON object.`;
}

function buildStudyUserPrompt(input: GeneratorInput, crawledContent: string | null, hasWebsite: boolean): string {
  const lines: string[] = [];

  lines.push('=== BUSINESS BASICS ===');
  lines.push(`Name: ${input.businessName}`);
  lines.push(`Category: ${input.category}`);
  lines.push(`Region: ${input.region}`);
  if (input.websiteUrl) lines.push(`Website URL: ${input.websiteUrl}`);
  if (input.ownerName) lines.push(`Owner: ${input.ownerName}`);
  const rating = input.googleRating ?? null;
  const reviewCount = input.googleReviewCount ?? 0;
  lines.push(`Google rating: ${rating ?? 'N/A'} stars, ${reviewCount} reviews`);

  lines.push('');
  lines.push('=== ENRICHMENT SIGNALS ===');
  lines.push(`Has chatbot: ${input.hasChatbot ?? 'unknown'}`);
  lines.push(`Has online booking: ${input.hasOnlineBooking ?? 'unknown'}`);
  lines.push(`Has WhatsApp: ${input.hasWhatsapp ?? 'unknown'}`);

  if (input.reviewSentimentSummary) {
    lines.push(`Review sentiment summary: ${input.reviewSentimentSummary}`);
  }

  if (input.painSignals.length > 0) {
    lines.push('');
    lines.push('=== REVIEW PAIN SIGNALS ===');
    for (const p of input.painSignals) {
      lines.push(`  - ${p.signal} (${p.count}x): "${p.example}"`);
    }
  }

  if (input.personalizedHook) {
    lines.push('');
    lines.push(`=== QUALIFIER HOOK ===`);
    lines.push(input.personalizedHook);
  }

  lines.push('');
  if (hasWebsite && crawledContent) {
    lines.push('=== CRAWLED WEBSITE CONTENT ===');
    lines.push(crawledContent);
  } else {
    lines.push('=== CRAWLED WEBSITE CONTENT ===');
    lines.push('(No website content available — crawl failed or no website found.)');
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Parse + validate helper                                            */
/* ------------------------------------------------------------------ */

function parseAndValidateStudy(
  raw: string,
): { ok: true; value: LeadStudy } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `JSON parse failed: ${(err as Error).message}` };
  }
  const parsed = LeadStudySchema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.message };
}

/* ------------------------------------------------------------------ */
/*  Layer 1 — studyLead                                                */
/* ------------------------------------------------------------------ */

export async function studyLead(input: GeneratorInput): Promise<LeadStudy> {
  // Attempt to crawl the lead's website
  let crawledContent: string | null = null;
  let hasWebsite = false;

  if (input.websiteUrl) {
    try {
      const crawlResult = await crawlWebsite(input.websiteUrl);

      // Build a structured content block for the Study prompt
      const parts: string[] = [];

      if (crawlResult.homepageText) {
        hasWebsite = true;
        parts.push(`--- PAGE TEXT (truncated) ---\n${crawlResult.homepageText.slice(0, 6000)}`);
      }

      if (crawlResult.headings.length > 0) {
        hasWebsite = true;
        parts.push(`--- HEADINGS (h1/h2) ---\n${crawlResult.headings.join('\n')}`);
      }

      if (crawlResult.pageLinks.length > 0) {
        parts.push(`--- NAV / LINK TEXTS ---\n${crawlResult.pageLinks.join('\n')}`);
      }

      parts.push(`--- TECH SIGNALS ---`);
      parts.push(`Chatbot detected: ${crawlResult.hasChatbot ?? 'unknown'}`);
      parts.push(`Online booking detected: ${crawlResult.hasOnlineBooking ?? 'unknown'}`);
      parts.push(`WhatsApp detected: ${crawlResult.hasWhatsapp ?? 'unknown'}`);
      if (crawlResult.techSignals.spaDetected) {
        parts.push('Note: site appears to be a JavaScript SPA — limited HTML content extracted.');
      }

      crawledContent = parts.join('\n\n');

      // If we couldn't extract any meaningful text/headings, treat as no website
      if (!hasWebsite) {
        hasWebsite = false;
      }
    } catch {
      // Crawl failed (timeout, 4xx, 5xx) — proceed with no site content
      hasWebsite = false;
    }
  }

  // Attempt to capture a screenshot for vision-based design assessment (best-effort)
  let screenshot: { base64: string; mimeType: 'image/png' } | null = null;
  if (input.websiteUrl) {
    screenshot = await captureScreenshot(input.websiteUrl);
  }

  const systemPrompt = buildStudySystemPrompt();
  const userPrompt = buildStudyUserPrompt(input, crawledContent, hasWebsite);

  const raw = await callAnthropicVision({
    systemPrompt,
    userPrompt,
    imageBase64: screenshot?.base64,
    imageMimeType: screenshot?.mimeType,
    json: true,
  });

  const parsed = parseAndValidateStudy(raw);
  if (parsed.ok) return parsed.value;

  // One retry on validation failure
  const correctiveRaw = await callAnthropicVision({
    systemPrompt: `${systemPrompt}\n\nIMPORTANT: Your previous response failed validation: ${parsed.error}. Return ONLY valid JSON matching the schema exactly.`,
    userPrompt,
    imageBase64: screenshot?.base64,
    imageMimeType: screenshot?.mimeType,
    json: true,
  });

  const retried = parseAndValidateStudy(correctiveRaw);
  if (retried.ok) return retried.value;

  throw new Error(`Lead study failed validation twice: ${retried.error}`);
}
