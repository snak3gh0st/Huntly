import { callAI } from '../lib/ai.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PainSignal {
  signal: string;
  count: number;
  example: string;
}

export interface ReviewAnalysis {
  sentimentSummary: string;
  painSignals: PainSignal[];
  positiveThemes: string[];
  totalAnalyzed: number;
}

/* ------------------------------------------------------------------ */
/*  Prompt                                                             */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are analyzing Google reviews for a business. Extract:
1. A 1-sentence sentiment summary
2. Pain signals customers mention (slow_response, hard_to_reach, hard_to_book, no_after_hours, no_online_booking, rude_staff, long_wait)
3. Positive themes

Return ONLY valid JSON:
{
  "sentimentSummary": "string",
  "painSignals": [{"signal": "string", "count": number, "example": "quote from review"}],
  "positiveThemes": ["string"],
  "totalAnalyzed": number
}`;

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export async function analyzeReviews(reviews: string[]): Promise<ReviewAnalysis> {
  if (reviews.length === 0) {
    return { sentimentSummary: '', painSignals: [], positiveThemes: [], totalAnalyzed: 0 };
  }

  const userPrompt = `Analyze these ${reviews.length} reviews:\n\n${reviews.map((r, i) => `${i + 1}. "${r}"`).join('\n')}`;

  const raw = await callAI({ systemPrompt: SYSTEM_PROMPT, userPrompt, json: true });

  try {
    return JSON.parse(raw) as ReviewAnalysis;
  } catch {
    // Retry once with stricter prompt
    const retryRaw = await callAI({
      systemPrompt: SYSTEM_PROMPT + '\nIMPORTANT: Return ONLY the JSON object, no markdown, no explanation.',
      userPrompt,
      json: true,
    });
    try {
      return JSON.parse(retryRaw) as ReviewAnalysis;
    } catch {
      // Skip review analysis entirely
      return { sentimentSummary: '', painSignals: [], positiveThemes: [], totalAnalyzed: 0 };
    }
  }
}
