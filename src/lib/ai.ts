import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { env } from '../config.js';
import { runtimeConfig } from './ai-config.js';

/* ------------------------------------------------------------------ */
/*  Provider clients (lazy — only created when needed)                 */
/* ------------------------------------------------------------------ */

let _groq: Groq | null = null;
function groq(): Groq {
  if (!_groq) {
    if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    _groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return _groq;
}

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _openai;
}

let _anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!_anthropic) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

/** Ollama client — recreated when URL changes at runtime. */
let _ollama: OpenAI | null = null;
let _ollamaUrl = '';
function ollama(): OpenAI {
  if (!_ollama || _ollamaUrl !== runtimeConfig.ollamaUrl) {
    _ollamaUrl = runtimeConfig.ollamaUrl;
    _ollama = new OpenAI({
      baseURL: `${_ollamaUrl}/v1`,
      apiKey: 'ollama',
    });
  }
  return _ollama;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
  /** Override the Anthropic model (default: claude-sonnet-4-6). */
  model?: string;
}

/** Options for vision-capable Anthropic calls with an optional image block. */
export interface AnthropicVisionOptions {
  systemPrompt: string;
  userPrompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  json?: boolean;
  model?: string;
}

type Provider = 'ollama' | 'groq' | 'openai';

/* ------------------------------------------------------------------ */
/*  Provider-specific call functions                                   */
/* ------------------------------------------------------------------ */

async function callOllama(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  const res = await ollama().chat.completions.create({
    model: runtimeConfig.ollamaModel,
    messages,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const content = res.choices[0]?.message?.content ?? '';
  if (opts.json && !content.trim()) throw new Error('Ollama returned empty response in JSON mode');
  return content;
}

async function callGroq(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  const res = await groq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const content = res.choices[0]?.message?.content ?? '';
  if (opts.json && !content.trim()) throw new Error('Groq returned empty response in JSON mode');
  return content;
}

async function callOpenAI(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  const res = await openai().chat.completions.create({
    model: 'gpt-4.1-mini',
    messages,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const content = res.choices[0]?.message?.content ?? '';
  if (opts.json && !content.trim()) throw new Error('OpenAI returned empty response in JSON mode');
  return content;
}

async function callAnthropic(opts: AiCallOptions): Promise<string> {
  // For JSON-mode requests, append a strong reminder to the user prompt.
  // Anthropic doesn't have response_format=json_object; the prompt is the contract.
  const userPrompt = opts.json
    ? `${opts.userPrompt}\n\nReturn ONLY valid JSON. No prose, no markdown fences.`
    : opts.userPrompt;

  const model = opts.model ?? 'claude-sonnet-4-6';

  // Opus 4.7+ deprecated the `temperature` parameter — only set it for older Sonnet/Haiku.
  const supportsTemperature = !/opus-4-[7-9]|opus-[5-9]/.test(model);

  const res = await anthropicClient().messages.create({
    model,
    max_tokens: 4096,
    ...(supportsTemperature ? { temperature: 0.4 } : {}),
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const block = res.content[0];
  const text = block && block.type === 'text' ? block.text : '';
  if (opts.json && !text.trim()) {
    throw new Error('Anthropic returned empty response in JSON mode');
  }
  return text;
}

/**
 * Vision-capable Anthropic call. Sends an optional image block before the text prompt.
 * Falls back to text-only if no image is provided. Always uses Anthropic directly —
 * no fallback chain, since vision is Anthropic-specific in this pipeline.
 */
export async function callAnthropicVision(opts: AnthropicVisionOptions): Promise<string> {
  const userText = opts.json
    ? `${opts.userPrompt}\n\nReturn ONLY valid JSON. No prose, no markdown fences.`
    : opts.userPrompt;

  const model = opts.model ?? 'claude-sonnet-4-6';

  type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  type ContentBlock =
    | { type: 'image'; source: { type: 'base64'; media_type: SupportedMimeType; data: string } }
    | { type: 'text'; text: string };

  const contentBlocks: ContentBlock[] = [];

  if (opts.imageBase64 && opts.imageMimeType) {
    // Only push the image block if the mime type is one Anthropic supports
    const supportedTypes: SupportedMimeType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mimeType = opts.imageMimeType as SupportedMimeType;
    if (supportedTypes.includes(mimeType)) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: opts.imageBase64,
        },
      });
    }
  }

  contentBlocks.push({ type: 'text', text: userText });

  const supportsTemperature = !/opus-4-[7-9]|opus-[5-9]/.test(model);

  const res = await anthropicClient().messages.create({
    model,
    max_tokens: 4096,
    ...(supportsTemperature ? { temperature: 0.4 } : {}),
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  const block = res.content[0];
  const text = block && block.type === 'text' ? block.text : '';
  if (opts.json && !text.trim()) {
    throw new Error('Anthropic vision call returned empty response in JSON mode');
  }
  return text;
}

/* ------------------------------------------------------------------ */
/*  Fallback chain                                                     */
/* ------------------------------------------------------------------ */

const CALL_MAP: Record<Provider, (opts: AiCallOptions) => Promise<string>> = {
  ollama: callOllama,
  groq: callGroq,
  openai: callOpenAI,
};

const FALLBACK_CHAIN: Record<Provider, Provider[]> = {
  ollama: ['ollama', 'groq', 'openai'],
  groq: ['groq', 'openai'],
  openai: ['openai'],
};

/**
 * Call AI with automatic fallback.
 * Reads provider from runtimeConfig (mutable at runtime via dashboard).
 */
export async function callAI(opts: AiCallOptions): Promise<string> {
  const chain = FALLBACK_CHAIN[runtimeConfig.aiProvider];

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]!;
    const callFn = CALL_MAP[provider];

    try {
      return await callFn(opts);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isLast = i === chain.length - 1;

      if (status === 401 || status === 403) {
        if (isLast) throw err;
        console.warn(`[ai] ${provider} auth error (${status}), trying next provider`);
        continue;
      }

      if (status === 429) {
        console.warn(`[ai] ${provider} rate limited, trying next provider`);
      } else {
        console.warn(`[ai] ${provider} failed: ${(err as Error).message}${isLast ? '' : ', trying next provider'}`);
      }

      if (isLast) throw err;
    }
  }

  throw new Error('All AI providers failed');
}

/**
 * Call a specific provider, bypassing the runtime-configured fallback chain.
 * Use for paths that must NOT silently fall back (e.g. proposal generation must
 * use Claude — falling back to a weaker model defeats the purpose).
 *
 * Pass `opts.model` to override the default model for Anthropic calls.
 */
export async function callAIWithProvider(
  provider: 'ollama' | 'groq' | 'openai' | 'anthropic',
  opts: AiCallOptions,
): Promise<string> {
  switch (provider) {
    case 'ollama':    return callOllama(opts);
    case 'groq':      return callGroq(opts);
    case 'openai':    return callOpenAI(opts);
    case 'anthropic': return callAnthropic(opts);
  }
}
