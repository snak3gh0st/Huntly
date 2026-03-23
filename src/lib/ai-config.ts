import { env } from '../config.js';

/** Runtime config — mutable so the dashboard can switch settings without restart. */
export const runtimeConfig = {
  aiProvider: env.AI_PROVIDER as 'ollama' | 'groq' | 'openai',
  ollamaModel: env.OLLAMA_MODEL,
  ollamaUrl: env.OLLAMA_URL,
  emailEnabled: env.EMAIL_ENABLED,
};
