import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { env } from '../config.js';

export const groq = new Groq({ apiKey: env.GROQ_API_KEY });
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface AiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
}

/**
 * Call Groq first, fall back to GPT-4o-mini on 429 or error.
 * Surfaces auth errors (401/403) instead of silently falling back.
 * Returns parsed JSON string if json=true, raw string otherwise.
 */
export async function callAI(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    });
    const content = res.choices[0]?.message?.content ?? '';
    if (opts.json && !content.trim()) throw new Error('Groq returned empty response in JSON mode');
    return content;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;

    // Surface config errors — don't silently fall back
    if (status === 401 || status === 403) {
      throw new Error(`Groq auth error (${status}) — check GROQ_API_KEY`);
    }

    if (status === 429) {
      console.warn('[ai] Groq rate limited (429), waiting 10s then falling back to GPT-4o-mini');
      await new Promise(r => setTimeout(r, 10_000));
    } else {
      console.warn(`[ai] Groq failed (${status ?? 'unknown'}), falling back to GPT-4o-mini`);
    }

    // Fallback to OpenAI
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    });
    const content = res.choices[0]?.message?.content ?? '';
    if (opts.json && !content.trim()) throw new Error('OpenAI returned empty response in JSON mode');
    return content;
  }
}
